import { query } from "../../state/db";

/**
 * signal.ts — Processes the signal_queue table.
 *
 * The signal_queue is written to by webhook.ts (lead captures), g2.ts, upwork.ts.
 * This processor runs every cycle to consume unprocessed signals before sensing adds more.
 */
export async function processSignalQueue(): Promise<number> {
  const signals = await query(
    `UPDATE signal_queue
     SET processed = TRUE, processed_at = NOW()
     WHERE id IN (
       SELECT id FROM signal_queue
       WHERE processed = FALSE
       ORDER BY created_at ASC
       LIMIT 50
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`
  );

  for (const signal of signals.rows) {
    const payload = signal.raw_payload || {};

    if (signal.source === "lead_capture") {
      // A real human submitted their email. This is oxygen.
      await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`, [
        "lead_signal_processed",
        {
          opportunity_id: payload.opportunity_id,
          email: payload.email,
          utm_source: payload.utm_source,
        },
      ]);

      // Notify Mission Control immediately
      await query(`SELECT pg_notify('organism_events', $1)`, [
        JSON.stringify({ type: "lead_processed", payload }),
      ]);
    }

    if (
      signal.source === "g2_reviews_agent" ||
      signal.source === "upwork"
    ) {
      // Sensor results that bypassed direct DB insert — process into opportunities
      await query(
        `INSERT INTO opportunities 
         (source, title, evidence_url, pain_score, wtp_score, competition_score, raw_text, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'new')
       ON CONFLICT (evidence_url) DO UPDATE
         SET pain_score = GREATEST(opportunities.pain_score, $4),
             seen_count = COALESCE(opportunities.seen_count, 1) + 1`,
        [
          signal.source,
          (payload.title || "").toString().slice(0, 200),
          payload.evidence_url,
          Math.round(Math.min(100, Math.max(0, Number(payload.pain_score) || 0))),
          Math.round(Math.min(100, Math.max(0, Number(payload.wtp_score) || 0))),
          Math.round(Math.min(100, Math.max(0, Number(payload.competition_score) || 10))),
          (payload.raw_text || "").toString().slice(0, 3000),
        ]
      );
    }
  }

  return signals.rows.length;
}

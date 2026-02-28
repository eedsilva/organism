import { BrowserAgent } from "../kernel/browserAgent";
import { query } from "../state/db";
import { sendPushNotification } from "../kernel/notify";

/**
 * hn.ts — Pain sensing from Hacker News using Agentic Browser.
 */

const HN_QUERIES = [
  "Ask HN: tool for",
  "Ask HN: is there a",
  "automation painful",
  "manual process expensive",
  "no good solution for",
  "we pay too much for",
  "wish there was",
];

interface HNHit {
  text: string;
}

function scorePain(hit: HNHit): number {
  const text = hit.text.toLowerCase();
  let pain = 0;

  const signals: [string, number][] = [
    ["manually", 25], ["wish there was", 30], ["no good", 25],
    ["spending hours", 30], ["every week", 20], ["every day", 20],
    ["paying", 25], ["expensive", 20], ["too much", 20],
    ["nightmare", 20], ["frustrating", 15], ["wasting time", 25],
    ["can't find", 20], ["looking for a tool", 30], ["automate", 20],
    ["still doing this manually", 35], ["need to automate", 30],
    ["process is broken", 35], ["hate having to", 25],
    ["can't believe there isn't", 35], ["looking for software", 30],
    ["tired of spreadsheets", 35], ["anyone built something", 20],
    ["ask hn", 15]
  ];

  for (const [signal, score] of signals) {
    if (text.includes(signal)) pain += score;
  }

  return Math.min(pain, 100);
}

export async function senseHackerNews() {
  const agent = new BrowserAgent(); // No session needed for public HN search

  let inserted = 0;
  let errors = 0;
  const highValueFound: string[] = [];

  console.log("   Hacker News: Starting Agentic Sensing...");

  // To avoid bot detection, pick 2 random queries per cycle
  const selectedQueries = [...HN_QUERIES].sort(() => 0.5 - Math.random()).slice(0, 2);

  for (const q of selectedQueries) {
    try {
      await new Promise(r => setTimeout(r, 3000)); // Respect HN rate limits

      const url = `https://hn.algolia.com/?q=${encodeURIComponent(q)}&sort=byDate&type=story`;
      const goal = `Scroll through the search results. Find technical founders or developers complaining about manual work, painful processes, or asking for tools. Extract the full text of any relevant post.`;

      const extractedText = await agent.runTask(url, goal, 4);

      if (!extractedText || extractedText.trim().length === 0) {
        continue; // Nothing found
      }

      const lines = extractedText.split('\n').filter((l: string) => l.length > 20);

      for (const text of lines) {
        const hit: HNHit = { text };
        const painScore = scorePain(hit);

        // HN signals are generally high intent but low WTP explicitly, so we just use pain.
        const viability = painScore;

        const result = await query(
          `INSERT INTO opportunities (source, title, evidence_url, pain_score, raw_text, status)
           VALUES ($1, $2, $3, $4, $5, 'new')
           ON CONFLICT (evidence_url) DO UPDATE
             SET pain_score = GREATEST(opportunities.pain_score, $4),
                 seen_count = COALESCE(opportunities.seen_count, 1) + 1
           RETURNING id, (xmax = 0) AS is_new`,
          ["hackernews-agent", text.slice(0, 100), url, Math.round(painScore), text.slice(0, 2000)]
        );

        const isNew = result.rows[0]?.is_new;
        if (isNew) inserted++;

        if (isNew && viability >= 50) {
          highValueFound.push(`[v:${viability}] ${text.slice(0, 70)}`);
        }
      }

    } catch (err: any) {
      console.error(`  ❌ HN Agent Error for query "${q}":`, err.message);
      errors++;
      continue;
    }
  }

  await agent.close();

  await query(
    `INSERT INTO events (type, payload) VALUES ($1, $2)`,
    ["hn_sense_agent", { queries: selectedQueries.length, inserted, errors }]
  );

  if (highValueFound.length > 0) {
    const msg = `🔭 *${highValueFound.length} high-value agentic HN signal${highValueFound.length > 1 ? "s" : ""} found*\n\n`
      + highValueFound.slice(0, 5).map(s => `• ${s}`).join("\n");

    await sendPushNotification(`High-Value HN Signals Detected`, msg);
  }

  console.log(`  Hacker News (Agent): ${inserted} new, ${errors} errors`);
}
import { query } from "../state/db";
import {
    approveCloudRequest,
    rejectCloudRequest,
    getCloudSpendSummary,
} from "../cognition/llm";
import fs from "fs";

/**
 * commands.ts — Shared command handlers for CLI and Telegram bot.
 *
 * Every function returns a formatted string so that both interfaces
 * can display the output in their own way (console.log vs bot.sendMessage).
 */

// ── /status ───────────────────────────────────────────────────────────────────

export async function getStatus(): Promise<string> {
    const [revenue, budget, todayBurn, pipeline, todayErrors] = await Promise.all([
        query(`SELECT COALESCE(SUM(revenue_usd),0) as total, COALESCE(SUM(payments),0) as payments FROM metrics_daily`),
        query(`SELECT value FROM policies WHERE key = 'daily_budget_usd'`),
        query(`SELECT COALESCE(SUM(inference_cost_usd),0) as burn FROM cycles WHERE DATE(started_at) = CURRENT_DATE`),
        query(`SELECT status, COUNT(*) as count FROM opportunities GROUP BY status ORDER BY count DESC`),
        query(`SELECT type, COUNT(*) as n FROM events
           WHERE DATE(created_at) = CURRENT_DATE
             AND (type LIKE '%error%' OR type LIKE '%fail%' OR type LIKE '%blocked%')
           GROUP BY type ORDER BY n DESC LIMIT 5`),
    ]);

    const total = Number(revenue.rows[0]?.total ?? 0);
    const payments = Number(revenue.rows[0]?.payments ?? 0);
    const burn = Number(todayBurn.rows[0]?.burn ?? 0);
    const limit = Number(budget.rows[0]?.value ?? 5);

    const pipelineLines = pipeline.rows
        .map((r: any) => `  ${r.status.padEnd(12)} ${r.count}`)
        .join("\n");

    const errorTotal = todayErrors.rows.reduce((s: number, r: any) => s + Number(r.n), 0);
    const errorDetail = todayErrors.rows.map((r: any) => `${r.type.replace(/_/g, " ")}:${r.n}`).join(", ");
    const errorLine = errorTotal > 0
        ? `Errors today: ${errorTotal}  (${errorDetail})`
        : `Errors today: none ✅`;

    return [
        `🧬 *ORGANISM STATUS*`,
        `Revenue:  $${total.toFixed(2)} (${payments} payment${payments !== 1 ? "s" : ""})`,
        `Burn:     $${burn.toFixed(2)} / $${limit.toFixed(2)} today`,
        `Survival: ${total > 0 ? "🟢 ALIVE" : "🔴 NO REVENUE YET"}`,
        `${errorLine}`,
        ``,
        `*Pipeline:*`,
        pipelineLines || "  (empty)",
    ].join("\n");
}

// ── /top ─────────────────────────────────────────────────────────────────────

export async function getTop(): Promise<string> {
    const rows = await query(
        `SELECT title, source, viability_score, pain_score, wtp_score
     FROM opportunities
     WHERE status IN ('new','reviewing')
     ORDER BY viability_score DESC LIMIT 5`
    );

    if (rows.rows.length === 0) return "No opportunities above threshold yet.";

    const lines = rows.rows.map((o: any, i: number) =>
        `${i + 1}. [v:${o.viability_score}] ${o.title?.slice(0, 55)}\n   ${o.source} | pain:${o.pain_score} wtp:${o.wtp_score}`
    );

    return `🔭 *TOP OPPORTUNITIES*\n\n${lines.join("\n\n")}`;
}

// ── /pipeline ─────────────────────────────────────────────────────────────────

export async function getPipeline(): Promise<string> {
    const rows = await query(
        `SELECT title, source, status, viability_score, created_at
     FROM opportunities ORDER BY created_at DESC LIMIT 15`
    );

    if (rows.rows.length === 0) return "Pipeline is empty.";

    const lines = rows.rows.map((o: any) => {
        const age = Math.round((Date.now() - new Date(o.created_at).getTime()) / 3_600_000);
        return `[${o.status}] [v:${o.viability_score}] ${o.title?.slice(0, 45)} (${age}h)`;
    });

    return `📋 *PIPELINE (last 15)*\n\n\`\`\`\n${lines.join("\n")}\n\`\`\``;
}

// ── /proposals ────────────────────────────────────────────────────────────────

export interface Proposal {
    id: number;
    file_path: string;
    rationale: string;
    expected_impact: string;
    status: string;
    current_code: string;
    proposed_code: string;
    created_at: Date;
}

export async function getProposals(): Promise<Proposal[]> {
    const rows = await query(
        `SELECT id, file_path, rationale, expected_impact, status, current_code, proposed_code, created_at
     FROM proposals ORDER BY created_at DESC LIMIT 20`
    );
    return rows.rows as Proposal[];
}

export function formatProposal(p: Proposal): string {
    const age = Math.round((Date.now() - new Date(p.created_at).getTime()) / 3_600_000);
    return [
        `🔧 *Proposal #${p.id}* — ${p.status.toUpperCase()}`,
        `File: \`${p.file_path}\` (${age}h ago)`,
        `Rationale: ${p.rationale?.slice(0, 120)}`,
        `Impact: ${p.expected_impact?.slice(0, 100)}`,
    ].join("\n");
}

// ── /approve <id> ─────────────────────────────────────────────────────────────

export async function approveProposal(id: number): Promise<string> {
    const res = await query(`SELECT * FROM proposals WHERE id = $1`, [id]);
    if (res.rows.length === 0) return `❌ Proposal ${id} not found.`;

    const p = res.rows[0];
    if (p.status !== "pending") return `⚠️ Proposal ${id} is already ${p.status}.`;

    try {
        const backupPath = `${p.file_path}.bak.${Date.now()}`;
        fs.copyFileSync(p.file_path, backupPath);
        fs.writeFileSync(p.file_path, p.proposed_code, "utf8");

        await query(`UPDATE proposals SET status = 'applied', reviewed_at = NOW() WHERE id = $1`, [id]);
        await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
            ["proposal_applied", { id, file_path: p.file_path, backup: backupPath }]
        );

        return `✅ Proposal #${id} applied to \`${p.file_path}\`\nBackup: \`${backupPath}\``;
    } catch (err: any) {
        return `❌ Failed to apply proposal #${id}: ${err.message}`;
    }
}

// ── /reject <id> ──────────────────────────────────────────────────────────────

export async function rejectProposal(id: number): Promise<string> {
    await query(`UPDATE proposals SET status = 'rejected', reviewed_at = NOW() WHERE id = $1`, [id]);
    return `❌ Proposal #${id} rejected.`;
}

// ── /approve-cloud <id> ───────────────────────────────────────────────────────

export async function approveCloud(id: number): Promise<string> {
    await approveCloudRequest(id);
    return `✅ Cloud request #${id} approved.`;
}

export async function rejectCloud(id: number): Promise<string> {
    await rejectCloudRequest(id);
    return `❌ Cloud request #${id} rejected — using Ollama.`;
}

// ── /spend ─────────────────────────────────────────────────────────────────────

export async function getSpend(): Promise<string> {
    const s = await getCloudSpendSummary();
    const pct = s.budget > 0 ? ((s.today / s.budget) * 100).toFixed(0) : "0";
    const filled = Math.round(Math.min(10, (s.today / Math.max(s.budget, 0.01)) * 10));
    const bar = "█".repeat(filled) + "░".repeat(Math.max(0, 10 - filled));

    const breakdown = s.breakdown.length > 0
        ? s.breakdown.map(b => `  ${b.model.padEnd(14)} ${b.calls}x  $${b.cost.toFixed(4)}`).join("\n")
        : "  No cloud calls today.";

    return [
        `☁️ *CLOUD LLM SPEND*`,
        `Today:    $${s.today.toFixed(4)} / $${s.budget.toFixed(2)} (${pct}%)`,
        `[${bar}]`,
        `Remaining: $${s.remaining.toFixed(4)}`,
        `This week: $${s.week.toFixed(4)}`,
        `All-time:  $${s.allTime.toFixed(4)}`,
        ``,
        `*Today by model:*`,
        breakdown,
    ].join("\n");
}

// ── /digest ───────────────────────────────────────────────────────────────────

export async function getDigest(): Promise<string> {
    try {
        const { generateDigest } = await import("./digest");
        return await generateDigest();
    } catch (err: any) {
        return `❌ Digest error: ${err.message}`;
    }
}

// ── Pending cloud approvals ───────────────────────────────────────────────────

export interface PendingCloudRequest {
    id: number;
    reason: string;
    requested_at: string;
}

export async function getPendingCloudRequests(): Promise<PendingCloudRequest[]> {
    const rows = await query(
        `SELECT id, payload->>'reason' as reason, payload->>'requested_at' as requested_at
     FROM events
     WHERE type = 'cloud_budget_approval_requested'
       AND payload->>'status' = 'pending'
     ORDER BY created_at DESC LIMIT 5`
    );
    return rows.rows as PendingCloudRequest[];
}

// ── Unread telegram_notify events ────────────────────────────────────────────

export interface TelegramNotification {
    id: number;
    message: string;
    action: string | null;
    event_id: number | null;
}

export async function drainTelegramNotifications(): Promise<TelegramNotification[]> {
    // Mark as dispatched atomically by updating payload
    const rows = await query(
        `UPDATE events
     SET payload = payload || '{"dispatched":true}'::jsonb
     WHERE type = 'telegram_notify'
       AND NOT (payload ? 'dispatched')
     RETURNING id,
               payload->>'message'   as message,
               payload->>'action'    as action,
               (payload->>'event_id')::int as event_id`
    );
    return rows.rows as TelegramNotification[];
}

// ── /reach ──────────────────────────────────────────────────────────────────

export interface OutreachDraft {
    id: number;
    channel: string;
    content: string;
    title: string;
    opportunity_id: number;
}

export async function getDraftedOutreach(): Promise<OutreachDraft[]> {
    const rows = await query(
        `SELECT r.id, r.channel, r.content, o.title, r.opportunity_id
     FROM reach_log r
     JOIN opportunities o ON o.id = r.opportunity_id
     WHERE r.status = 'drafted'
     ORDER BY r.created_at DESC LIMIT 10`
    );
    return rows.rows as OutreachDraft[];
}

export function formatOutreachDraft(d: OutreachDraft): string {
    return [
        `📢 *#${d.id} — ${d.channel.toUpperCase()}*`,
        `Opportunity: ${d.title?.slice(0, 60)}`,
        ``,
        d.content?.slice(0, 800),
        ``,
        `Mark posted: /posted ${d.id} <url>`,
    ].join("\n");
}

// ── /posted <id> <url> ────────────────────────────────────────────────────────

export async function markPostedOutreach(id: number, url: string): Promise<string> {
    const res = await query(`SELECT id FROM reach_log WHERE id = $1`, [id]);
    if (res.rows.length === 0) return `❌ Reach log entry #${id} not found.`;

    await query(`UPDATE reach_log SET status = 'posted', url = $1 WHERE id = $2`, [url, id]);
    await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
        ["outreach_posted", { reach_id: id, url }]
    );
    return `✅ Marked #${id} as posted: ${url}`;
}

// ── /ideas ─────────────────────────────────────────────────────────────────────

export async function getIdeas(): Promise<string> {
    const rows = await query(
        `SELECT id, title, source, viability_score, pain_score, wtp_score, seen_count
     FROM opportunities
     WHERE status = 'new' AND (operator_rating IS NULL OR operator_rating = '')
     ORDER BY viability_score DESC LIMIT 10`
    );

    if (rows.rows.length === 0) return "No un-reviewed ideas yet. Sensing is running.";

    const lines = rows.rows.map((o: any, i: number) => {
        const seen = o.seen_count > 1 ? ` (seen ${o.seen_count}x)` : "";
        return `${i + 1}. [v:${o.viability_score}] *${o.title?.slice(0, 60)}*\n   ${o.source} | pain:${o.pain_score} wtp:${o.wtp_score}${seen}\n   /good ${o.id} or /bad ${o.id}`;
    });

    return `💡 *UNREVIEWED IDEAS*\n\n${lines.join("\n\n")}`;
}

// ── /good <id> / /bad <id> ────────────────────────────────────────────────────

export async function rateIdea(id: number, rating: "good" | "bad"): Promise<string> {
    const res = await query(`SELECT source, title FROM opportunities WHERE id = $1`, [id]);
    if (res.rows.length === 0) return `❌ Opportunity #${id} not found.`;

    await query(`UPDATE opportunities SET operator_rating = $1 WHERE id = $2`, [rating, id]);

    const source = res.rows[0].source as string;
    const title = res.rows[0].title as string;

    // Nudge source weight via reflect-friendly event
    await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
        [`idea_rated_${rating}`, { id, source, title: title.slice(0, 80) }]
    );

    const emoji = rating === "good" ? "👍" : "👎";
    return `${emoji} Rated #${id} as ${rating.toUpperCase()}: "${title.slice(0, 50)}"\nSource weight for ${source} will adjust at next reflection.`;
}

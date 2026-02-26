import { query } from "../state/db";
import { getPendingOutreach } from "./reach";
import { getCloudSpendSummary } from "../cognition/llm";
import fs from "fs";
import path from "path";

function formatUSD(val: any): string {
  return `$${Number(val).toFixed(2)}`;
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
}

function hr(char = "─", len = 50): string {
  return char.repeat(len);
}

export async function generateDigest(): Promise<string> {
  const revenue = await query(
    `SELECT COALESCE(SUM(revenue_usd), 0) as total, COALESCE(SUM(payments), 0) as payments
     FROM metrics_daily`
  );

  const spendSummary = await getCloudSpendSummary();
  const spendPct = spendSummary.budget > 0 ? Math.round((spendSummary.today / spendSummary.budget) * 100) : 0;

  const pipeline = await query(`SELECT status, COUNT(*) as count FROM opportunities GROUP BY status`);
  const pipelineMap: Record<string, number> = {};
  for (const row of pipeline.rows) pipelineMap[row.status] = Number(row.count);

  const topOpportunities = await query(
    `SELECT title, source, viability_score, pain_score, wtp_score
     FROM opportunities WHERE status = 'new'
     ORDER BY viability_score DESC LIMIT 5`
  );

  const preorders = await query(
    `SELECT o.title, r.content, r.created_at, r.id,
            EXTRACT(EPOCH FROM (NOW() - r.created_at))/3600 as hours_live
     FROM reach_log r JOIN opportunities o ON o.id = r.opportunity_id
     WHERE r.channel = 'preorder' AND r.status = 'posted'
     ORDER BY r.created_at DESC LIMIT 5`
  );

  const zombies = await query(
    `SELECT title FROM opportunities
     WHERE status = 'building' AND created_at < NOW() - INTERVAL '5 days'`
  );

  const outreach = await getPendingOutreach();

  const recentCycles = await query(
    `SELECT status, COUNT(*) as count FROM cycles
     WHERE started_at >= NOW() - INTERVAL '24 hours' GROUP BY status`
  );
  const cycleMap: Record<string, number> = {};
  for (const row of recentCycles.rows) cycleMap[row.status] = Number(row.count);

  const totalRevenue = Number(revenue.rows[0].total);
  const totalPayments = Number(revenue.rows[0].payments);

  const lines: string[] = [];
  const push = (...args: string[]) => lines.push(...args);

  push("", hr("═"), "  ORGANISM DAILY DIGEST", `  ${formatDate()}`, hr("═"));

  // Survival
  const alive = totalRevenue > 0 ? "🟢 REVENUE FLOWING" : "🔴 NO REVENUE YET";
  push("", "  SURVIVAL STATUS", hr(),
    `  ${alive}`,
    `  Total revenue:        ${formatUSD(totalRevenue)} (${totalPayments} payment${totalPayments !== 1 ? "s" : ""})`,
    `  Cloud Spend Today:    ${formatUSD(spendSummary.today)} / ${formatUSD(spendSummary.budget)} (${spendPct}%)`,
    `  Cloud Spend 7-day:    ${formatUSD(spendSummary.week)}`,
    `  Cloud Spend All-time: ${formatUSD(spendSummary.allTime)}`,
  );
  if (spendSummary.remaining < 1) push("", "  ⚠️  CRITICAL: Budget nearly exhausted.");

  // Pipeline
  push("", "  PIPELINE", hr(),
    `  New:       ${pipelineMap["new"] ?? 0}`,
    `  Pursuing:  ${pipelineMap["pursue"] ?? 0}`,
    `  Building:  ${pipelineMap["building"] ?? 0}`,
    `  Discarded: ${pipelineMap["discarded"] ?? 0}`,
  );

  // Top opportunities
  if (topOpportunities.rows.length > 0) {
    push("", "  TOP OPPORTUNITIES", hr());
    for (const [i, opp] of topOpportunities.rows.entries()) {
      push(
        `  ${i + 1}. [viability: ${opp.viability_score}] ${opp.title.slice(0, 60)}`,
        `     ${opp.source} | pain: ${opp.pain_score} | wtp: ${opp.wtp_score}`,
      );
    }
  }

  // Preorders
  if (preorders.rows.length > 0) {
    push("", "  PREORDERS LIVE", hr());
    for (const p of preorders.rows) {
      const hours = Math.round(Number(p.hours_live));
      const verdict = hours >= 48
        ? "❌ 48h passed — KILL IT (no payment = no build)"
        : `⏳ ${48 - hours}h remaining`;
      push(`  ${p.title.slice(0, 55)}`, `  ${verdict}`, "");
    }
  }

  // Zombies
  if (zombies.rows.length > 0) {
    push("", "  ⚠️  ZOMBIE PRODUCTS (>5 days, no revenue)", hr());
    for (const z of zombies.rows) push(`  KILL → ${z.title.slice(0, 60)}`);
    push("", "  SQL to kill:",
      "  UPDATE opportunities SET status = 'killed'",
      "  WHERE status = 'building' AND created_at < NOW() - INTERVAL '5 days';"
    );
  }

  // Outreach
  if (outreach.length > 0) {
    push("", `  OUTREACH READY (${outreach.length} total — post these)`, hr());
    for (const [i, item] of outreach.slice(0, 3).entries()) {
      push("", `  ── ${i + 1}. [${item.channel.toUpperCase()}] ──`,
        `  Topic: ${item.title.slice(0, 55)}`, "",
        ...item.content.split("\n").map((l: string) => `  ${l}`), "",
        `  Mark posted: UPDATE reach_log SET status='posted', url='<url>' WHERE id=${item.id};`,
      );
    }
  } else {
    push("", "  No outreach ready. Will draft next cycle.");
  }

  // Cycle health
  push("", "  CYCLE HEALTH (24h)", hr(),
    `  Success: ${cycleMap["success"] ?? 0}  Failed: ${cycleMap["failed"] ?? 0}  Exhausted: ${cycleMap["budget_exhausted"] ?? 0}`,
  );

  // Action list
  push("", hr("═"), "  DO THIS NOW", hr("═"), "");
  const actions: string[] = [];
  if (outreach.length > 0) actions.push(`→ Post ${Math.min(outreach.length, 3)} outreach item(s) above`);
  if (zombies.rows.length > 0) actions.push(`→ Kill ${zombies.rows.length} zombie(s) — wasting budget`);
  if (preorders.rows.some((p: any) => Number(p.hours_live) >= 48)) actions.push("→ 48h window passed on preorder(s) — kill or build");
  if (totalRevenue === 0) actions.push("→ Zero revenue. First preorder payment is the only goal.");
  if (actions.length === 0) actions.push("→ Nothing urgent. Let the organism run.");
  for (const a of actions) push(`  ${a}`);
  push("", hr("═"), "");

  return lines.join("\n");
}

export async function runDigest() {
  const lastDigest = await query(
    `SELECT id FROM events WHERE type = 'digest_generated' AND DATE(created_at) = CURRENT_DATE LIMIT 1`
  );
  if (lastDigest.rows.length > 0) return;

  const digest = await generateDigest();
  console.log(digest);

  const digestDir = "logs";
  if (!fs.existsSync(digestDir)) fs.mkdirSync(digestDir, { recursive: true });

  const filename = `digest_${new Date().toISOString().slice(0, 10)}.md`;
  fs.writeFileSync(path.join(digestDir, filename), digest);
  fs.writeFileSync(path.join(digestDir, "latest_digest.md"), digest);

  await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`, ["digest_generated", { filename }]);
}
import { query } from "../state/db";
import fs from "fs";
import fetch from "node-fetch";
import { getBudgetStatus } from "./budgets";
import { senseHackerNews } from "../sense/hn";
import { senseGithub } from "../sense/github";
import { selectTopOpportunity } from "./decide";
import { generatePlan } from "./plan";
import { attemptBuild } from "./build";
import { getPendingOutreach } from "./reach";

async function selfCheck() {
  const diagnostics: Record<string, any> = {};

  try {
    await query("select 1");
    diagnostics.db = "ok";
  } catch {
    diagnostics.db = "fail";
  }

  try {
    fs.writeFileSync("logs/healthcheck.tmp", "ok");
    fs.unlinkSync("logs/healthcheck.tmp");
    diagnostics.disk = "ok";
  } catch {
    diagnostics.disk = "fail";
  }

  try {
    const res = await fetch("https://example.com");
    diagnostics.internet = res.ok ? "ok" : "fail";
  } catch {
    diagnostics.internet = "fail";
  }

  return diagnostics;
}

async function printStatus() {
  // Show the organism's current state at each cycle
  const opportunities = await query(
    `SELECT status, COUNT(*) as count FROM opportunities GROUP BY status ORDER BY count DESC`
  );

  const pending = await getPendingOutreach();

  const revenue = await query(
    `SELECT COALESCE(SUM(revenue_usd), 0) as total FROM metrics_daily`
  );

  console.log("\n📊 STATUS:");
  console.table(opportunities.rows);
  console.log(`💰 Total revenue: $${revenue.rows[0].total}`);
  console.log(`📣 Pending outreach to post: ${pending.length} items`);

  if (pending.length > 0) {
    console.log("\n🚀 READY TO POST:");
    for (const item of pending.slice(0, 3)) {
      console.log(`  [${item.channel}] ${item.title}`);
      console.log(`  ${item.content.slice(0, 120)}...`);
      console.log();
    }
  }
}

export async function runCycle() {
  const start = new Date();

  const cycleInsert = await query(
    `INSERT INTO cycles (started_at, status) VALUES ($1, $2) RETURNING id`,
    [start, "running"]
  );

  const cycleId = cycleInsert.rows[0].id;

  try {
    // 1. Budget check
    const budgetStatus = await getBudgetStatus();
    await query(
      `INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["budget_status", { status: budgetStatus }]
    );

    if (budgetStatus === "exhausted") {
      console.log("⚠️  Budget exhausted for today. Sleeping.");
      await query(
        `UPDATE cycles SET ended_at = $1, status = $2 WHERE id = $3`,
        [new Date(), "budget_exhausted", cycleId]
      );
      return;
    }

    // 2. Sense the world
    console.log("👁️  Sensing HN...");
    await senseHackerNews();

    console.log("👁️  Sensing GitHub...");
    await senseGithub();

    // 3. Decide
    console.log("🧠 Selecting opportunity...");
    const opportunity = await selectTopOpportunity();

    if (opportunity) {
      console.log(`✅ Evaluating: "${opportunity.title}"`);

      // 4. Plan
      const planResult = await generatePlan(opportunity);
      console.log(`📋 Plan score: ${planResult?.score ?? "?"}`);

      // 5. Build (only if plan said pursue)
      await attemptBuild();
    } else {
      console.log("💤 No new opportunities above threshold.");
    }

    // 6. Self check
    const diagnostics = await selfCheck();
    await query(
      `INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["self_check", diagnostics]
    );

    // 7. Print status
    await printStatus();

    await query(
      `UPDATE cycles SET ended_at = $1, status = $2 WHERE id = $3`,
      [new Date(), "success", cycleId]
    );

  } catch (err: any) {
    console.error("❌ Cycle failed:", err.message);
    await query(
      `UPDATE cycles SET ended_at = $1, status = $2, notes = $3 WHERE id = $4`,
      [new Date(), "failed", err.message, cycleId]
    );
  }
}
import { query } from "../state/db";
import fs from "fs";
import fetch from "node-fetch";
import { getBudgetStatus } from "./budgets";
import { senseHackerNews } from "../sense/hn";
import { senseReddit } from "../sense/reddit";
import { senseAppReviews } from "../sense/reviews";
import { senseUpwork } from "../sense/upwork";
import { senseG2 } from "../sense/g2";
import { selectTopOpportunity } from "./decide";
import { generatePlan } from "./plan";
import { runDigest } from "./digest";
import { runReflect } from "./reflect";
import { runEvolve } from "./evolve";

async function selfCheck() {
  const diagnostics: Record<string, any> = {};
  try { await query("select 1"); diagnostics.db = "ok"; } catch { diagnostics.db = "fail"; }
  try {
    fs.writeFileSync("logs/healthcheck.tmp", "ok");
    fs.unlinkSync("logs/healthcheck.tmp");
    diagnostics.disk = "ok";
  } catch { diagnostics.disk = "fail"; }
  try {
    const res = await fetch("https://example.com");
    diagnostics.internet = res.ok ? "ok" : "fail";
  } catch { diagnostics.internet = "fail"; }
  return diagnostics;
}

export async function runCycle() {
  const start = new Date();
  const cycleInsert = await query(
    `INSERT INTO cycles (started_at, status) VALUES ($1, $2) RETURNING id`,
    [start, "running"]
  );
  const cycleId = cycleInsert.rows[0].id;

  try {
    // 0. Daily digest — once per day, pushes work to operator
    await runDigest();
    await query(`SELECT pg_notify('organism_events', $1)`, [JSON.stringify({ type: "digest_run" })]);

    // 0b. Weekly reflection — once per week, updates policies
    //     Runs before sensing so new weights take effect this cycle
    await runReflect();
    await query(`SELECT pg_notify('organism_events', $1)`, [JSON.stringify({ type: "reflect_run" })]);

    // 0c. Daily self-improvement — reads own code, generates proposals for human review
    await runEvolve();

    // 1. Budget check
    const budgetStatus = await getBudgetStatus();
    await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["budget_status", { status: budgetStatus }]);

    if (budgetStatus === "exhausted") {
      console.log("⚠️  Budget exhausted for today. Sleeping.");
      await query(`UPDATE cycles SET ended_at = $1, status = $2 WHERE id = $3`,
        [new Date(), "budget_exhausted", cycleId]);
      return;
    }

    // 2. Sense — all in parallel
    console.log("\n👁️  Sensing...");
    await Promise.all([
      senseHackerNews().then(() => console.log("  ✅ HN")),
      senseAppReviews().then(() => console.log("  ✅ B2B Reviews")),
      senseUpwork().then(() => console.log("  ✅ Upwork Jobs")),
      senseG2().then(() => console.log("  ✅ G2/Capterra Negative Reviews")),
      senseReddit().catch((err: any) => console.log(`  ⚠️  Reddit: ${err.message}`)),
    ]);
    await query(`SELECT pg_notify('organism_events', $1)`, [JSON.stringify({ type: "sense_completed" })]);

    // 3. Decide — weighted by source trust from policies
    console.log("\n🧠 Selecting opportunity...");
    const opportunity = await selectTopOpportunity();

    if (opportunity) {
      console.log(`✅ "${opportunity.title?.slice(0, 60)}"`);
      console.log(`   [viability: ${opportunity.viability_score} × weight: ${opportunity.source_weight} = ${opportunity.weighted_viability}]`);

      // 4. Plan (Async)
      const planResult = await generatePlan(opportunity);
      if (planResult?.queued) {
        console.log(`📋 Plan queued for worker (Job ID: ${planResult.jobId})`);
        await query(`SELECT pg_notify('organism_events', $1)`, [JSON.stringify({ type: "plan_queued", payload: { opportunity_id: opportunity.id, job_id: planResult.jobId } })]);
      }

      // 5. Build — Handled asynchronously by validation worker
      // attemptBuild independently checks for 'pursue' statuses
    } else {
      console.log("💤 No opportunities above threshold.");
    }

    // 6. Self check
    const diagnostics = await selfCheck();
    await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
      ["self_check", diagnostics]);

    await query(`UPDATE cycles SET ended_at = $1, status = $2 WHERE id = $3`,
      [new Date(), "success", cycleId]);

  } catch (err: any) {
    console.error("\n❌ Cycle failed:", err.message);
    await query(`UPDATE cycles SET ended_at = $1, status = $2, notes = $3 WHERE id = $4`,
      [new Date(), "failed", err.message, cycleId]);
  }
}
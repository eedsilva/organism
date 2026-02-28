import { query } from "../state/db";
import fs from "fs";
import fetch from "node-fetch";
import { getTodayCloudSpend, getCloudBudget } from "../cognition/llm";
import { processSignalQueue } from "./workers/signal";
import { senseHackerNews } from "../sense/hn";
import { senseReddit } from "../sense/reddit";
import { senseAppReviews } from "../sense/reviews";
import { senseTwitter } from "../sense/twitter";
import { senseG2 } from "../sense/g2";
import { senseLinkedIn } from "../sense/linkedin";
import { selectTopOpportunity } from "./decide";
import { generatePlan } from "./plan";
import { runDigest } from "./digest";
import { runReflect } from "./reflect";
import { runEvolve } from "./evolve";
import { runDeepResearch } from "../sense/research";

const SENSOR_TIMEOUT_MS = 90_000; // 90 seconds max per sensor — no sensor can hold the cycle hostage

async function runWithTimeout<T>(
  fn: () => Promise<T>,
  name: string,
  timeoutMs: number
): Promise<T | null> {
  const timer = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`${name} timed out after ${timeoutMs / 1000}s`)), timeoutMs)
  );
  try {
    return await Promise.race([fn(), timer]);
  } catch (err: any) {
    console.log(`  ⚠️  ${name}: ${err.message}`);
    return null;
  }
}

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

    // 1. Process signal queue — clear leads/G2/Upwork signals before sensing adds more
    const processedCount = await processSignalQueue();
    if (processedCount > 0) {
      console.log(`  📬 Processed ${processedCount} signal(s) from queue`);
    }

    // 2. Budget check (uses events table via llm.ts, not cycles.inference_cost_usd)
    const todaySpend = await getTodayCloudSpend();
    const dailyBudget = await getCloudBudget();
    await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`, [
      "budget_status",
      { status: todaySpend >= dailyBudget ? "exhausted" : "normal", todaySpend, dailyBudget },
    ]);

    if (todaySpend >= dailyBudget) {
      console.log(
        `⚠️  Budget exhausted ($${todaySpend.toFixed(4)} / $${dailyBudget.toFixed(2)}). Sleeping.`
      );
      await query(`UPDATE cycles SET ended_at = $1, status = $2 WHERE id = $3`, [
        new Date(),
        "budget_exhausted",
        cycleId,
      ]);
      return;
    }

    // 3. Sense — sequentially to protect local LLM compute & memory
    console.log("\n👁️  Sensing...");

    // 2a. Deep Research - Agentic UI
    const customQueries = await runDeepResearch();

    const sensors = [
      { name: "HN", fn: senseHackerNews },
      { name: "B2B Reviews", fn: senseAppReviews },
      { name: "G2/Capterra Negative Reviews", fn: senseG2 },
      { name: "Twitter Signals", fn: () => senseTwitter(customQueries) },
      { name: "LinkedIn", fn: senseLinkedIn },
      { name: "Reddit", fn: () => senseReddit(customQueries) },
    ];

    for (const sensor of sensors) {
      const result = await runWithTimeout(sensor.fn, sensor.name, SENSOR_TIMEOUT_MS);
      if (result !== null) {
        console.log(`  ✅ ${sensor.name}`);
      }
    }
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
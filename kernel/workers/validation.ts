import { query } from "../../state/db";
import {
    killZombies,
    checkPreorderWindows,
    buildProduct,
    launchPreorder
} from "../build";

/**
 * validation.ts — Asynchronous Validation Worker Pool
 *
 * Replaces the synchronous `attemptBuild` loop.
 * Monitors the 'pursue' and 'building' queues, enforcing `max_concurrent_validations`.
 * Spawns multiple preorders in parallel up to the policy limit.
 */

const POLL_INTERVAL_MS = Number(process.env.VALIDATION_POLL_INTERVAL_MS) || 60000;
let isPolling = false;

async function runValidationLoop() {
    // 1. Housekeeping: kill zombies and check for expired/converted preorders
    await killZombies();
    await checkPreorderWindows();

    // 2. Build the real product for converted preorders (always priority, not limited by validation cap)
    const readyToBuild = await query(
        `SELECT id, title, plan, raw_text FROM opportunity_current_state WHERE status = 'pursue'
     AND id IN (SELECT opportunity_id FROM reach_log WHERE channel = 'preorder' AND status = 'converted')`
    );

    for (const opp of readyToBuild.rows) {
        console.log(`  🏗️  Building real product for validated opportunity: ${opp.title.slice(0, 55)}`);
        await buildProduct(opp);
    }

    // 3. Spawning new validations up to the concurrent limit
    const limitRes = await query(`SELECT value FROM policies WHERE key = 'max_concurrent_validations'`);
    const maxValidations = Number(limitRes.rows[0]?.value ?? 3);

    const activeRes = await query(
        `SELECT COUNT(*) as count FROM opportunity_current_state WHERE status = 'building'`
    );
    const activeValidations = Number(activeRes.rows[0].count);

    const availableSlots = Math.max(0, maxValidations - activeValidations);

    if (availableSlots > 0) {
        const opportunities = await query(
            `SELECT id, title, plan, raw_text FROM opportunity_current_state
       WHERE status = 'pursue'
         AND id NOT IN (SELECT opportunity_id FROM reach_log WHERE channel = 'preorder' AND status = 'converted')
       ORDER BY viability_score DESC
       LIMIT $1`,
            [availableSlots]
        );

        if (opportunities.rows.length > 0) {
            console.log(`\n  🚀 Validation Worker spinning up ${opportunities.rows.length} parallel preorders (Slots: ${availableSlots})`);

            // Execute `launchPreorder` for each in parallel
            await Promise.all(opportunities.rows.map(opp => launchPreorder(opp)));
        }
    }
}

async function poll() {
    if (isPolling) return;
    isPolling = true;

    try {
        await runValidationLoop();
    } catch (err: any) {
        console.error(`  ❌ Validation Worker Error: ${err.message}`);
    } finally {
        isPolling = false;
    }
}

export function startValidationWorkerPool() {
    console.log("  ✅ Validation Worker Pool started.");
    setInterval(poll, POLL_INTERVAL_MS);
    // Start first loop immediately
    poll();
}

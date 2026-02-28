import { query } from "../../state/db";
import { launchFreeToolFromDisplacement } from "../build";

/**
 * displacementBuilder.ts — Displacement Chassis Worker
 *
 * Polls displacement_events with status 'detected' or 'active' that have no
 * tool_deployment yet. Calls launchFreeToolFromDisplacement to inject chassis
 * and deploy. Runs on its own interval, independent of the validation worker.
 */

const POLL_INTERVAL_MS = Number(process.env.DISPLACEMENT_BUILDER_POLL_INTERVAL_MS) || 120_000; // 2 min default
let isPolling = false;

async function runDisplacementBuilderLoop() {
  const limitRes = await query(
    `SELECT value FROM policies WHERE key = 'max_concurrent_displacements'`
  );
  const maxBuilds = Number(limitRes.rows[0]?.value ?? 2);

  const pending = await query(
    `SELECT id, type, product_or_role, affected_persona_niche, displacement_strength
     FROM displacement_events
     WHERE status IN ('detected', 'active')
       AND id NOT IN (
         SELECT displacement_event_id FROM tool_deployments
         WHERE displacement_event_id IS NOT NULL
       )
     ORDER BY displacement_strength DESC, detected_at ASC
     LIMIT $1`,
    [maxBuilds]
  );

  if (pending.rows.length === 0) return;

  for (const ev of pending.rows) {
    try {
      console.log(
        `  🏗️  Displacement Builder: deploying chassis for ${ev.product_or_role} (${ev.type})`
      );
      const result = await launchFreeToolFromDisplacement({
        id: ev.id,
        type: ev.type,
        product_or_role: ev.product_or_role,
        affected_persona_niche: ev.affected_persona_niche ?? undefined,
        displacement_strength: Number(ev.displacement_strength),
      });
      if (result) {
        console.log(
          `  ✅ Chassis deployed: ${result.folderPath} (deployment #${result.deploymentId})`
        );
      }
    } catch (err: any) {
      console.error(`  ❌ Displacement Builder error for ${ev.id}: ${err.message}`);
    }
  }
}

async function poll() {
  if (isPolling) return;
  isPolling = true;

  try {
    await runDisplacementBuilderLoop();
  } catch (err: any) {
    console.error(`  ❌ Displacement Builder Worker Error: ${err.message}`);
  } finally {
    isPolling = false;
  }
}

export function startDisplacementBuilderWorker() {
  console.log("  ✅ Displacement Builder Worker started.");
  setInterval(poll, POLL_INTERVAL_MS);
  poll();
}

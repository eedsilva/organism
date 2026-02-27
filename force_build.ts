import { launchPreorder } from "./kernel/build";
import { query } from "./state/db";

async function force() {
  console.log("Setting a test opportunity to pursue state...");
  await query(`UPDATE opportunity_current_state SET status = 'killed' WHERE status = 'building'`);
  await query(`UPDATE opportunities SET status = 'pursue' WHERE id = (SELECT id FROM opportunity_current_state LIMIT 1)`);

  const opp = await query(`SELECT id, title, plan, raw_text FROM opportunity_current_state WHERE status = 'pursue' LIMIT 1`);
  if (opp.rows.length > 0) {
    console.log("Forcing build sequence...");
    await launchPreorder(opp.rows[0]);
  }

  console.log("Done.");
  process.exit(0);
}
force();

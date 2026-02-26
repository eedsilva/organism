import { attemptBuild, launchPreorder } from "./kernel/build";
import { query } from "./state/db";

async function force() {
  console.log("Setting a test opportunity to pursue state...");
  await query(`UPDATE opportunities SET status = 'killed' WHERE status = 'building'`);
  await query(`UPDATE opportunities SET status = 'pursue' WHERE id = (SELECT id FROM opportunities LIMIT 1)`);
  console.log("Forcing build sequence...");
  await attemptBuild();
  console.log("Done.");
  process.exit(0);
}
force();

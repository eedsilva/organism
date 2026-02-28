import { senseTwitter } from "./sense/twitter";
import { query } from "./state/db";

async function run() {
    console.log("Testing standalone senseTwitter...");
    await senseTwitter();
    console.log("Done testing.");
    process.exit(0);
}

run().catch(console.error);

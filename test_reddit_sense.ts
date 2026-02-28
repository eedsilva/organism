import { senseReddit } from "./sense/reddit";

async function run() {
    console.log("Testing standalone senseReddit...");
    await senseReddit();
    console.log("Done testing.");
    process.exit(0);
}

run().catch(console.error);

#!/usr/bin/env ts-node
import dotenv from "dotenv";
import { runMarketingAgent } from "../agents/marketing";

dotenv.config();

const handle = process.argv[2];

if (!handle) {
    console.error("❌ Please provide a Reddit handle (e.g. npm run agent:marketing ShopifyDev99)");
    process.exit(1);
}

runMarketingAgent(handle).catch((e) => {
    console.error(e);
    process.exit(1);
});

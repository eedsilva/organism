#!/usr/bin/env ts-node
/**
 * run-marketing.ts — Manually trigger the Marketing Agent for verification.
 *
 * Usage: npx ts-node -r dotenv/config scripts/run-marketing.ts
 */
import dotenv from "dotenv";
import { runMarketingLoop } from "../agents/marketing";

dotenv.config();

async function main() {
  console.log("\n🛡️  Running Marketing Agent (one cycle)...\n");
  await runMarketingLoop();
  console.log("\n✅ Marketing cycle complete.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

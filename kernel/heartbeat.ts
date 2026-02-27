import dotenv from "dotenv";
import { runCycle } from "./cycle";

dotenv.config();

const interval = Number(process.env.HEARTBEAT_INTERVAL_MS) || 60000;

let running = false;

async function heartbeat() {
  if (running) return; // prevent overlap
  running = true;

  console.log("💓 Heartbeat:", new Date().toISOString());

  try {
    await runCycle();
  } catch (err) {
    console.error("Cycle error:", err);
  }

  running = false;
}

import { startLlmWorkerPool } from "./workers/llm";
import { startValidationWorkerPool } from "./workers/validation";

console.log("Organism starting...");
startLlmWorkerPool();
startValidationWorkerPool();

setInterval(heartbeat, interval);

// Run immediately on start
heartbeat();
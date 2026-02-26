import TelegramBot from "node-telegram-bot-api";
import { query } from "./state/db";
import { getIdeas, getStatus, getTop, getPipeline } from "./kernel/commands";

async function run() {
  try {
    const ideas = await getIdeas();
    console.log("Ideas:", ideas);
  } catch (e) {
    console.error("Error getIdeas:", e);
  }
}
run();

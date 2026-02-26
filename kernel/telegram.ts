import TelegramBot from "node-telegram-bot-api";
import { query } from "../state/db";
import {
    getStatus, getTop, getPipeline, getProposals, formatProposal,
    approveProposal, rejectProposal, approveCloud, rejectCloud,
    getSpend, getDigest, getPendingCloudRequests, drainTelegramNotifications,
    getDraftedOutreach, formatOutreachDraft, markPostedOutreach,
    getIdeas, rateIdea,
} from "./commands";

/**
 * telegram.ts — Telegram bot interface for the organism.
 *
 * Mirrors all CLI commands. Adds:
 *   - Inline keyboard buttons for approvals (proposals + cloud)
 *   - Proactive daily digest push
 *   - Cloud budget approval requests forwarded from the heartbeat
 *
 * Run with: npm run telegram
 *
 * Required .env:
 *   TELEGRAM_BOT_TOKEN=...   from @BotFather
 *   TELEGRAM_CHAT_ID=...     operator's chat ID (run /start to discover)
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";

// How often to poll for queued telegram_notify events from the heartbeat (ms)
const NOTIFY_POLL_INTERVAL = 10_000;

// ── Bot setup ─────────────────────────────────────────────────────────────────

function createBot(): TelegramBot {
    if (!BOT_TOKEN) {
        console.error("❌ TELEGRAM_BOT_TOKEN not set in .env");
        process.exit(1);
    }

    return new TelegramBot(BOT_TOKEN, { polling: true });
}

// ── Send helpers ──────────────────────────────────────────────────────────────

async function send(
    bot: TelegramBot,
    text: string,
    chatId: string | number = CHAT_ID,
    opts: TelegramBot.SendMessageOptions = {}
): Promise<TelegramBot.Message> {
    return bot.sendMessage(chatId, text, {
        parse_mode: "Markdown",
        ...opts,
    });
}

// Split long messages into 4096-char chunks (Telegram limit)
async function sendLong(bot: TelegramBot, text: string, chatId: string | number = CHAT_ID) {
    const limit = 4000;
    for (let i = 0; i < text.length; i += limit) {
        await send(bot, text.slice(i, i + limit), chatId);
    }
}

// ── Inline keyboard helpers ───────────────────────────────────────────────────

function approvalKeyboard(approveData: string, rejectData: string): TelegramBot.InlineKeyboardMarkup {
    return {
        inline_keyboard: [[
            { text: "✅ Approve", callback_data: approveData },
            { text: "❌ Reject", callback_data: rejectData },
        ]],
    };
}

// ── Command handlers ──────────────────────────────────────────────────────────

async function handleCommand(
    bot: TelegramBot,
    msg: TelegramBot.Message,
    command: string,
    args: string[]
) {
    const chatId = msg.chat.id;

    try {
        switch (command) {
            case "/start":
            case "/help":
                await send(bot, [
                    "🧬 *Organism Operator Bot*",
                    "",
                    "*Sensing & Ideas*",
                    "/ideas — Unreviewed opportunities ranked by viability",
                    "/good `<id>` — Rate an idea as high-quality",
                    "/bad `<id>` — Rate an idea as noise",
                    "/top — Top 5 by viability score",
                    "/pipeline — Full pipeline (last 15)",
                    "/status — Survival summary + error counts",
                    "",
                    "*Operations*",
                    "/digest — Today's full digest",
                    "/reflect — Force reflection now",
                    "/sense — Run all sensors now",
                    "/reach — Drafted outreach waiting to be posted",
                    "/posted `<id>` `<url>` — Mark outreach as live",
                    "",
                    "*LLM & Budget*",
                    "/spend — Cloud LLM spend breakdown",
                    "/pending — Pending cloud approval requests",
                    "/appcloud `<id>` — Approve cloud request",
                    "/rejcloud `<id>` — Reject cloud request",
                    "",
                    "*Proposals*",
                    "/proposals — Pending self-improvement proposals",
                    "/approve `<id>` — Apply a proposal",
                    "/reject `<id>` — Reject a proposal",
                    "",
                    "*Replication*",
                    "/colony — List child organism specs",
                    "/replicate `<id>` — Spawn a child organism",
                ].join("\n"), chatId);
                break;

            case "/status":
                await send(bot, await getStatus(), chatId);
                break;

            case "/top":
                await send(bot, await getTop(), chatId);
                break;

            case "/pipeline":
                await sendLong(bot, await getPipeline(), chatId);
                break;

            case "/spend":
                await send(bot, await getSpend(), chatId);
                break;

            case "/digest":
                await sendLong(bot, await getDigest(), chatId);
                break;

            case "/ideas":
                await sendLong(bot, await getIdeas(), chatId);
                break;

            case "/good": {
                const id = parseInt(args[0]);
                if (isNaN(id)) { await send(bot, "Usage: /good `<id>`", chatId); break; }
                await send(bot, await rateIdea(id, "good"), chatId);
                break;
            }

            case "/bad": {
                const id = parseInt(args[0]);
                if (isNaN(id)) { await send(bot, "Usage: /bad `<id>`", chatId); break; }
                await send(bot, await rateIdea(id, "bad"), chatId);
                break;
            }

            case "/reach": {
                const drafts = await getDraftedOutreach();
                if (drafts.length === 0) { await send(bot, "No drafted outreach yet.", chatId); break; }
                for (const d of drafts) await send(bot, formatOutreachDraft(d), chatId);
                break;
            }

            case "/posted": {
                const id = parseInt(args[0]);
                const url = args[1];
                if (isNaN(id) || !url) { await send(bot, "Usage: /posted `<id>` `<url>`", chatId); break; }
                await send(bot, await markPostedOutreach(id, url), chatId);
                break;
            }

            case "/reflect": {
                await send(bot, "🔮 Running reflection...", chatId);
                const { runReflect } = await import("./reflect");
                await runReflect();
                await send(bot, "✅ Reflection complete.", chatId);
                break;
            }

            case "/sense": {
                await send(bot, "👁️ Running all sensors...", chatId);
                const { senseHackerNews } = await import("../sense/hn");
                const { senseGithub } = await import("../sense/github");
                const { senseReddit } = await import("../sense/reddit");
                await Promise.all([
                    senseHackerNews().catch((e: any) => console.log("HN err:", e.message)),
                    senseGithub().catch((e: any) => console.log("GH err:", e.message)),
                    senseReddit().catch((e: any) => console.log("Reddit err:", e.message)),
                ]);
                await send(bot, "✅ Sensing complete.", chatId);
                break;
            }

            case "/proposals": {
                const proposals = await getProposals();
                if (proposals.length === 0) {
                    await send(bot, "No proposals yet.", chatId);
                    break;
                }
                for (const p of proposals.filter(p => p.status === "pending").slice(0, 5)) {
                    await send(bot, formatProposal(p), chatId, {
                        reply_markup: approvalKeyboard(`approve_proposal:${p.id}`, `reject_proposal:${p.id}`),
                    });
                }
                const others = proposals.filter(p => p.status !== "pending");
                if (others.length > 0) await send(bot, `_${others.length} reviewed proposals not shown._`, chatId);
                break;
            }

            case "/approve": {
                const id = parseInt(args[0]);
                if (isNaN(id)) { await send(bot, "Usage: /approve `<id>`", chatId); break; }
                await send(bot, await approveProposal(id), chatId);
                break;
            }

            case "/reject": {
                const id = parseInt(args[0]);
                if (isNaN(id)) { await send(bot, "Usage: /reject `<id>`", chatId); break; }
                await send(bot, await rejectProposal(id), chatId);
                break;
            }

            case "/appcloud": {
                const id = parseInt(args[0]);
                if (isNaN(id)) { await send(bot, "Usage: /appcloud `<id>`", chatId); break; }
                await send(bot, await approveCloud(id), chatId);
                break;
            }

            case "/rejcloud": {
                const id = parseInt(args[0]);
                if (isNaN(id)) { await send(bot, "Usage: /rejcloud `<id>`", chatId); break; }
                await send(bot, await rejectCloud(id), chatId);
                break;
            }

            case "/pending": {
                const requests = await getPendingCloudRequests();
                if (requests.length === 0) { await send(bot, "No pending cloud requests.", chatId); break; }
                for (const r of requests) {
                    await send(bot, `⚠️ *Cloud budget request #${r.id}*\n${r.reason}`, chatId, {
                        reply_markup: approvalKeyboard(`approve_cloud:${r.id}`, `reject_cloud:${r.id}`),
                    });
                }
                break;
            }

            case "/colony": {
                const { listColony } = await import("./replicate");
                await sendLong(bot, await listColony(), chatId);
                break;
            }

            case "/replicate": {
                if (!args[0]) {
                    const { listColony } = await import("./replicate");
                    await sendLong(bot, await listColony(), chatId);
                    break;
                }
                const id = parseInt(args[0]);
                if (isNaN(id)) { await send(bot, "Usage: /replicate `<id>`", chatId); break; }
                await send(bot, "🧬 Spawning child organism...", chatId);
                const { spawnChild } = await import("./replicate");
                await send(bot, await spawnChild(id), chatId);
                break;
            }

            default:
                await send(bot, `Unknown command. Type /help for list.`, chatId);
        }
    } catch (err: any) {
        await send(bot, `❌ Error:\n\`\`\`\n${err.message}\n\`\`\``, chatId);
    }
}

// ── Callback query handler (inline keyboard) ──────────────────────────────────

async function handleCallback(bot: TelegramBot, query: TelegramBot.CallbackQuery) {
    const data = query.data ?? "";
    const chatId = query.message?.chat.id ?? CHAT_ID;
    const msgId = query.message?.message_id;

    let responseText = "";

    try {
        const [action, idStr] = data.split(":");
        const id = parseInt(idStr);

        switch (action) {
            case "approve_proposal": responseText = await approveProposal(id); break;
            case "reject_proposal": responseText = await rejectProposal(id); break;
            case "approve_cloud": responseText = await approveCloud(id); break;
            case "reject_cloud": responseText = await rejectCloud(id); break;
            default: responseText = `Unknown action: ${action}`;
        }
    } catch (err: any) {
        responseText = `❌ Error:\n\`\`\`\n${err.message}\n\`\`\``;
    }

    // Answer the callback to remove the loading spinner
    await bot.answerCallbackQuery(query.id, { text: responseText.slice(0, 200) });

    // Edit original message to show result and remove keyboard
    if (msgId) {
        await bot.editMessageReplyMarkup(
            { inline_keyboard: [] },
            { chat_id: chatId, message_id: msgId }
        ).catch(() => { }); // ignore if already edited
    }

    await send(bot, responseText, chatId);
}

// ── Proactive notification poller ─────────────────────────────────────────────
// Runs every NOTIFY_POLL_INTERVAL ms. Drains telegram_notify events from DB
// that were emitted by the heartbeat (cloud approval requests, zombie kills, etc.)

async function startNotificationPoller(bot: TelegramBot) {
    if (!CHAT_ID) {
        console.log("  ⚠️  TELEGRAM_CHAT_ID not set — proactive notifications disabled.");
        return;
    }

    const poll = async () => {
        try {
            const notifications = await drainTelegramNotifications();

            for (const n of notifications) {
                // Cloud budget approval requests get inline keyboard
                if (n.action === "approve_cloud" && n.event_id) {
                    await send(bot, `⚠️ *Cloud budget limit hit*\n${n.message}`, CHAT_ID, {
                        reply_markup: approvalKeyboard(
                            `approve_cloud:${n.event_id}`,
                            `reject_cloud:${n.event_id}`
                        ),
                    });
                } else if (n.action === "approve_proposal" && n.event_id) {
                    await send(bot, n.message, CHAT_ID, {
                        reply_markup: approvalKeyboard(
                            `approve_proposal:${n.event_id}`,
                            `reject_proposal:${n.event_id}`
                        ),
                    });
                } else {
                    await sendLong(bot, n.message);
                }
            }
        } catch {
            // Non-fatal — don't crash the bot on a DB hiccup
        }

        setTimeout(poll, NOTIFY_POLL_INTERVAL);
    };

    setTimeout(poll, NOTIFY_POLL_INTERVAL);
    console.log(`  🔔 Notification poller started (every ${NOTIFY_POLL_INTERVAL / 1000}s)`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
    // Verify DB
    try {
        await query("SELECT 1");
    } catch {
        console.error("❌ Cannot connect to database. Is Docker running?");
        process.exit(1);
    }

    const bot = createBot();

    // Register command handler
    bot.on("message", async (msg) => {
        const text = msg.text ?? "";
        if (!text.startsWith("/")) return; // ignore non-commands

        const parts = text.trim().split(/\s+/);
        const command = parts[0].split("@")[0]; // strip @botname suffix
        const args = parts.slice(1);

        await handleCommand(bot, msg, command, args);
    });

    // Register callback query handler (inline keyboard)
    bot.on("callback_query", async (cbQuery) => {
        await handleCallback(bot, cbQuery);
    });

    // Proactive notification poller
    await startNotificationPoller(bot);

    console.log(`
╔════════════════════════════════════════╗
║  🤖  ORGANISM  — Telegram Bot         ║
╚════════════════════════════════════════╝
  Polling for messages...
  Send /help to the bot to begin.
  ${CHAT_ID ? `Notifications → chat ${CHAT_ID}` : "⚠️  Set TELEGRAM_CHAT_ID for proactive messages"}
`);
}

main().catch(err => {
    console.error("Fatal:", err.message);
    process.exit(1);
});

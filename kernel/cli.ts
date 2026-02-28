import * as readline from "readline";
import { query } from "../state/db";
import { callBrain, approveCloudRequest, rejectCloudRequest, getCloudSpendSummary, getTodayCloudSpend, getCloudBudget } from "../cognition/llm";


/**
 * cli.ts — Interactive terminal REPL for the organism operator.
 *
 * Slash commands: instant DB queries, no LLM needed.
 * Free text: answered by LLM with full organism state as context.
 *
 * Run with: npm run talk
 */

const PROMPT = "\n🧬 you> ";

// ── Context builder for free-text LLM answers ────────────────────────────────

async function buildContext(): Promise<string> {
    const [pipeline, revenue, recentReflection, policies, recentEvents] = await Promise.all([
        query(`SELECT status, COUNT(*) as count FROM opportunity_current_state GROUP BY status ORDER BY count DESC`),
        query(`SELECT COALESCE(SUM(signups),0) as signups FROM metrics_daily`),
        query(`SELECT result->>'summary' as summary, result->>'revenue_assessment' as assessment, created_at
           FROM reflection_log ORDER BY created_at DESC LIMIT 1`),
        query(`SELECT key, value FROM policies ORDER BY key`),
        query(`SELECT type, payload, created_at FROM events ORDER BY created_at DESC LIMIT 10`),
    ]);

    const pipelineMap: Record<string, number> = {};
    for (const row of pipeline.rows) pipelineMap[row.status] = Number(row.count);

    const policyMap: Record<string, any> = {};
    for (const row of policies.rows) policyMap[row.key] = row.value;

    return JSON.stringify({
        pipeline: pipelineMap,
        validation: {
            total_signups: Number(revenue.rows[0]?.signups ?? 0),
        },
        last_reflection: recentReflection.rows[0] ?? null,
        policies: policyMap,
        recent_events: recentEvents.rows.map(e => ({ type: e.type, at: e.created_at })),
    }, null, 2);
}

// ── Slash command handlers ────────────────────────────────────────────────────

async function cmdStatus() {
    const [revenue, pipeline, burn, limit] = await Promise.all([
        query(`SELECT COALESCE(SUM(signups),0) as total_signups FROM metrics_daily`),
        query(`SELECT status, COUNT(*) as count FROM opportunity_current_state GROUP BY status ORDER BY count DESC`),
        getTodayCloudSpend(),
        getCloudBudget(),
    ]);

    const signups = Number(revenue.rows[0]?.total_signups ?? 0);

    console.log(`\n══════════════════════════════════════`);
    console.log(`  ORGANISM STATUS`);
    console.log(`══════════════════════════════════════`);
    console.log(`  Validations: ${signups} Waitlist Signups Captured`);
    console.log(`  Today burn:  $${burn.toFixed(2)} / $${limit.toFixed(2)}`);
    console.log(`  Survival:    ${signups > 0 ? "🟢 ALIVE" : "🔴 NO LEADS YET"}`);
    console.log(`\n  Pipeline:`);
    for (const row of pipeline.rows) {
        console.log(`    ${row.status.padEnd(12)} ${row.count}`);
    }
    console.log(`══════════════════════════════════════`);
}

async function cmdTop() {
    const rows = await query(
        `SELECT title, source, viability_score, pain_score, wtp_score, status
     FROM opportunity_current_state
     WHERE status IN ('new','reviewing')
     ORDER BY viability_score DESC LIMIT 5`
    );

    if (rows.rows.length === 0) {
        console.log(`\n  No opportunities above threshold yet.`);
        return;
    }

    console.log(`\n  TOP OPPORTUNITIES`);
    console.log(`  ─────────────────────────────────────`);
    const oppRows = Array.from(rows.rows);
    for (let i = 0; i < oppRows.length; i++) {
        const o = oppRows[i];
        console.log(`  ${i + 1}. [v:${o.viability_score}] ${o.title?.slice(0, 60)}`);
        console.log(`     ${o.source} | pain:${o.pain_score} wtp:${o.wtp_score}`);
    }
}

async function cmdPipeline() {
    const rows = await query(
        `SELECT id, title, source, status, viability_score, created_at
     FROM opportunity_current_state
     ORDER BY created_at DESC LIMIT 20`
    );

    if (rows.rows.length === 0) {
        console.log(`\n  Pipeline is empty.`);
        return;
    }

    console.log(`\n  PIPELINE (last 20)`);
    console.log(`  ─────────────────────────────────────`);
    for (const o of rows.rows) {
        const age = Math.round((Date.now() - new Date(o.created_at).getTime()) / (1000 * 3600));
        console.log(`  [${o.status.padEnd(10)}] [v:${String(o.viability_score).padEnd(3)}] ${o.title?.slice(0, 55)} (${age}h ago)`);
    }
}

async function cmdProposals() {
    const rows = await query(
        `SELECT id, file_path, rationale, expected_impact, status, created_at
     FROM proposals
     ORDER BY created_at DESC LIMIT 20`
    );

    if (rows.rows.length === 0) {
        console.log(`\n  No proposals yet. Run a cycle to generate self-improvement proposals.`);
        return;
    }

    console.log(`\n  SELF-IMPROVEMENT PROPOSALS`);
    console.log(`  ─────────────────────────────────────`);
    for (const p of rows.rows) {
        const age = Math.round((Date.now() - new Date(p.created_at).getTime()) / (1000 * 3600));
        console.log(`\n  [${p.id}] ${p.status.toUpperCase()} — ${p.file_path} (${age}h ago)`);
        console.log(`  Rationale: ${p.rationale?.slice(0, 100)}`);
        console.log(`  Impact:    ${p.expected_impact?.slice(0, 100)}`);
        if (p.status === "pending") {
            console.log(`  → /approve ${p.id}  or  /reject ${p.id}`);
        }
    }
}

async function cmdApprove(id: number) {
    const proposal = await query(`SELECT * FROM proposals WHERE id = $1`, [id]);
    if (proposal.rows.length === 0) {
        console.log(`  ❌ Proposal ${id} not found.`);
        return;
    }

    const p = proposal.rows[0];
    if (p.status !== "pending") {
        console.log(`  ⚠️  Proposal ${id} is already ${p.status}.`);
        return;
    }

    // Apply the code change
    const fs = await import("fs");
    try {
        const backupPath = `${p.file_path}.bak.${Date.now()}`;
        fs.copyFileSync(p.file_path, backupPath);
        fs.writeFileSync(p.file_path, p.proposed_code, "utf8");

        await query(
            `UPDATE proposals SET status = 'applied', reviewed_at = NOW() WHERE id = $1`, [id]
        );
        await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
            ["proposal_applied", { id, file_path: p.file_path, backup: backupPath }]
        );

        console.log(`  ✅ Proposal ${id} applied to ${p.file_path}`);
        console.log(`  📦 Backup saved to ${backupPath}`);
    } catch (err: any) {
        console.log(`  ❌ Failed to apply proposal: ${err.message}`);
    }
}

async function cmdReject(id: number) {
    await query(
        `UPDATE proposals SET status = 'rejected', reviewed_at = NOW() WHERE id = $1`, [id]
    );
    console.log(`  ❌ Proposal ${id} rejected.`);
}

async function cmdApproveCloud(eventId: number) {
    await approveCloudRequest(eventId);
}

async function cmdRejectCloud(eventId: number) {
    await rejectCloudRequest(eventId);
}

async function cmdDigest() {
    const { generateDigest } = await import("./digest");
    const digest = await generateDigest();
    console.log(digest);
}

async function cmdReflect() {
    console.log(`\n  🔮 Forcing reflection now...`);
    // Temporarily bypass interval check by calling the inner function directly
    const { runReflect } = await import("./reflect");
    await runReflect();
}

async function cmdSense() {
    console.log(`\n  👁️  Running all sensors now...`);
    const { senseHackerNews } = await import("../sense/hn");
    const { senseReddit } = await import("../sense/reddit");
    const { senseG2 } = await import("../sense/g2");

    await Promise.all([
        senseHackerNews().then(() => console.log("  ✅ HN done")),
        senseG2().then(() => console.log("  ✅ G2 done")),
        senseReddit().catch((e: any) => console.log(`  ⚠️  Reddit: ${e.message}`)),
    ]);
    console.log(`  ✅ Sensing complete.`);
}

async function cmdColony() {
    console.log(`\n  Colony listing disabled. Check the 'colonies/' directory for active instances.`);
}

async function cmdSpend() {

    const s = await getCloudSpendSummary();
    const pct = s.budget > 0 ? ((s.today / s.budget) * 100).toFixed(0) : "0";
    const bar = "█".repeat(Math.round(Math.min(20, (s.today / Math.max(s.budget, 0.01)) * 20)))
        + "░".repeat(Math.max(0, 20 - Math.round(Math.min(20, (s.today / Math.max(s.budget, 0.01)) * 20))));

    console.log(`\n══════════════════════════════════════`);
    console.log(`  ☁️  CLOUD LLM SPEND`);
    console.log(`══════════════════════════════════════`);
    console.log(`  Today:    $${s.today.toFixed(4)} / $${s.budget.toFixed(2)} (${pct}%)`);
    console.log(`  [${bar}]`);
    console.log(`  Remaining: $${s.remaining.toFixed(4)}`);
    console.log(`  This week: $${s.week.toFixed(4)}`);
    console.log(`  All-time:  $${s.allTime.toFixed(4)}`);

    if (s.breakdown.length > 0) {
        console.log(`\n  Today by model:`);
        for (const b of s.breakdown) {
            console.log(`    ${b.model.padEnd(16)} ${b.calls} call${b.calls !== 1 ? "s" : ""}  $${b.cost.toFixed(4)}`);
        }
    } else {
        console.log(`\n  No cloud calls today.`);
    }
    console.log(`══════════════════════════════════════`);
}


function cmdHelp() {
    console.log(`
  SLASH COMMANDS (instant, no LLM)
  ─────────────────────────────────────────────────
  /status                 Survival summary: revenue, budget, pipeline
  /pipeline               All opportunities with status
  /top                    Top 5 opportunities by viability
  /spend                  Cloud LLM spend: today / week / all-time by model
  /digest                 Print today's full digest
  /reflect                Force a reflection cycle now
  /sense                  Run all sensors immediately
  /proposals              List self-improvement proposals
  /approve <id>           Apply an approved proposal to disk
  /reject <id>            Reject a proposal
  /approve-cloud <id>     Approve a pending cloud LLM budget request
  /reject-cloud <id>      Reject a pending cloud LLM budget request
  /help                   Show this help

  FREE TEXT (LLM-powered)
  ─────────────────────────────────────────────────
  Type any question in plain English. The organism
  will answer with its live state as context.

  Examples:
    "Why haven't we pursued any opportunities?"
    "What should I focus on today?"
    "Which sensing source is performing best?"

  /exit  or  Ctrl-C to quit.
  `);
}

// ── Main REPL loop ────────────────────────────────────────────────────────────

async function handleInput(line: string): Promise<boolean> {
    const trimmed = line.trim();
    if (!trimmed) return true;

    if (trimmed === "/exit" || trimmed === "/quit") return false;

    if (trimmed.startsWith("/")) {
        const [cmd, ...args] = trimmed.split(/\s+/);

        switch (cmd) {
            case "/status": await cmdStatus(); break;
            case "/top": await cmdTop(); break;
            case "/pipeline": await cmdPipeline(); break;
            case "/proposals": await cmdProposals(); break;
            case "/spend": await cmdSpend(); break;
            case "/digest": await cmdDigest(); break;
            case "/reflect": await cmdReflect(); break;
            case "/sense": await cmdSense(); break;
            case "/colony": await cmdColony(); break;
            case "/help": cmdHelp(); break;

            case "/approve": {
                const id = parseInt(args[0]);
                if (isNaN(id)) { console.log("  Usage: /approve <id>"); break; }
                await cmdApprove(id);
                break;
            }
            case "/reject": {
                const id = parseInt(args[0]);
                if (isNaN(id)) { console.log("  Usage: /reject <id>"); break; }
                await cmdReject(id);
                break;
            }
            case "/approve-cloud": {
                const id = parseInt(args[0]);
                if (isNaN(id)) { console.log("  Usage: /approve-cloud <id>"); break; }
                await cmdApproveCloud(id);
                break;
            }
            case "/replicate": {
                if (!args[0]) { await cmdColony(); break; }
                const id = args[0]; // expecting a string guid
                const { spawnChild } = await import("./replicate");
                const result = await spawnChild(id);
                console.log(`  ${result}`);
                break;
            }
            case "/reject-cloud": {
                const id = parseInt(args[0]);
                if (isNaN(id)) { console.log("  Usage: /reject-cloud <id>"); break; }
                await cmdRejectCloud(id);
                break;
            }
            case "/reach": {
                const { getDraftedOutreach, formatOutreachDraft } = await import("./commands");
                const drafts = await getDraftedOutreach();
                if (drafts.length === 0) { console.log("  No drafted outreach yet."); break; }
                for (const d of drafts) console.log(`\n${formatOutreachDraft(d)}`);
                break;
            }
            case "/posted": {
                const [idStr, url] = args;
                const id = parseInt(idStr);
                if (isNaN(id) || !url) { console.log("  Usage: /posted <id> <url>"); break; }
                const { markPostedOutreach } = await import("./commands");
                console.log(`  ${await markPostedOutreach(id, url)}`);
                break;
            }
            case "/ideas": {
                const { getIdeas } = await import("./commands");
                console.log(`\n${await getIdeas()}`);
                break;
            }
            case "/good": {
                const id = parseInt(args[0]);
                if (isNaN(id)) { console.log("  Usage: /good <id>"); break; }
                const { rateIdea } = await import("./commands");
                console.log(`  ${await rateIdea(id, "good")}`);
                break;
            }
            case "/bad": {
                const id = parseInt(args[0]);
                if (isNaN(id)) { console.log("  Usage: /bad <id>"); break; }
                const { rateIdea } = await import("./commands");
                console.log(`  ${await rateIdea(id, "bad")}`);
                break;
            }
            default:
                console.log(`  Unknown command: ${cmd}. Type /help for list.`);

        }
    } else {
        // Free-text: ask LLM with full organism context
        console.log(`\n  🤔 Thinking...`);
        try {
            const context = await buildContext();
            const prompt = `You are the Organism — an autonomous economic agent.
Answer the operator's question honestly and concisely using the live state below.
Be direct. No filler. Max 4 sentences unless a list is needed.

ORGANISM STATE:
${context}

OPERATOR ASKS: ${trimmed}`;

            const answer = await callBrain(prompt, "operator conversation", false, "chat");
            console.log(`\n  🧬 ${answer.trim().replace(/\n/g, "\n  ")}`);
        } catch (err: any) {
            console.log(`  ❌ Brain error: ${err.message}`);
        }
    }

    return true;
}

async function main() {
    // Verify DB connection
    try {
        await query("SELECT 1");
    } catch {
        console.error("❌ Cannot connect to database. Is Docker running?");
        process.exit(1);
    }

    console.log(`
╔════════════════════════════════════════╗
║  🧬  ORGANISM  — Operator Interface   ║
╚════════════════════════════════════════╝
  Type /help to see commands.
  Ask anything in plain English.
  Ctrl-C or /exit to quit.
`);

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
    });

    const askQuestion = () => {
        rl.question(PROMPT, async (line) => {
            const keepGoing = await handleInput(line).catch(err => {
                console.error(`  ❌ Error: ${err.message}`);
                return true;
            });

            if (keepGoing) {
                askQuestion();
            } else {
                console.log("\n  Goodbye.\n");
                rl.close();
                process.exit(0);
            }
        });
    };

    askQuestion();
}

main().catch(err => {
    console.error("Fatal:", err.message);
    process.exit(1);
});

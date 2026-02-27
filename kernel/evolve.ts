import fs from "fs";
import path from "path";
import { callBrain } from "../cognition/llm";
import { query } from "../state/db";

/**
 * evolve.ts — Self-improvement engine.
 *
 * Reads the organism's own source code, analyzes performance context,
 * and generates file-level improvement proposals stored in the DB.
 *
 * RULE: The organism PROPOSES. The human APPROVES. The organism APPLIES.
 * No code is ever written without an explicit /approve <id> from the operator.
 *
 * Runs once per reflection cycle (after runReflect()).
 */

// Source directories the organism can read and improve
const SOURCE_DIRS = ["kernel", "sense", "cognition"];
const MAX_FILE_SIZE = 8000; // chars — avoid bloating the prompt
const MAX_PROPOSALS_PER_RUN = 3; // don't flood the operator

// ── Source reader ─────────────────────────────────────────────────────────────

function readSourceFiles(): Array<{ file: string; code: string }> {
    const files: Array<{ file: string; code: string }> = [];

    for (const dir of SOURCE_DIRS) {
        if (!fs.existsSync(dir)) continue;
        const entries = fs.readdirSync(dir).filter(f => f.endsWith(".ts"));

        for (const entry of entries) {
            const filePath = path.join(dir, entry);
            try {
                const code = fs.readFileSync(filePath, "utf8").slice(0, MAX_FILE_SIZE);
                files.push({ file: filePath, code });
            } catch {
                // Skip unreadable files
            }
        }
    }

    return files;
}

// ── Performance context ───────────────────────────────────────────────────────

async function gatherPerfContext(): Promise<Record<string, any>> {
    const [cycles, brainErrors, opportunities, outreach, lastReflection] = await Promise.all([
        query(`SELECT status, COUNT(*) as count FROM cycles WHERE started_at >= NOW() - INTERVAL '7 days' GROUP BY status`),
        query(`SELECT COUNT(*) as count FROM events WHERE type = 'brain_error' AND created_at >= NOW() - INTERVAL '7 days'`),
        query(`SELECT status, COUNT(*) as count, ROUND(AVG(viability_score)) as avg_viability
           FROM opportunity_current_state GROUP BY status ORDER BY count DESC`),
        query(`SELECT channel, status, COUNT(*) as count FROM reach_log GROUP BY channel, status`),
        query(`SELECT result->>'summary' as summary, result->>'top_concern' as concern,
                  result->>'strategic_notes' as focus, created_at
           FROM reflection_log ORDER BY created_at DESC LIMIT 1`),
    ]);

    return {
        cycle_health: cycles.rows,
        brain_errors_7d: Number(brainErrors.rows[0]?.count ?? 0),
        opportunity_stats: opportunities.rows,
        outreach_stats: outreach.rows,
        last_reflection: lastReflection.rows[0] ?? null,
    };
}

// ── Proposal generator ────────────────────────────────────────────────────────

async function generateProposals(
    sourceFiles: Array<{ file: string; code: string }>,
    perfContext: Record<string, any>
): Promise<any[]> {
    // Summarize files for the prompt (don't dump all code — too long)
    const fileSummary = sourceFiles
        .map(f => `--- ${f.file} (${f.code.length} chars) ---\n${f.code}`)
        .join("\n\n");

    const prompt = `You are the self-improvement engine of an autonomous economic agent called Organism.
Study the codebase and performance context below. Identify up to ${MAX_PROPOSALS_PER_RUN} concrete improvements.

PERFORMANCE CONTEXT:
${JSON.stringify(perfContext, null, 2)}

SOURCE FILES:
${fileSummary}

RULES FOR PROPOSALS:
- Be specific: target one exact file and one exact code block
- The improvement must be measurable (faster sensing, better scoring, fewer errors, etc.)
- Respect the system philosophy: validate before build, revenue > engagement, adapt or die
- current_code must be the EXACT text that exists in the file (copy-paste accurate)
- proposed_code must be a drop-in replacement for current_code
- Do not propose adding new files or new entire modules — only targeted function-level changes
- Do not propose changes that require external API keys not already in .env
- Do not propose removing zombie kill logic, budget guards, or human approval gates

Respond ONLY with valid JSON. No markdown, no explanation:
[
  {
    "file_path": "kernel/decide.ts",
    "rationale": "Why this specific change improves survival",
    "expected_impact": "Measurable outcome: e.g. +15% opportunity selection accuracy",
    "current_code": "...",
    "proposed_code": "..."
  }
]

If no meaningful improvements exist, return an empty array: []
`;

    const response = await callBrain(prompt, "self-improvement analysis", false, "planning");

    try {
        const clean = response.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(clean);
        if (!Array.isArray(parsed)) return [];
        return parsed.slice(0, MAX_PROPOSALS_PER_RUN);
    } catch {
        await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
            ["evolve_parse_fail", { raw: response.slice(0, 500) }]
        );
        return [];
    }
}

// ── Proposal storage ──────────────────────────────────────────────────────────

async function storeProposals(proposals: any[]): Promise<number> {
    let stored = 0;

    for (const p of proposals) {
        if (!p.file_path || !p.current_code || !p.proposed_code) continue;

        // Verify the current_code actually exists in the file (prevent hallucinations)
        let fileContent = "";
        try {
            fileContent = fs.readFileSync(p.file_path, "utf8");
        } catch {
            console.log(`  ⚠️  Proposal targets nonexistent file: ${p.file_path} — skipped`);
            continue;
        }

        if (!fileContent.includes(p.current_code.trim())) {
            console.log(`  ⚠️  Proposal for ${p.file_path} — current_code not found in file — skipped`);
            await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
                ["evolve_hallucination", { file: p.file_path, snippet: p.current_code.slice(0, 100) }]
            );
            continue;
        }

        await query(
            `INSERT INTO proposals (file_path, current_code, proposed_code, rationale, expected_impact)
       VALUES ($1, $2, $3, $4, $5)`,
            [p.file_path, p.current_code, p.proposed_code, p.rationale, p.expected_impact]
        );
        stored++;
    }

    return stored;
}

// ── Main entry ────────────────────────────────────────────────────────────────

export async function runEvolve() {
    // Only run once per day maximum
    const recentRun = await query(
        `SELECT id FROM events WHERE type = 'evolve_complete' AND DATE(created_at) = CURRENT_DATE LIMIT 1`
    );
    if (recentRun.rows.length > 0) {
        console.log(`  ⚙️  Evolve already ran today. Skipping.`);
        return;
    }

    console.log(`\n⚙️  EVOLVE: Reading own code and generating improvement proposals...`);

    try {
        const sourceFiles = readSourceFiles();
        console.log(`  📂 Read ${sourceFiles.length} source files`);

        const perfContext = await gatherPerfContext();
        const proposals = await generateProposals(sourceFiles, perfContext);

        if (proposals.length === 0) {
            console.log(`  ✓ No improvements proposed this cycle.`);
            await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
                ["evolve_complete", { proposals_generated: 0 }]
            );
            return;
        }

        const stored = await storeProposals(proposals);

        await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
            ["evolve_complete", { proposals_generated: stored }]
        );

        console.log(`\n  🔧 ${stored} proposal(s) ready for review.`);
        console.log(`  Run 'npm run talk' then type /proposals to review them.\n`);

    } catch (err: any) {
        console.error(`  ❌ Evolve failed: ${err.message}`);
        await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
            ["evolve_error", { error: err.message }]
        );
    }
}

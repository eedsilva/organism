import fs from "fs";
import path from "path";
import { query } from "../state/db";
import { callBrain } from "../cognition/llm";

/**
 * replicate.ts — Self-replication engine (Phase 5).
 *
 * When the organism identifies a consistently high-performing niche,
 * it proposes spawning a specialized child organism.
 *
 * FLOW:
 *   1. checkReplicationReadiness() — called from reflect.ts weekly
 *      - Analyzes source performance stats
 *      - Asks LLM if a focused child would outperform parent
 *      - Stores a ReplicationSpec in replication_log (status=pending)
 *      - Notifies operator via events table (CLI + Telegram)
 *
 *   2. spawnChild(specId) — called from CLI /replicate <id> or Telegram button
 *      - Copies source tree to colony/<child_name>/
 *      - Writes specialized .env + docker-compose.yml
 *      - Writes seed_policies.sql with niche overrides
 *      - Writes START.md with exact launch commands
 *      - Marks replication_log entry as 'spawned'
 *
 * RULE: Operator must explicitly approve via /replicate <id>.
 *       The child is NEVER auto-started.
 */

const COLONY_DIR = path.resolve("colony");

// Minimum conditions before proposing a child
const MIN_SHIPPED_PRODUCTS = 2;
const MIN_AVG_VIABILITY = 50;
const MIN_PURSUE_FROM_SOURCE = 2;

// ── Niche analysis (runs inside reflect.ts weekly) ────────────────────────────

export async function checkReplicationReadiness(perfContext?: Record<string, any>) {
    // Policy guard
    const enabled = await query(`SELECT value FROM policies WHERE key = 'replication_enabled'`);
    if (enabled.rows[0]?.value === 'false' || enabled.rows[0]?.value === false) {
        return;
    }

    // Minimum shipped products required
    const shipped = await query(
        `SELECT COUNT(*) as count FROM opportunities WHERE status = 'shipped'`
    );
    if (Number(shipped.rows[0]?.count ?? 0) < MIN_SHIPPED_PRODUCTS) {
        console.log(`  🧬 Replication check: not enough shipped products yet (need ${MIN_SHIPPED_PRODUCTS}).`);
        return;
    }

    // Only propose once per day max
    const recentProposal = await query(
        `SELECT id FROM replication_log WHERE DATE(created_at) = CURRENT_DATE AND status = 'pending' LIMIT 1`
    );
    if (recentProposal.rows.length > 0) return;

    // Find top-performing source
    const sourcePerf = await query(
        `SELECT source,
            COUNT(*) as total,
            SUM(CASE WHEN status IN ('pursue','building','shipped') THEN 1 ELSE 0 END) as pursued,
            ROUND(AVG(viability_score)) as avg_viability
     FROM opportunities
     GROUP BY source
     HAVING SUM(CASE WHEN status IN ('pursue','building','shipped') THEN 1 ELSE 0 END) >= $1
        AND AVG(viability_score) >= $2
     ORDER BY avg_viability DESC, pursued DESC
     LIMIT 3`,
        [MIN_PURSUE_FROM_SOURCE, MIN_AVG_VIABILITY]
    );

    if (sourcePerf.rows.length === 0) {
        console.log(`  🧬 Replication check: no source meets threshold yet.`);
        return;
    }

    console.log(`\n🧬 REPLICATION: Analyzing niche potential...`);

    const prompt = `You are the Organism — an autonomous economic agent that has been running for some time.
Analyze these top-performing sensing sources and determine if spawning a focused child organism makes sense.

TOP PERFORMING SOURCES:
${JSON.stringify(sourcePerf.rows, null, 2)}

RULES:
- A child is worth spawning if one source has significantly higher viability than others
- The child should focus exclusively on that source's niche
- Be conservative — spawning is expensive and requires human oversight

If spawning is recommended, respond ONLY with this JSON:
{
  "recommend": true,
  "child_name": "organism-<niche>",
  "niche_description": "one sentence: the specific niche this child will focus on",
  "focus_sources": ["source1", "source2"],
  "excluded_sources": ["sources the child should ignore"],
  "seed_policies": {
    "hackernews_weight": "1.0",
    "reddit_weight": "1.5"
  },
  "rationale": "one sentence: why this niche deserves its own agent",
  "expected_advantage": "one sentence: what the child will do better than the parent"
}

If spawning is NOT recommended, respond ONLY with:
{ "recommend": false, "reason": "brief reason" }
`;

    const response = await callBrain(prompt, "replication niche analysis", false, "planning");

    let spec: any = null;
    try {
        const clean = response.replace(/```json|```/g, "").trim();
        spec = JSON.parse(clean);
    } catch {
        console.log(`  ⚠️  Replication analysis parse failed.`);
        return;
    }

    if (!spec?.recommend) {
        console.log(`  ✓ Replication not recommended: ${spec?.reason ?? "unknown reason"}`);
        return;
    }

    // Store the proposal
    await query(
        `INSERT INTO replication_log (child_niche, spec, status)
     VALUES ($1, $2, 'pending')`,
        [spec.child_name, JSON.stringify(spec)]
    );

    // Notify operator
    await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
        ["replication_proposed", { child_name: spec.child_name, niche: spec.niche_description }]
    );

    // Queue Telegram notification
    await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
        ["telegram_notify", {
            message: `🧬 *Replication proposed*\nNiche: ${spec.child_name}\n${spec.niche_description}\n\nApprove with /replicate in the CLI.`,
            action: "replicate",
        }]
    ).catch(() => { });

    console.log(`\n  🧬 REPLICATION PROPOSED: ${spec.child_name}`);
    console.log(`  ${spec.niche_description}`);
    console.log(`  Run: /replicate   to see pending specs`);
    console.log(`  Run: /replicate <id>  to approve and spawn\n`);
}

// ── List pending specs ────────────────────────────────────────────────────────

export async function listColony(): Promise<string> {
    const rows = await query(
        `SELECT id, child_niche, status, spec->>'niche_description' as niche,
            spec->>'rationale' as rationale, created_at
     FROM replication_log ORDER BY created_at DESC LIMIT 10`
    );

    if (rows.rows.length === 0) {
        return "No colony yet. The organism will propose when a niche stands out.";
    }

    const lines = rows.rows.map((r: any) => {
        const age = Math.round((Date.now() - new Date(r.created_at).getTime()) / 3_600_000);
        return `[${r.id}] ${r.status.toUpperCase()} — ${r.child_niche} (${age}h ago)\n       ${r.niche}\n       ${r.rationale}${r.status === "pending" ? `\n       → /replicate ${r.id}` : ""}`;
    });

    return `🧬 COLONY\n\n${lines.join("\n\n")}`;
}

// ── Spawn child organism ──────────────────────────────────────────────────────

export async function spawnChild(specId: number): Promise<string> {
    const res = await query(`SELECT * FROM replication_log WHERE id = $1`, [specId]);
    if (res.rows.length === 0) return `❌ Spec ${specId} not found.`;

    const record = res.rows[0];
    if (record.status !== "pending") return `⚠️ Spec ${specId} is already ${record.status}.`;

    const spec: any = record.spec;
    const childName = spec.child_name ?? `organism-child-${specId}`;
    const childDir = path.join(COLONY_DIR, childName);

    if (fs.existsSync(childDir)) {
        return `⚠️ Directory already exists: ${childDir}`;
    }

    console.log(`\n🧬 SPAWNING: ${childName} → ${childDir}`);

    try {
        // 1. Copy source tree (exclude node_modules, products, colony, .env)
        const parentRoot = path.resolve(".");
        fs.mkdirSync(childDir, { recursive: true });

        const EXCLUDE = new Set(["node_modules", "products", "colony", ".git", "dist", ".env"]);

        function copyDir(src: string, dest: string) {
            fs.mkdirSync(dest, { recursive: true });
            for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
                if (EXCLUDE.has(entry.name)) continue;
                const srcPath = path.join(src, entry.name);
                const destPath = path.join(dest, entry.name);
                if (entry.isDirectory()) {
                    copyDir(srcPath, destPath);
                } else {
                    fs.copyFileSync(srcPath, destPath);
                }
            }
        }

        copyDir(parentRoot, childDir);

        // 2. Find an available Postgres port (5433, 5434, ...)
        const existingChildren = fs.existsSync(COLONY_DIR)
            ? fs.readdirSync(COLONY_DIR).length
            : 0;
        const dbPort = 5433 + existingChildren;
        const childDbName = childName.replace(/[^a-z0-9_]/g, "_");

        // 3. Write child .env
        fs.writeFileSync(path.join(childDir, ".env"),
            `DB_HOST=localhost
DB_PORT=${dbPort}
DB_USER=${childDbName}
DB_PASSWORD=${childDbName}
DB_NAME=${childDbName}

HEARTBEAT_INTERVAL_MS=60000

TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

OLLAMA_MODEL=${process.env.OLLAMA_MODEL ?? "deepseek-v3.1:671b-cloud"}
OLLAMA_DEFAULT_MODEL=${process.env.OLLAMA_DEFAULT_MODEL ?? "deepseek-v3.1:671b-cloud"}
OLLAMA_CODE_MODEL=${process.env.OLLAMA_CODE_MODEL ?? "qwen2.5-coder:32b"}
OPENAI_API_KEY=${process.env.OPENAI_API_KEY ?? ""}
`
        );

        // 4. Write child docker-compose.yml
        fs.writeFileSync(path.join(childDir, "docker-compose.yml"),
            `version: '3.8'
services:
  postgres:
    image: postgres:16
    container_name: ${childDbName}-postgres
    environment:
      POSTGRES_USER: ${childDbName}
      POSTGRES_PASSWORD: ${childDbName}
      POSTGRES_DB: ${childDbName}
    ports:
      - "${dbPort}:5432"
    volumes:
      - ${childDbName}_data:/var/lib/postgresql/data

volumes:
  ${childDbName}_data:
`
        );

        // 5. Write seed_policies.sql with niche overrides
        const policyOverrides = spec.seed_policies ?? {};
        const policyInserts = Object.entries(policyOverrides)
            .map(([k, v]) => `  ('${k}', '${v}')`)
            .join(",\n");

        const seedSql = policyInserts
            ? `-- Child organism policy overrides\nINSERT INTO policies (key, value) VALUES\n${policyInserts}\nON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;\n`
            : `-- No policy overrides for this child.\n`;

        fs.writeFileSync(path.join(childDir, "state", "seed_policies.sql"), seedSql);

        // 6. Write START.md
        fs.writeFileSync(path.join(childDir, "START.md"),
            `# ${childName}

**Niche:** ${spec.niche_description}
**Focus sources:** ${(spec.focus_sources ?? []).join(", ")}
**Rationale:** ${spec.rationale}

## Launch Steps

### 1. Start the child's database
\`\`\`bash
cd ${childDir}
docker compose up -d
\`\`\`

### 2. Initialize the schema
\`\`\`bash
docker exec -i ${childDbName}-postgres psql -U ${childDbName} -d ${childDbName} < state/schema.sql
\`\`\`

### 3. Apply niche-specific policy overrides
\`\`\`bash
docker exec -i ${childDbName}-postgres psql -U ${childDbName} -d ${childDbName} < state/seed_policies.sql
\`\`\`

### 4. Configure Telegram (optional)
Edit \`.env\` and set \`TELEGRAM_BOT_TOKEN\` + \`TELEGRAM_CHAT_ID\`.

### 5. Start the heartbeat
\`\`\`bash
npm install
npm run start
\`\`\`

### 6. Talk to the child
\`\`\`bash
npm run talk
\`\`\`

---
Parent: organism (spawned at ${new Date().toISOString()})
Spec ID: ${specId}
`
        );

        // 7. Mark as spawned
        await query(
            `UPDATE replication_log SET status = 'spawned', child_path = $1 WHERE id = $2`,
            [childDir, specId]
        );
        await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
            ["colony_spawned", { spec_id: specId, child_name: childName, child_path: childDir }]
        );

        console.log(`  ✅ Colony spawned: ${childDir}`);
        console.log(`  📄 Follow ${childDir}/START.md to launch it.\n`);

        return `✅ *${childName}* spawned at \`${childDir}\`\nFollow \`START.md\` to launch it.`;

    } catch (err: any) {
        await query(`UPDATE replication_log SET status = 'failed' WHERE id = $1`, [specId]);
        await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
            ["replication_failed", { spec_id: specId, error: err.message }]
        );
        return `❌ Spawn failed: ${err.message}`;
    }
}

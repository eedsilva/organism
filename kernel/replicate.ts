import { query } from "../state/db";
import { sendPushNotification } from "./notify";
import { exec } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as util from "util";
import * as crypto from "crypto";

const execAsync = util.promisify(exec);

/**
 * replicate.ts — The Cell Division Protocol
 *
 * This module allows the organism to spawn fully independent copies
 * of itself (children) tailored for specific new niches.
 */

// ── Spec Generation ────────────────────────────────────────────────────────────

interface ChildSpec {
    id: string;
    niche: string;
    target_audience: string;
    core_pain: string;
    suggested_sensors: string[];
    policy_overrides: Record<string, any>;
}

export async function proposeReplication(opportunityId: number): Promise<ChildSpec | null> {
    const opp = await query(
        `SELECT title, raw_text, plan FROM opportunities WHERE id = $1`,
        [opportunityId]
    );

    if (opp.rows.length === 0) return null;
    const data = opp.rows[0];

    // Build the spec for the new organism
    const spec: ChildSpec = {
        id: crypto.randomBytes(4).toString("hex"),
        niche: data.title,
        target_audience: "Extracted from opportunity",
        core_pain: data.title,
        suggested_sensors: ["reddit", "hn", "custom_b2b_scraper"],
        policy_overrides: {
            // Niche-specific overrides (e.g., lower spend limits while exploring)
            max_daily_spend: 5.00,
            llm_provider: "ollama",
            min_viability_threshold: 60
        }
    };

    // Save the proposal to the DB
    await query(
        `INSERT INTO replication_log (spec_id, source_opportunity_id, status, spec) 
         VALUES ($1, $2, 'proposed', $3)`,
        [spec.id, opportunityId, spec]
    );

    await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
        ["replication_proposed", { spec_id: spec.id, niche: spec.niche }]
    );

    console.log(`\n🦠 [REPLICATION] New child cell proposed for niche: "${spec.niche}"`);
    console.log(`   Spec ID: ${spec.id} — Run \`npm run replicate ${spec.id}\` to spawn.\n`);

    await sendPushNotification(
        `Replication Proposed: ${spec.id}`,
        `A new child organism has been proposed for the niche: "${spec.niche}".\n\nRun \`npm run replicate ${spec.id}\` to spawn it.`
    );

    return spec;
}

// ── Spawning (The actual fork) ────────────────────────────────────────────────

export async function spawnChild(specId: string) {
    const log = await query(`SELECT spec FROM replication_log WHERE spec_id = $1 AND status = 'proposed'`, [specId]);

    if (log.rows.length === 0) {
        throw new Error(`Spec ${specId} not found or already spawned.`);
    }

    const spec: ChildSpec = log.rows[0].spec;
    const childName = `organism-${spec.id}`;

    // We place children in a `colonies/` directory next to the parent
    const parentDir = path.resolve(__dirname, "../..");
    const coloniesDir = path.join(parentDir, "colonies");
    const childDir = path.join(coloniesDir, childName);

    console.log(`\n🧬 Spawning child: ${childName}...`);

    try {
        if (!fs.existsSync(coloniesDir)) {
            fs.mkdirSync(coloniesDir);
        }

        // 1. Git Clone (or copy) the current codebase
        // For local dev, a fast dir copy is best. In prod, a git clone from the main repo is cleaner.
        console.log(`  └─ Copying DNA (codebase)...`);
        await execAsync(`cp -R ${path.resolve(__dirname, "..")} ${childDir}`);

        // Clean up copied artifacts that shouldn't transfer
        await execAsync(`rm -rf ${childDir}/node_modules ${childDir}/dist ${childDir}/products ${childDir}/.env`);

        // 2. Setup Child Database
        console.log(`  └─ Bootstrapping neural pathways (database)...`);
        const childDbName = childName.replace(/-/g, "_");

        // Start a dedicated Postgres container for the child
        await execAsync(`
            docker run --name ${childDbName}-postgres \
            -e POSTGRES_USER=${childDbName} \
            -e POSTGRES_PASSWORD=${childDbName}_secret \
            -e POSTGRES_DB=${childDbName} \
            -p $((5432 + Math.floor(Math.random() * 1000))):5432 \
            -d postgres:15-alpine
        `);

        // Wait for DB to boot
        await new Promise(r => setTimeout(r, 3000));

        // 4. Generate custom .env for the child
        console.log(`  └─ Writing environmental adaptations (.env)...`);

        // Parent shares credentials but uses isolated DB
        const parentEnvPath = path.resolve(__dirname, "../.env");
        let envContent = fs.existsSync(parentEnvPath) ? fs.readFileSync(parentEnvPath, 'utf8') : "";

        // Override DB connection
        envContent = envContent.replace(/DB_USER=.*/, `DB_USER=${childDbName}`);
        envContent = envContent.replace(/DB_PASSWORD=.*/, `DB_PASSWORD=${childDbName}_secret`);
        envContent = envContent.replace(/DB_NAME=.*/, `DB_NAME=${childDbName}`);
        // Ensure child doesn't conflict ports if any web servers are added later

        fs.writeFileSync(path.join(childDir, ".env"), envContent);

        // 5. Inject the Child Spec as its core directive
        console.log(`  └─ Encoding specific purpose (Spec)...`);
        fs.writeFileSync(path.join(childDir, "ABOUT_ME.md"),
            `# ${childName}\n\n**Niche:** ${spec.niche}\n\n**Core Pain:** ${spec.core_pain}\n\nSpawned from Parent Organism on ${new Date().toISOString()}`
        );

        // Modify the child's seed data to apply policy overrides
        const seedPath = path.join(childDir, "state", "seed_policies.sql");
        let seedSql = "";
        for (const [key, val] of Object.entries(spec.policy_overrides)) {
            const v = typeof val === 'string' ? `'${val}'` : val;
            seedSql += `INSERT INTO policies (key, value) VALUES ('${key}', ${v}::text) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;\n`;
        }
        fs.writeFileSync(seedPath, seedSql);


        // 6. Provide the launch script for the Operator
        fs.writeFileSync(path.join(childDir, "START.md"),
            `# Launching ${childName}

This is an independent cellular offspring of the original Automaton, wired to hunt purely in the following niche:
**${spec.niche}**

### 1. Enter the cell
\`\`\`bash
cd ${childDir}
\`\`\`

### 2. Initialize the schema
\`\`\`bash
docker exec -i ${childDbName}-postgres psql -U ${childDbName} -d ${childDbName} < state/schema.sql
\`\`\`

### 3. Apply niche-specific policy overrides
\`\`\`bash
docker exec -i ${childDbName}-postgres psql -U ${childDbName} -d ${childDbName} < state/seed_policies.sql
\`\`\`

### 4. Start the heartbeat
\`\`\`bash
npm install
npm run start
\`\`\`

### 5. Talk to the child
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
            `UPDATE replication_log SET status = 'spawned', child_path = $1 WHERE spec_id = $2`,
            [childDir, specId]
        );
        await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
            ["colony_spawned", { spec_id: specId, child_name: childName, child_path: childDir }]
        );

        console.log(`  ✅ Colony spawned: ${childDir}`);
        console.log(`  📄 Follow ${childDir}/START.md to launch it.\n`);

        await sendPushNotification(
            `Colony Spawned: ${childName}`,
            `The replication protocol successfully spawned ${childName}.\n\nPath: ${childDir}\nNiche: ${spec.niche}\n\nFollow START.md within the directory to launch the new organism.`
        );

        return `✅ *${childName}* spawned at \`${childDir}\`\nFollow \`START.md\` to launch it.`;

    } catch (err: any) {
        await query(`UPDATE replication_log SET status = 'failed' WHERE spec_id = $1`, [specId]);
        await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
            ["replication_failed", { spec_id: specId, error: err.message }]
        );
        return `❌ Spawn failed: ${err.message}`;
    }
}

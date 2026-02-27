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
        `SELECT title, raw_text, plan FROM opportunity_current_state WHERE id = $1`,
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
    const childSchema = `colony_${spec.id}`;

    console.log(`\n🧬 Spawning colony schema: ${childSchema}...`);

    try {
        const { pool } = await import("../state/db");
        const client = await pool.connect();
        try {
            // 1. Setup Child Database Schema
            console.log(`  └─ Bootstrapping neural pathways (schema ${childSchema})...`);
            await client.query(`CREATE SCHEMA IF NOT EXISTS ${childSchema}`);
            await client.query(`SET search_path TO ${childSchema}, public`);

            const schemaSql = fs.readFileSync(path.join(__dirname, "../state/schema.sql"), "utf-8");

            // Execute schema directly; it will build tables in childSchema
            const statements = schemaSql.split(/;(?=(?:[^$]*[$][^$]*[$])*[^$]*$)/g);
            for (const stmt of statements) {
                const trimmed = stmt.trim();
                if (trimmed && !trimmed.startsWith("--")) {
                    await client.query(trimmed);
                }
            }

            // 2. Inject the Child Spec (Policy Overrides)
            console.log(`  └─ Encoding specific purpose (Spec)...`);
            for (const [key, val] of Object.entries(spec.policy_overrides)) {
                const v = typeof val === 'object' ? JSON.stringify(val) : String(val);
                await client.query(
                    `INSERT INTO policies (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
                    [key, v]
                );
            }

            // Also override the niche config so the colony knows its purpose
            await client.query(`INSERT INTO policies (key, value) VALUES ('colony_niche', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [spec.niche]);

            // 3. Register Colony in main registry
            await client.query(`SET search_path TO public`);
            await client.query(
                `INSERT INTO colonies (id, niche, schema_name, policy_overrides) VALUES ($1, $2, $3, $4)`,
                [spec.id, spec.niche, childSchema, JSON.stringify(spec.policy_overrides)]
            );
        } finally {
            client.release();
        }

        // 4. Spawn Node.js Worker Thread
        console.log(`  └─ Starting dedicated Node.js Worker Thread...`);
        const { Worker } = await import("worker_threads");

        const worker = new Worker(path.resolve(__dirname, "heartbeat.ts"), {
            // Use ts-node to execute the worker file
            execArgv: ["-r", "ts-node/register/transpile-only"],
            env: { ...process.env, COLONY_SCHEMA: childSchema }
        });

        worker.on("error", (err) => {
            console.error(`❌ Colony Worker [${childSchema}] crashed:`, err);
        });

        worker.on("exit", (code) => {
            console.log(`Colony Worker [${childSchema}] exited with code ${code}.`);
        });

        // 5. Mark as spawned
        await query(
            `UPDATE replication_log SET status = 'spawned', child_path = $1 WHERE spec_id = $2`,
            [`WorkerThread:${childSchema}`, specId]
        );

        await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
            ["colony_spawned", { spec_id: specId, schema_name: childSchema, mechanism: "worker_thread" }]
        );

        console.log(`  ✅ Colony active! Operating locally on schema: ${childSchema}`);

        await sendPushNotification(
            `Colony Spawned: ${spec.id}`,
            `The replication protocol successfully spawned a colony thread.\nSchema: ${childSchema}\nNiche: ${spec.niche}`
        );

        return `✅ *Colony ${spec.id}* spawned on schema \`${childSchema}\` via Node.js worker thread.`;

    } catch (err: any) {
        await query(`UPDATE replication_log SET status = 'failed' WHERE spec_id = $1`, [specId]);
        await query(`INSERT INTO events (type, payload) VALUES ($1, $2)`,
            ["replication_failed", { spec_id: specId, error: err.message }]
        );
        return `❌ Spawn failed: ${err.message}`;
    }
}

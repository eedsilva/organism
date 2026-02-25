/**
 * scripts/migrate.ts
 *
 * Runs all pending migrations in order.
 * Tracks applied migrations in a `migrations` table.
 * Safe to run multiple times — already-applied migrations are skipped.
 *
 * Usage:
 *   npx ts-node scripts/migrate.ts
 */

import fs from "fs";
import path from "path";
import { pool, query } from "../state/db";
import dotenv from "dotenv";

dotenv.config();

const MIGRATIONS_DIR = path.join(__dirname, "../state/migrations");

async function ensureMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      filename TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

async function getApplied(): Promise<Set<string>> {
  const result = await query(`SELECT filename FROM migrations ORDER BY filename`);
  return new Set(result.rows.map((r: any) => r.filename));
}

async function runMigration(filepath: string, filename: string) {
  const sql = fs.readFileSync(filepath, "utf-8");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      `INSERT INTO migrations (filename) VALUES ($1)`,
      [filename]
    );
    await client.query("COMMIT");
    console.log(`  ✅ ${filename}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function migrate() {
  console.log("🔄 Running migrations...\n");

  await ensureMigrationsTable();
  const applied = await getApplied();

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`❌ Migrations directory not found: ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // alphabetical = chronological if named correctly

  let ran = 0;

  for (const filename of files) {
    if (applied.has(filename)) {
      console.log(`  ⏭  ${filename} (already applied)`);
      continue;
    }

    const filepath = path.join(MIGRATIONS_DIR, filename);
    try {
      await runMigration(filepath, filename);
      ran++;
    } catch (err: any) {
      console.error(`\n❌ Failed on ${filename}:`);
      console.error(err.message);
      process.exit(1);
    }
  }

  if (ran === 0) {
    console.log("\n✨ Already up to date.");
  } else {
    console.log(`\n✨ ${ran} migration(s) applied.`);
  }

  await pool.end();
}

migrate();
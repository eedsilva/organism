/**
 * scripts/migrate.ts
 *
 * Runs all pending migrations in order.
 * Tracks applied migrations in a `migrations` table.
 * Safe to run multiple times — already-applied migrations are skipped.
 *
 * Usage:
 *   npm run db:migrate
 *   npx ts-node -r dotenv/config scripts/migrate.ts
 *
 * Flags:
 *   --dry-run   List pending migrations without running them
 *   --status    Show all migrations and their applied status, then exit
 */

import fs from "fs";
import path from "path";
import { pool, query } from "../state/db";
import dotenv from "dotenv";

dotenv.config();

const MIGRATIONS_DIR = path.resolve(__dirname, "../state/migrations");

// ── Migrations tracking table ─────────────────────────────────────────────────

async function ensureMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id          SERIAL PRIMARY KEY,
      filename    TEXT UNIQUE NOT NULL,
      applied_at  TIMESTAMP DEFAULT NOW()
    )
  `);
}

async function getApplied(): Promise<Set<string>> {
  const result = await query(`SELECT filename FROM migrations ORDER BY filename`);
  return new Set(result.rows.map((r: any) => r.filename));
}

// ── Migration runner ──────────────────────────────────────────────────────────
//
// NOTE: We do NOT wrap migrations in a transaction by default.
// PostgreSQL cannot run certain DDL statements (ALTER TABLE ... ADD COLUMN GENERATED,
// DO $$ blocks that contain DDL) inside an explicit transaction.
// Each migration file is atomic at the statement level via PostgreSQL's
// implicit transaction for individual DDL commands.
//
// If you need a transactional migration, add -- @transaction at the top of the file.

async function runMigration(filepath: string, filename: string) {
  const sql = fs.readFileSync(filepath, "utf-8");
  const useTransaction = sql.includes("-- @transaction");

  const client = await pool.connect();
  try {
    if (useTransaction) {
      await client.query("BEGIN");
    }

    // Split on semicolons and run statement-by-statement so errors are localized.
    // Preserve $$ dollar-quoted blocks by not splitting inside them.
    const statements = splitStatements(sql);
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (!trimmed || trimmed.startsWith("--")) continue;
      await client.query(trimmed);
    }

    // Record the migration as applied
    await client.query(
      `INSERT INTO migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING`,
      [filename]
    );

    if (useTransaction) {
      await client.query("COMMIT");
    }

    console.log(`  ✅ ${filename}`);
  } catch (err: any) {
    if (useTransaction) {
      await client.query("ROLLBACK").catch(() => { });
    }
    throw new Error(`Migration failed [${filename}]: ${err.message}`);
  } finally {
    client.release();
  }
}

/**
 * Splits a SQL file into individual statements.
 * Handles:
 *   - Dollar-quoted blocks (DO $$ ... $$, $body$ ... $body$)
 *   - Single-line comments (-- ...) — skipped entirely
 *   - Semicolons as statement terminators
 */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inDollarQuote = false;
  let dollarTag = "";
  let i = 0;

  while (i < sql.length) {
    // Skip -- line comments (but NOT inside a dollar-quote block)
    if (!inDollarQuote && sql[i] === "-" && sql[i + 1] === "-") {
      // Advance to end of line
      while (i < sql.length && sql[i] !== "\n") i++;
      current += "\n"; // preserve newline for formatting
      continue;
    }

    // Detect start/end of dollar-quote block ($$, $tag$, etc.)
    if (sql[i] === "$") {
      const tagEnd = sql.indexOf("$", i + 1);
      if (tagEnd !== -1) {
        const tag = sql.slice(i, tagEnd + 1); // e.g. "$$" or "$body$"
        // Only treat as dollar-quote if the tag contains no whitespace or newlines
        if (!tag.includes(" ") && !tag.includes("\n")) {
          if (!inDollarQuote) {
            inDollarQuote = true;
            dollarTag = tag;
            current += tag;
            i = tagEnd + 1;
            continue;
          } else if (tag === dollarTag) {
            inDollarQuote = false;
            current += tag;
            i = tagEnd + 1;
            continue;
          }
        }
      }
    }

    // Split on semicolons only when not inside a dollar-quote block
    if (!inDollarQuote && sql[i] === ";") {
      current += ";";
      const trimmed = current.trim();
      if (trimmed && trimmed !== ";") {
        statements.push(trimmed);
      }
      current = "";
      i++;
      continue;
    }

    current += sql[i];
    i++;
  }

  // Remaining content without trailing semicolon
  const remaining = current.trim();
  if (remaining && remaining !== ";") {
    statements.push(remaining);
  }

  return statements;
}

// ── CLI modes ─────────────────────────────────────────────────────────────────

async function statusMode() {
  await ensureMigrationsTable();
  const applied = await getApplied();

  const files = fs.existsSync(MIGRATIONS_DIR)
    ? fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith(".sql")).sort()
    : [];

  console.log("\n  MIGRATION STATUS");
  console.log("  ─────────────────────────────────────");
  for (const f of files) {
    const state = applied.has(f) ? "✅ applied" : "⏳ pending";
    console.log(`  ${state}  ${f}`);
  }
  const pending = files.filter(f => !applied.has(f));
  console.log(`\n  ${applied.size} applied, ${pending.length} pending.\n`);
}

async function migrate() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const statusOnly = args.includes("--status");

  console.log("🔄 Organism DB Migrations\n");

  // Verify DB connection
  try {
    await query("SELECT 1");
  } catch {
    console.error("❌ Cannot connect to database. Is Docker running?\n   Run: npm run infra:start");
    process.exit(1);
  }

  await ensureMigrationsTable();

  if (statusOnly) {
    await statusMode();
    await pool.end();
    return;
  }

  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`❌ Migrations directory not found: ${MIGRATIONS_DIR}`);
    process.exit(1);
  }

  const applied = await getApplied();
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith(".sql"))
    .sort();

  const pending = files.filter(f => !applied.has(f));
  const alreadyApplied = files.filter(f => applied.has(f));

  // Report already-applied
  for (const f of alreadyApplied) {
    console.log(`  ⏭  ${f} (already applied)`);
  }

  if (pending.length === 0) {
    console.log("\n✨ Already up to date.");
    await pool.end();
    return;
  }

  if (dryRun) {
    console.log(`\n  DRY RUN — would apply ${pending.length} migration(s):`);
    for (const f of pending) console.log(`  → ${f}`);
    console.log();
    await pool.end();
    return;
  }

  let ran = 0;
  for (const filename of pending) {
    const filepath = path.join(MIGRATIONS_DIR, filename);
    try {
      await runMigration(filepath, filename);
      ran++;
    } catch (err: any) {
      console.error(`\n❌ ${err.message}`);
      console.error("   Migration halted. Fix the error and re-run.");
      await pool.end();
      process.exit(1);
    }
  }

  console.log(`\n✨ ${ran} migration(s) applied.`);
  await pool.end();
}

migrate();
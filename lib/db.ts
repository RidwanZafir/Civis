import { Database } from "node-sqlite3-wasm";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ensureSeeded } from "./seed";
import { applyMigrations, seedCatalog } from "./catalog";

/**
 * CIVIS stores its data in a single SQLite file.
 *
 * In local development and preview that file lives at `data/civis.db` and grows
 * as users write to the app. Vercel serverless functions are ephemeral, so a
 * runtime-written file would disappear between invocations. To keep the same
 * SQLite model on Vercel, we ship a pre-seeded baseline in the deployment
 * bundle and open it read/write from there on the first cold invoke, letting
 * writes land in the function's temporary filesystem for the lifetime of that
 * warm container.
 *
 * The baseline is generated once by `scripts/generate-seed-db.mjs` into
 * `.vercel/sqlite/civis-seeded.db` and committed so deploys have data without
 * running the seed loop in request time.
 */

const ROOT = process.cwd();
const LIB_DIR = path.join(ROOT, "lib");
const DATA_DIR = path.join(ROOT, "data");

const SCHEMA_SQL = fs.readFileSync(path.join(LIB_DIR, "schema.sql"), "utf8");
const EMERGENCY_SCHEMA_SQL = fs.readFileSync(
  path.join(LIB_DIR, "emergency", "schema.sql"),
  "utf8",
);
const HOSPITAL_SCHEMA_SQL = fs.readFileSync(
  path.join(LIB_DIR, "hospitals", "schema.sql"),
  "utf8",
);
const REGISTRY_SCHEMA_SQL = fs.readFileSync(
  path.join(LIB_DIR, "hospitals", "registry.sql"),
  "utf8",
);

const SEED_DB = path.join(ROOT, ".vercel", "sqlite", "civis-seeded.db");

function writable(dir: string) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Locally the database lives at `data/civis.db`. Serverless hosts (Netlify
 * Functions, Vercel) ship a read-only bundle, so there the bundled seed is
 * copied into the system temp directory on cold start and opened from there.
 */
function defaultDbPath() {
  if (process.env.CIVIS_DB_PATH) return process.env.CIVIS_DB_PATH;
  const serverless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  if (!serverless && writable(DATA_DIR)) return path.join(DATA_DIR, "civis.db");
  const target = path.join(os.tmpdir(), "civis", "civis.db");
  if (!fs.existsSync(target)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(SEED_DB)) {
      fs.copyFileSync(SEED_DB, target);
      fs.chmodSync(target, 0o644);
    }
  }
  return target;
}

type Row = Record<string, unknown>;

type DbHandle = {
  db: Database;
  path: string;
};

const globalForDb = globalThis as unknown as { __civisDb?: DbHandle };

function open(): DbHandle {
  const dbPath = defaultDbPath();
  if (!fs.existsSync(path.dirname(dbPath))) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  // Open the baseline (or an existing local file) read/write so cold Vercel
  // functions can keep the seeded data and accept new writes for the lifetime
  // of the warm container. A fresh empty file is also fine — the seed loop
  // below makes it a complete baseline.
  const db = new Database(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA_SQL);
  db.exec(EMERGENCY_SCHEMA_SQL);
  db.exec(HOSPITAL_SCHEMA_SQL);
  db.exec(REGISTRY_SCHEMA_SQL);
  applyMigrations(db);
  seedCatalog(db);
  const handle = { db, path: dbPath };
  ensureSeeded(handle);
  return handle;
}

export function getDb(): Database {
  if (!globalForDb.__civisDb) {
    globalForDb.__civisDb = open();
  }
  return globalForDb.__civisDb.db;
}

export function dbPath() {
  return globalForDb.__civisDb?.path ?? defaultDbPath();
}

/** Positional-parameter helpers (the WASM driver has no statement objects). */
export function all<T = Row>(sql: string, params: unknown[] = []): T[] {
  return getDb().all(sql, params as never[]) as T[];
}
export function get<T = Row>(sql: string, params: unknown[] = []): T | undefined {
  const rows = getDb().all(sql, params as never[]) as T[];
  return rows[0];
}
export function run(sql: string, params: unknown[] = []) {
  return getDb().run(sql, params as never[]);
}
export function exec(sql: string) {
  getDb().exec(sql);
}
export function transaction<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
export function tableCount(table: string): number {
  const row = get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
  return row?.n ?? 0;
}

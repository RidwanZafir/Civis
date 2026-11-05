import { Database } from "node-sqlite3-wasm";
import fs from "node:fs";
import path from "node:path";
import { ensureSeeded } from "./seed";
import { applyMigrations, seedCatalog } from "./catalog";

const SCHEMA_SQL = fs.readFileSync(
  path.join(process.cwd(), "lib", "schema.sql"),
  "utf8",
);

const EMERGENCY_SCHEMA_SQL = fs.readFileSync(
  path.join(process.cwd(), "lib", "emergency", "schema.sql"),
  "utf8",
);

const HOSPITAL_SCHEMA_SQL = fs.readFileSync(
  path.join(process.cwd(), "lib", "hospitals", "schema.sql"),
  "utf8",
);

// Official directory records (DGHS facility registry). Kept apart from the
// availability tables, which only ever hold organisation-reported data.
const REGISTRY_SCHEMA_SQL = fs.readFileSync(
  path.join(process.cwd(), "lib", "hospitals", "registry.sql"),
  "utf8",
);

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "civis.db");

type Row = Record<string, unknown>;

type DbHandle = {
  db: Database;
  path: string;
};

const globalForDb = globalThis as unknown as { __civisDb?: DbHandle };

function open(): DbHandle {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA_SQL);
  db.exec(EMERGENCY_SCHEMA_SQL);
  db.exec(HOSPITAL_SCHEMA_SQL);
  db.exec(REGISTRY_SCHEMA_SQL);
  applyMigrations(db);
  seedCatalog(db);
  const handle = { db, path: DB_PATH };
  ensureSeeded(handle);
  return handle;
}

export function getDb(): Database {
  if (!globalForDb.__civisDb) {
    globalForDb.__civisDb = open();
  }
  return globalForDb.__civisDb.db;
}

export const dbPath = DB_PATH;

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

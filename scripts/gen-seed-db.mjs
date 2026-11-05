import pkg from "node-sqlite3-wasm";
const { Database } = pkg;
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT_DIR = path.resolve(ROOT, ".ts-output");
const OUT_PATH = path.resolve(ROOT, ".vercel", "sqlite", "civis-seeded.db");

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });

function copyIfNewer(src, dst) {
  const s = fs.statSync(src);
  if (fs.existsSync(dst)) {
    const d = fs.statSync(dst);
    if (d.mtimeMs >= s.mtimeMs) return;
  }
  fs.copyFileSync(src, dst);
}

copyIfNewer(path.join(OUT_DIR, "lib", "catalog.js"), path.join(HERE, "catalog.mjs"));
copyIfNewer(path.join(OUT_DIR, "lib", "seed.js"), path.join(HERE, "seed.mjs"));
copyIfNewer(path.join(OUT_DIR, "lib", "crypto.js"), path.join(HERE, "crypto.mjs"));
copyIfNewer(path.join(OUT_DIR, "lib", "constants.js"), path.join(HERE, "constants.mjs"));

const db = new Database(OUT_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

const readSql = (name) => fs.readFileSync(path.join(ROOT, "lib", name), "utf8");

db.exec(readSql("schema.sql"));
db.exec(readSql("emergency/schema.sql"));
db.exec(readSql("hospitals/schema.sql"));
db.exec(readSql("hospitals/registry.sql"));

// Ensure emergency facility tables exist before seeding. These are normally
// created at runtime by ensureFacilitySchema(); the seed needs them present
// so foreign-key checks on hospital_org_links etc. don't fail during seeding.
db.exec(`CREATE TABLE IF NOT EXISTS emergency_facilities (id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, source_url TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS facility_locations (facility_id TEXT PRIMARY KEY REFERENCES emergency_facilities(id) ON DELETE CASCADE, lat REAL NOT NULL, lng REAL NOT NULL, address TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS hospital_details (facility_id TEXT PRIMARY KEY REFERENCES emergency_facilities(id) ON DELETE CASCADE, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS facility_contacts (facility_id TEXT PRIMARY KEY REFERENCES emergency_facilities(id) ON DELETE CASCADE, phone TEXT, verified INTEGER NOT NULL DEFAULT 0, source_url TEXT, checked_at TEXT);
CREATE TABLE IF NOT EXISTS emergency_facility_cache (key TEXT PRIMARY KEY, payload TEXT NOT NULL, fetched_at INTEGER NOT NULL);`);

const { applyMigrations, seedCatalog } = await import("./catalog.mjs");
applyMigrations(db);
seedCatalog(db);

const { ensureSeeded } = await import("./seed.mjs");
ensureSeeded({ db });

db.close();
console.log(`Seeded baseline written to: ${OUT_PATH}`);

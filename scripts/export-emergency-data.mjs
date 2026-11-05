import fs from "node:fs";
import path from "node:path";
import sqlite from "node-sqlite3-wasm";

const { Database } = sqlite;

const toSupabase = process.argv.includes("--supabase");
const outputPath = process.argv.find((arg, i) => i > 1 && !arg.startsWith("--"));
if (!toSupabase && !outputPath) throw new Error("Usage: node scripts/export-emergency-data.mjs export.json OR --supabase");
const db = new Database(process.env.CIVIS_EMERGENCY_DB_PATH ?? path.join(process.cwd(), "data", "civis.db"));
const tables = ["official_data_sources", "emergency_countries", "emergency_services", "emergency_contacts", "emergency_sms_contacts", "emergency_contact_verifications", "emergency_incident_categories", "emergency_facilities", "facility_locations", "hospital_details", "facility_contacts"];
const data = {};
for (const name of tables) {
  if (!db.all("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [name]).length) continue;
  data[name] = db.all(`SELECT * FROM ${name}`).map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "string" && (key.endsWith("_json") || key === "payload") ? JSON.parse(value) : value])));
}
db.close();
if (!data.emergency_countries?.length) throw new Error("Open /emergency in the CIVIS app to initialize the reviewed directory first.");
if (toSupabase) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.startsWith("https://") || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the trusted server after applying the migration. Never expose the service key to the browser.");
  for (const name of tables) {
    const rows = data[name];
    if (!rows?.length) continue;
    const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${name}`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(rows), signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Supabase import failed for ${name} (HTTP ${response.status}). Check the migration and server credentials.`);
    console.log(`Synced ${name}: ${rows.length} records`);
  }
} else {
  fs.writeFileSync(path.resolve(outputPath), JSON.stringify({ exportedAt: new Date().toISOString(), tables: data }, null, 2) + "\n");
  console.log(`Exported ${Object.keys(data).length} emergency tables with source provenance.`);
}

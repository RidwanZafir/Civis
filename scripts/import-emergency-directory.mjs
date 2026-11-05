import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sqlite from "node-sqlite3-wasm";
import { z } from "zod";

const { Database } = sqlite;

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Usage: node scripts/import-emergency-directory.mjs path/to/reviewed-contacts.json");
const sourceSchema = z.strictObject({ name: z.string().min(3), url: z.url().refine((s) => s.startsWith("https://"), "Use the official HTTPS source page.") });
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s, "Use a valid review date.");
const contactSchema = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9_-]{3,120}$/), countryCode: z.string().regex(/^[A-Z]{2}$/), regionCode: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/).nullable(),
  serviceId: z.enum(["general", "police", "fire", "ambulance", "coast_guard", "search_rescue", "disaster", "hazmat"]),
  phoneNumber: z.string().regex(/^\+?[0-9]{2,15}$/), voiceSupported: z.boolean(), verificationStatus: z.enum(["verified", "unverified"]),
  coverage: z.string().min(10), source: sourceSchema, lastVerifiedAt: dateSchema,
  sms: z.strictObject({ supported: z.boolean(), number: z.string().regex(/^\+?[0-9]{2,15}$/).nullable(), eligibility: z.string().min(10), restrictions: z.string().min(10), source: sourceSchema.nullable(), verifiedAt: dateSchema.nullable() }),
}).superRefine((c, ctx) => {
  if (c.sms.supported && (!c.sms.number || !c.sms.source || !c.sms.verifiedAt)) ctx.addIssue({ code: "custom", path: ["sms"], message: "Supported SMS requires its own reviewed number, official source, and review date." });
  if (!c.sms.supported && c.sms.number) ctx.addIssue({ code: "custom", path: ["sms", "number"], message: "An unsupported SMS contact must not provide a messaging number." });
});
const inputSchema = z.strictObject({ reviewedBy: z.string().min(3), reviewNote: z.string().min(20), contacts: z.array(contactSchema).min(1).max(2000) });
const parsed = inputSchema.safeParse(JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8")));
if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"));
const data = parsed.data;
if (new Set(data.contacts.map((c) => c.id)).size !== data.contacts.length) throw new Error("Each imported contact id must be unique.");
const db = new Database(process.env.CIVIS_EMERGENCY_DB_PATH ?? path.join(process.cwd(), "data", "civis.db"));
db.exec("PRAGMA foreign_keys=ON");
db.exec(fs.readFileSync(path.join(process.cwd(), "lib", "emergency", "schema.sql"), "utf8"));
const countries = db.all("SELECT code,regions_json FROM emergency_countries");
if (countries.length !== 249) throw new Error("Start the CIVIS app and open /emergency once to initialize the country and service catalog before importing.");
for (const c of data.contacts) {
  const country = countries.find((row) => row.code === c.countryCode);
  if (!country || (c.regionCode && !JSON.parse(country.regions_json).some((r) => r.code === c.regionCode))) throw new Error(`Contact ${c.id}: country or region is not in the directory. Add an officially reviewed region to emergency_countries first.`);
}
function saveSource(source, checkedAt, kind) {
  db.run(`INSERT INTO official_data_sources(id,name,url,kind,checked_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,checked_at=excluded.checked_at`, [source.url, source.name, source.url, kind, checkedAt]);
  return source.url;
}
db.exec("BEGIN");
try {
  for (const c of data.contacts) {
    const voiceSource = saveSource(c.source, c.lastVerifiedAt, "official_emergency_voice");
    const smsSource = c.sms.source ? saveSource(c.sms.source, c.sms.verifiedAt ?? c.lastVerifiedAt, "official_emergency_sms") : null;
    db.run(`INSERT INTO emergency_contacts(id,country_code,region_code,service_id,phone_number,voice_supported,coverage,verification_status,source_id,last_verified_at) VALUES(?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET country_code=excluded.country_code,region_code=excluded.region_code,service_id=excluded.service_id,phone_number=excluded.phone_number,
      voice_supported=excluded.voice_supported,coverage=excluded.coverage,verification_status=excluded.verification_status,source_id=excluded.source_id,last_verified_at=excluded.last_verified_at`,
    [c.id,c.countryCode,c.regionCode,c.serviceId,c.phoneNumber,Number(c.voiceSupported),c.coverage,c.verificationStatus,voiceSource,c.lastVerifiedAt]);
    db.run(`INSERT INTO emergency_sms_contacts(contact_id,supported,sms_number,eligibility_requirements,regional_restrictions,verification_status,source_id,verified_at) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(contact_id) DO UPDATE SET supported=excluded.supported,sms_number=excluded.sms_number,eligibility_requirements=excluded.eligibility_requirements,
      regional_restrictions=excluded.regional_restrictions,verification_status=excluded.verification_status,source_id=excluded.source_id,verified_at=excluded.verified_at`,
    [c.id,Number(c.sms.supported),c.sms.number,c.sms.eligibility,c.sms.restrictions,c.sms.supported ? "verified" : "unverified",smsSource,c.sms.verifiedAt]);
    db.run("INSERT INTO emergency_contact_verifications(id,contact_id,channel,status,source_id,reviewed_at,note) VALUES(?,?,?,?,?,?,?)", [randomUUID(),c.id,"voice",c.verificationStatus,voiceSource,c.lastVerifiedAt,`Operator review by ${data.reviewedBy}: ${data.reviewNote}`]);
    if (smsSource && c.sms.verifiedAt) db.run("INSERT INTO emergency_contact_verifications(id,contact_id,channel,status,source_id,reviewed_at,note) VALUES(?,?,?,?,?,?,?)", [randomUUID(),c.id,"sms",c.sms.supported ? "verified" : "unverified",smsSource,c.sms.verifiedAt,`Operator review by ${data.reviewedBy}: ${data.reviewNote}`]);
  }
  db.exec("COMMIT");
  console.log(`Imported ${data.contacts.length} reviewed emergency contacts. Sources and separate SMS restrictions were preserved.`);
} catch (err) { db.exec("ROLLBACK"); throw err; }
finally { db.close(); }

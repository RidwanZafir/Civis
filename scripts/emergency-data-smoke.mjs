import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import sqlite from "node-sqlite3-wasm";

const { Database } = sqlite;
const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "civis-emergency-data-"));
const testDbPath = path.join(testDirectory, "isolated.db");
const sourceDb = new Database(path.join(process.cwd(), "data", "civis.db"));
const testDb = new Database(testDbPath);
testDb.exec("PRAGMA foreign_keys=ON");
testDb.exec(fs.readFileSync("lib/emergency/schema.sql", "utf8"));
try {
  const countries = sourceDb.all("SELECT * FROM emergency_countries");
  const services = sourceDb.all("SELECT * FROM emergency_services");
  assert.equal(countries.length, 249, "Initialize /emergency before running this smoke test.");
  assert.equal(services.length, 8);
  for (const row of countries) testDb.run("INSERT INTO emergency_countries(code,name,flag,dial_code,regions_json) VALUES(?,?,?,?,?)", [row.code,row.name,row.flag,row.dial_code,row.regions_json]);
  for (const row of services) testDb.run("INSERT INTO emergency_services(id,name,description) VALUES(?,?,?)", [row.id,row.name,row.description]);
  const contact = {
    id: "GB-national-general", countryCode: "GB", regionCode: null, serviceId: "general", phoneNumber: "999", voiceSupported: true,
    verificationStatus: "verified", coverage: "United Kingdom nationwide", source: { name: "UK Government", url: "https://www.gov.uk/guidance/999-and-112-the-uks-national-emergency-numbers" }, lastVerifiedAt: "2026-11-04",
    sms: { supported: true, number: "999", eligibility: "Prior registration with emergencySMS for eligible hearing or speech needs.", restrictions: "United Kingdom only. Do not assume that a composer has sent or delivered the message.", source: { name: "East Midlands Ambulance Service NHS", url: "https://www.emas.nhs.uk/your-service/accessibility/emergencysms-service" }, verifiedAt: "2026-11-04" },
  };
  const baseInput = { reviewedBy: "isolated smoke test", reviewNote: "Validation fixture only; this does not represent a new operational contact review.", contacts: [contact] };
  const inputPath = path.join(testDirectory, "review.json");
  function invoke(input) {
    fs.writeFileSync(inputPath, JSON.stringify(input));
    return spawnSync(process.execPath, ["scripts/import-emergency-directory.mjs",inputPath], { env: { ...process.env, CIVIS_EMERGENCY_DB_PATH: testDbPath }, encoding: "utf8" });
  }
  let outcome = invoke(baseInput);
  assert.equal(outcome.status, 0, outcome.stderr);
  assert.equal(testDb.all("SELECT sms_number FROM emergency_sms_contacts")[0].sms_number, "999");
  assert.equal(testDb.all("SELECT * FROM emergency_contact_verifications").length, 2);
  outcome = invoke({ ...baseInput, contacts: [{ ...contact, sms: { ...contact.sms, number: null } }] });
  assert.notEqual(outcome.status, 0, "Incomplete SMS verification must be rejected.");
  assert.equal(testDb.all("SELECT * FROM emergency_contact_verifications").length, 2, "Invalid import must not mutate SQL.");
  outcome = invoke({ ...baseInput, contacts: [contact,contact] });
  assert.notEqual(outcome.status, 0, "Duplicate IDs must be rejected.");
  outcome = invoke({ ...baseInput, contacts: [{ ...contact, regionCode: "UNKNOWN" }] });
  assert.notEqual(outcome.status, 0, "Unknown regions must be rejected.");
  assert.throws(() => testDb.run("UPDATE emergency_sms_contacts SET source_id=NULL WHERE contact_id=?", [contact.id]), "SQL itself must enforce supported SMS provenance.");
  const outputPath = path.join(testDirectory, "export.json");
  outcome = spawnSync(process.execPath,["scripts/export-emergency-data.mjs",outputPath],{ env: { ...process.env,CIVIS_EMERGENCY_DB_PATH: testDbPath },encoding:"utf8" });
  assert.equal(outcome.status,0,outcome.stderr);
  const exported = JSON.parse(fs.readFileSync(outputPath,"utf8"));
  assert.equal(exported.tables.emergency_countries.length,249);
  assert.equal(exported.tables.emergency_sms_contacts[0].sms_number,"999");
  assert(Array.isArray(exported.tables.emergency_countries[0].regions_json),"PostgreSQL export must preserve native JSON fields.");
  console.log("Emergency data checks passed: ISO catalog, attributed import, SMS source constraints, invalid-import atomicity, region validation, and PostgreSQL JSON export.");
} finally {
  testDb.close();
  sourceDb.close();
  const absoluteTestDirectory = path.resolve(testDirectory);
  assert(absoluteTestDirectory.startsWith(path.resolve(os.tmpdir()) + path.sep),"Cleanup must stay inside the temporary test folder.");
  fs.rmSync(absoluteTestDirectory,{recursive:true,force:true});
}

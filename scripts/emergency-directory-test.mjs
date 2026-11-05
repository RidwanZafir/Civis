/** Exercise the actual SQL directory repository with an isolated SQLite database. */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { test, after } from "node:test";
import sqlite from "node-sqlite3-wasm";
import swc from "next/dist/build/swc/index.js";

const require = createRequire(import.meta.url);
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "civis-directory-test-"));
const db = new sqlite.Database(path.join(temporaryDirectory, "test.db"));
db.exec("PRAGMA foreign_keys=ON; CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL)");
const adapter = {
  all: (sql,params=[]) => db.all(sql,params),
  get: (sql,params=[]) => db.all(sql,params)[0],
  run: (sql,params=[]) => db.run(sql,params), getDb: () => db,
  transaction: (fn) => { db.exec("BEGIN");try { const result=fn();db.exec("COMMIT");return result; } catch(err) { db.exec("ROLLBACK");throw err; } },
};
await swc.loadBindings();
const files = ["lib/emergency/directory.ts","lib/emergency/countries.ts","lib/emergency/contacts.ts","lib/emergency/incidents.ts"];
const compiled = new Map(await Promise.all(files.map(async (file) => [path.resolve(file),(await swc.transform(fs.readFileSync(file,"utf8"),{ filename:file,jsc:{parser:{syntax:"typescript"},target:"es2022"},module:{type:"commonjs"} })).code])));
const modules = new Map();
function load(file) {
  const filename = path.resolve(file);
  if (modules.has(filename)) return modules.get(filename);
  const exports = {};modules.set(filename,exports);
  vm.runInNewContext(compiled.get(filename),{exports,process,console,Intl,Date,Map,require:(name)=>{
    if(name==="../db")return adapter;
    if(name.startsWith("./"))return load(path.resolve(path.dirname(filename),`${name}.ts`));
    return require(name);
  }},{filename});
  return exports;
}
const { getEmergencyDirectory } = load("lib/emergency/directory.ts");
after(()=>{ db.close();const target=path.resolve(temporaryDirectory);assert(target.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(target,{recursive:true,force:true}); });
test("SQL seed contains complete ISO catalog, service taxonomy, incidents, and reviewed source trails",()=>{
  const data=getEmergencyDirectory("BD");
  assert.equal(data.countries.length,249);assert.equal(new Set(data.countries.map((c)=>c.code)).size,249);
  assert.equal(data.services.length,8);assert.equal(data.incidents.length,27);
  assert.equal(db.all("SELECT COUNT(DISTINCT country_code) AS n FROM emergency_contacts")[0].n,36);
  assert(db.all("SELECT * FROM emergency_contact_verifications").length>100);
  assert(data.contacts.every((c)=>c.phoneNumber==="999"&&!c.sms.supported));
});
test("regional SMS replaces voice-only US contact only inside a verified locality",()=>{
  const national=getEmergencyDirectory("US");assert(national.contacts.every((c)=>!c.sms.supported));
  const city=getEmergencyDirectory("US","NYC");
  assert(city.contacts.every((c)=>c.phoneNumber==="911"&&c.sms.supported&&c.sms.number==="911"&&c.regionCode==="NYC"));
  assert(city.contacts.every((c)=>c.sms.restrictions.includes("five boroughs")));
});
test("registered SMS eligibility and different voice/SMS numbers survive SQL roundtrip",()=>{
  assert(getEmergencyDirectory("GB","SCT").contacts.every((c)=>c.sms.supported&&c.sms.eligibility.includes("registered")));
  assert(getEmergencyDirectory("NZ").contacts.every((c)=>c.sms.supported&&c.sms.eligibility.includes("registered")));
  const france=getEmergencyDirectory("FR");assert.equal(france.contacts.find((c)=>c.serviceId==="ambulance").phoneNumber,"15");
  assert(france.contacts.filter((c)=>c.serviceId!=="coast_guard").every((c)=>c.sms.number==="114"));
  assert.equal(getEmergencyDirectory("SG").contacts.find((c)=>c.serviceId==="police").sms.number,"70999");
  assert.equal(getEmergencyDirectory("SG").contacts.find((c)=>c.serviceId==="fire").sms.number,"70995");
});
test("country changes support separate voice numbers without unsupported SMS or invented fallback",()=>{
  const japan=getEmergencyDirectory("JP");assert.equal(japan.contacts.find((c)=>c.serviceId==="police").phoneNumber,"110");
  assert.equal(japan.contacts.find((c)=>c.serviceId==="ambulance").phoneNumber,"119");
  assert(getEmergencyDirectory("AU").contacts.every((c)=>c.phoneNumber==="000"&&!c.sms.supported));
  assert(getEmergencyDirectory("CA","AB").contacts.every((c)=>!c.sms.supported));
  assert.equal(getEmergencyDirectory("AF").contacts.length,0);
  assert.match(getEmergencyDirectory("AF").coverageNote,/No verified emergency contacts/);
  assert.throws(()=>getEmergencyDirectory("XX"));assert.throws(()=>getEmergencyDirectory("US","UNKNOWN"));
});
test("Road Accident includes appropriate services and supported SMS has independent official provenance",()=>{
  const data=getEmergencyDirectory("GB");const road=data.incidents.find((i)=>i.id==="road-accident");
  assert(road.serviceIds.includes("police")&&road.serviceIds.includes("ambulance")&&road.serviceIds.includes("fire"));
  assert(data.contacts.every((c)=>c.source.url.startsWith("https://")&&c.lastVerifiedAt==="2026-11-04"));
  assert(data.contacts.every((c)=>c.sms.source?.url.startsWith("https://")&&c.sms.verifiedAt==="2026-11-04"));
  const count=db.all("SELECT COUNT(*) AS n FROM emergency_contacts")[0].n;getEmergencyDirectory("BD");
  assert.equal(db.all("SELECT COUNT(*) AS n FROM emergency_contacts")[0].n,count,"Repeated directory reads must not duplicate contacts.");
});

/** Source integrity, geographic filtering, cache behavior and real-route contract. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import swc from "next/dist/build/swc/index.js";
import sqlite from "node-sqlite3-wasm";
const { Database } = sqlite;

await swc.loadBindings();
const compiled = (await swc.transform(fs.readFileSync(new URL("../lib/emergency/facilities.ts", import.meta.url), "utf8"), { jsc: { parser: { syntax: "typescript" }, target: "es2022" }, module: { type: "commonjs" } })).code;
function load(fetchImpl, cached = null, databaseOverride = null) {
  const stored = new Map(cached ? [["0.000,0.000:5", cached]] : []);
  const database = {
    all: () => [], exec: () => {}, transaction: (fn) => fn(),
    get: (_sql, [key]) => stored.get(key),
    run: (sql, params) => { if (sql.startsWith("INSERT INTO emergency_facility_cache")) stored.set(params[0], { payload: params[1], fetched_at: params[2] }); },
  };
  const context = {
    exports: {},
    require: (name) => {
      if (name === "@/lib/db") return databaseOverride ?? database;
      if (name === "@/lib/nominatim") return { nominatimFetch: (task) => task() };
      throw new Error(`Unexpected module: ${name}`);
    },
    process: { env: {} }, fetch: fetchImpl, AbortSignal, URL, URLSearchParams, console, Date, Map, setTimeout, clearTimeout,
  };
  vm.runInNewContext(compiled, context);
  return context.exports;
}
const fixture = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [0, 0.01] },
  properties: {
    osm_type: "N", osm_id: 10, osm_key: "amenity", osm_value: "hospital",
    name: "Published Hospital", phone: "+12345678", website: "https://hospital.example",
    opening_hours: "Mo-Fr 09:00-17:00", street: "1 Example Road", city: "Testville",
  },
};
const withPoint = (lng, lat, properties = {}, id = 11, type = "N") => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lng, lat] },
  properties: { ...fixture.properties, ...properties, osm_type: type, osm_id: id },
});

test("source data controls capabilities and phone verification", () => {
  const { parseFacilities } = load(() => { throw Error("No network expected"); });
  const result = parseFacilities([fixture], 0, 0, 5, "2026-11-04T00:00:00Z")[0];
  assert.equal(result.phoneVerified, false);
  assert.equal(result.phone, "+12345678");
  assert.equal(result.emergencyDepartment, null);
  assert.equal(result.trauma, false);
  assert.equal(result.ownership, null);
  assert.deepEqual(Array.from(result.specialties), []);
  assert.equal(result.openingHours, "Mo-Fr 09:00-17:00");
  assert.equal(result.address, "1 Example Road, Testville");
  assert.equal(result.sourceUrl, "https://www.openstreetmap.org/node/10");
  assert.match(result.source, /Photon/);
});

test("geographic filtering sorts, deduplicates and ignores unrelated records", () => {
  const { parseFacilities, geographicDistance } = load(() => null);
  const result = parseFacilities([
    fixture,
    withPoint(0, 0.0101, { name: "Published Hospital" }),
    withPoint(0, 0.03, { name: "Farther Hospital", osm_id: 12, emergency: "yes" }),
    withPoint(0, 0.1, { name: "Outside Radius", osm_id: 13 }),
    withPoint(0, 0.01, { name: "Corner Cafe", osm_id: 14, osm_key: "amenity", osm_value: "cafe" }),
  ], 0, 0, 5, "2026-11-04T00:00:00Z");
  assert.equal(result.length, 2);
  assert.equal(result[0].name, "Published Hospital");
  assert.equal(result[1].emergencyDepartment, true);
  assert.ok(Math.abs(geographicDistance(0, 0, 0.01, 0) - 1.11195) < 0.001);
});

test("official hospital contact cannot apply to an unrelated website or city", () => {
  const { parseFacilities } = load(() => null);
  const hospital = withPoint(90.43, 23.81, { name: "Evercare Hospital Dhaka", website: "https://www.evercarebd.com/en/dhaka" }, 20, "W");
  const correct = parseFacilities([hospital], 23.81, 90.43, 5, "2026-11-04T00:00:00Z")[0];
  assert.equal(correct.phoneVerified, true);
  assert.equal(correct.phone, "10678");
  assert.equal(correct.emergencyDepartment, true);
  assert.equal(parseFacilities([withPoint(90.43, 23.81, { name: "Evercare Hospital Dhaka", website: "https://evercarebd.com.unrelated.example" }, 21, "W")], 23.81, 90.43, 5, "2026-11-04T00:00:00Z")[0].phoneVerified, false);
  assert.equal(parseFacilities([withPoint(91.8, 22.3, { name: "Evercare Hospital Dhaka", website: "https://www.evercarebd.com/en/dhaka" }, 22, "W")], 22.3, 91.8, 5, "2026-11-04T00:00:00Z")[0].phoneVerified, false);
});

test("cached distances are recalculated for the requesting location", async () => {
  const { parseFacilities } = load(() => { throw Error("Cache should avoid fetching"); });
  const original = parseFacilities([fixture], 0, 0, 5, "2026-11-04T00:00:00Z")[0];
  const cache = { payload: JSON.stringify({ facilities: [original], geometry: { roads: [], buildings: [] }, source: "OpenStreetMap", fetchedAt: "2026-11-04T00:00:00Z", stale: false, cached: false, truncated: false }), fetched_at: Date.now() };
  const subject = load(() => { throw Error("Cache should avoid fetching"); }, cache);
  const result = await subject.findFacilities(0.0004, 0, 5);
  assert.equal(result.cached, true);
  assert.ok(result.facilities[0].distanceKm < original.distanceKm);
});

test("provider failure returns explicitly stale cache, and no cache does not invent facilities", async () => {
  const parsed = load(() => null).parseFacilities([fixture], 0, 0, 5, "2026-11-04T00:00:00Z");
  const cache = { payload: JSON.stringify({ facilities: parsed, geometry: { roads: [], buildings: [] }, source: "OpenStreetMap", fetchedAt: "2026-11-04T00:00:00Z", stale: false, cached: false, truncated: false }), fetched_at: Date.now() - 11 * 60_000 };
  const offline = async () => { throw new Error("Offline"); };
  const result = await load(offline, cache).findFacilities(0, 0, 5);
  assert.equal(result.stale, true);
  assert.match(result.warning, /previously retrieved/);
  await assert.rejects(load(offline).findFacilities(0, 0, 5), /no stored records/);
});

test("a partially failed provider still returns the successful categories honestly", async () => {
  let photonCalls = 0;
  const subject = load(async (url) => {
    if (String(url).includes("nominatim")) throw new Error("Nominatim down");
    photonCalls += 1;
    if (photonCalls === 1) return { ok: true, json: async () => ({ features: [fixture] }) };
    throw new Error("Provider timeout");
  });
  const result = await subject.findFacilities(0, 0, 5);
  assert.equal(photonCalls, 5);
  assert.equal(result.facilities.length, 1);
  assert.equal(result.stale, false);
  assert.match(result.warning, /Some facility categories/);
});

test("Nominatim answers hospital and clinic searches when the fast index is unavailable", async () => {
  const place = (id, type, lat, name) => ({
    osm_type: "node", osm_id: id, lat: String(lat), lon: "0", category: "amenity", type, name,
    address: { road: "A Road", city: "Testville" },
    extratags: { emergency: type === "hospital" ? "yes" : "", "operator:type": "government" },
  });
  const requested = [];
  const subject = load(async (url) => {
    const parsed = new URL(url);
    if (parsed.hostname.includes("photon")) throw new Error("Photon unavailable");
    requested.push(parsed.searchParams.get("amenity"));
    return {
      ok: true,
      json: async () => parsed.searchParams.get("amenity") === "hospital"
        ? [place(30, "hospital", 0.01, "Fallback Hospital")]
        : [place(31, "clinic", 0.02, "Fallback Clinic")],
    };
  });
  const result = await subject.findFacilities(0, 0, 5);
  assert.deepEqual(requested, ["hospital", "clinic"]);
  assert.equal(result.facilities.length, 2);
  assert.equal(result.facilities[0].name, "Fallback Hospital");
  assert.equal(result.facilities[0].emergencyDepartment, true);
  assert.equal(result.facilities[1].kind, "clinic");
  assert.match(result.source, /Nominatim/);
  assert.match(result.facilities[0].source, /Nominatim/);
  assert.match(result.warning, /fast map index/);
});

test("route uses provider road geometry and longitude/latitude URI order", async () => {
  let requested;
  const subject = load(async (url) => { requested = url; return { ok: true, json: async () => ({ code: "Ok", routes: [{ geometry: { coordinates: [[90.41, 23.81], [90.42, 23.815], [90.43, 23.82]] }, distance: 2500, duration: 600 }] }) }; });
  const route = await subject.findFacilityRoute(23.81, 90.41, 23.82, 90.43);
  assert.match(requested, /90\.41,23\.81;90\.43,23\.82/);
  assert.equal(route.points.length, 3);
  assert.equal(route.points[1].lat, 23.815);
  assert.equal(route.points[1].lng, 90.42);
  assert.equal(route.distanceKm, 2.5);
  assert.match(route.source, /OSRM/);
});

test("no provider driving route produces an error instead of a straight line", async () => {
  const subject = load(async () => ({ ok: true, json: async () => ({ code: "NoRoute", routes: [] }) }));
  await assert.rejects(subject.findFacilityRoute(0, 0, 1, 1), /No driving route/);
});

function databaseFor(db) {
  return {
    all: (sql, params = []) => db.all(sql, params), get: (sql, params = []) => db.all(sql, params)[0],
    exec: (sql) => db.exec(sql), run: (sql, params) => db.run(sql, params),
    transaction: (fn) => { db.exec("BEGIN"); try { const result = fn(); db.exec("COMMIT"); return result; } catch (error) { db.exec("ROLLBACK"); throw error; } },
  };
}

test("real SQL persists facilities, coordinates, contacts and cache without losing imported verification", async () => {
  const db = new Database(":memory:");
  try {
    const subject = load(async () => ({ ok: true, json: async () => ({ features: [fixture] }) }), null, databaseFor(db));
    const result = await subject.findFacilities(0, 0, 5);
    assert.equal(result.facilities.length, 1);
    assert.equal(db.all("SELECT COUNT(*) AS n FROM emergency_facilities")[0].n, 1);
    assert.equal(db.all("SELECT lat,lng FROM facility_locations")[0].lat, 0.01);
    assert.equal(db.all("SELECT verified FROM facility_contacts")[0].verified, 0);
    assert.equal(db.all("SELECT COUNT(*) AS n FROM emergency_facility_cache")[0].n, 1);
    db.run("UPDATE facility_contacts SET verified=1,phone=?,source_url=?,checked_at=? WHERE facility_id=?", ["+12340000000", "https://hospital.example/contact", "2026-11-04", "osm:node:10"]);
    db.run("UPDATE emergency_facility_cache SET fetched_at=?", [Date.now() - 11 * 60_000]);
    const refreshed = await subject.findFacilities(0, 0, 5);
    assert.equal(refreshed.facilities[0].phoneVerified, true);
    assert.equal(refreshed.facilities[0].phone, "+12340000000");
    assert.equal(refreshed.facilities[0].phoneSource, "https://hospital.example/contact");
    assert.equal(db.all("SELECT verified FROM facility_contacts")[0].verified, 1);
  } finally { db.close(); }
});

test("stored facilities answer a live provider outage without fabricating records", async () => {
  const db = new Database(":memory:");
  try {
    const online = load(async () => ({ ok: true, json: async () => ({ features: [fixture] }) }), null, databaseFor(db));
    await online.findFacilities(0, 0, 5);
    db.run("DELETE FROM emergency_facility_cache");
    const offline = load(async () => { throw new Error("Offline"); }, null, databaseFor(db));
    const result = await offline.findFacilities(0.0004, 0, 5);
    assert.equal(result.facilities.length, 1);
    assert.equal(result.stale, true);
    assert.equal(result.cached, true);
    assert.match(result.warning, /previously stored/);
    assert.ok(result.facilities[0].distanceKm < 1.2);
  } finally { db.close(); }
});

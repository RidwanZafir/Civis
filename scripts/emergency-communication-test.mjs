/** Native URI and actual server-rendered Emergency Center checks. No network or device calls. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import swc from "next/dist/build/swc/index.js";

const require = createRequire(import.meta.url);
const project = process.cwd();
const sources = ["lib/emergency/communication.ts", "lib/emergency/countries.ts", "lib/emergency/incidents.ts", "lib/emergency/contacts.ts", "lib/emergency/facilities-types.ts", "components/ui.tsx", "components/emergency/FacilityFinder.tsx", "components/emergency/EmergencyCenter.tsx", "app/api/emergency/location/route.ts"];
await swc.loadBindings();
const compiled = new Map(await Promise.all(sources.map(async (filename) => [path.resolve(filename), (await swc.transform(fs.readFileSync(filename, "utf8"), { filename, jsc: { parser: { syntax: "typescript", tsx: filename.endsWith("tsx") }, target: "es2022", transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } })).code])));
function loader(overrides = {}) {
  const cache = new Map();
  function load(filename) {
    const resolved = path.resolve(filename);
    if (cache.has(resolved)) return cache.get(resolved);
    const exports = {}; cache.set(resolved, exports);
    const context = { exports, require: (name) => {
      if (overrides[name]) return overrides[name];
      if (name.endsWith(".css")) return {};
      if (name.startsWith("@/") || name.startsWith("./")) {
        const base = name.startsWith("@/") ? path.join(project, name.slice(2)) : path.resolve(path.dirname(resolved), name);
        const target = [base, `${base}.ts`, `${base}.tsx`].find((entry) => compiled.has(entry));
        if (target) return load(target);
      }
      return require(name);
    }, process, console, URL, URLSearchParams, Response, Request, AbortSignal, fetch: overrides.fetch ?? (() => { throw new Error("No network expected"); }), setTimeout: overrides.setTimeout ?? setTimeout, Date, Map, Intl };
    vm.runInNewContext(compiled.get(resolved), context, { filename: resolved });
    return exports;
  }
  return load;
}
const load = loader();
const communication = load("lib/emergency/communication.ts");
const countries = load("lib/emergency/countries.ts").COUNTRIES;
const { EMERGENCY_SERVICES: services, INCIDENT_CATEGORIES: incidents } = load("lib/emergency/incidents.ts");
const contacts = load("lib/emergency/contacts.ts").REVIEWED_CONTACTS;
const { EmergencyCenter } = load("components/emergency/EmergencyCenter.tsx");
function directory(countryCode, regionCode = null) {
  const byService = new Map();
  for (const contact of contacts.filter((item) => item.countryCode === countryCode && (item.regionCode === null || item.regionCode === regionCode)).sort((a, b) => Number(Boolean(a.regionCode)) - Number(Boolean(b.regionCode)))) byService.set(contact.serviceId, contact);
  return { countries, services, incidents, country: countries.find((item) => item.code === countryCode), contacts: [...byService.values()], coverageNote: "Reviewed official sources." };
}
test("native phone links keep short codes local and reject invalid contacts", () => {
  assert.equal(communication.telephoneUri("999"), "tel:999");
  assert.equal(communication.telephoneUri("+880 9610-010616"), "tel:+8809610010616");
  assert.throws(() => communication.telephoneUri("javascript:alert(1)"));
  assert.throws(() => communication.telephoneUri("999?extra"));
});
test("SMS supports Android and Apple composer formatting and encoded editable body", () => {
  const body = "EMERGENCY ALERT\nDescription: A & B, help?";
  assert.equal(communication.smsUri("999", body, "Android"), `sms:999?body=${encodeURIComponent(body)}`);
  assert.equal(communication.smsUri("999", body, "iPhone"), `sms:999&body=${encodeURIComponent(body)}`);
  assert.equal(communication.smsUri("999", body, "Macintosh Mobile"), `sms:999&body=${encodeURIComponent(body)}`);
});
test("prepared alert includes incident, description, GPS, map, people and additional details", () => {
  const alert = communication.prepareEmergencyMessage({ incident: "Road Accident", description: "Vehicle collision", location: { lat: 23.8103, lng: 90.4125, address: "Dhaka" }, manualLocation: "Hospital road", people: "3", additional: "Fuel leakage" });
  for (const text of ["EMERGENCY ALERT", "Road Accident", "Vehicle collision", "Hospital road", "23.810300, 90.412500", "https://www.google.com/maps/search/?api=1&query=23.8103,90.4125", "People affected: 3", "Fuel leakage"]) assert.ok(alert.includes(text));
  assert.ok(!communication.prepareEmergencyMessage({ incident: "Fire", description: "", location: null, manualLocation: "", people: "", additional: "" }).includes("Coordinates:"));
});
test("real Emergency Center renders verified local calls and no SMS link for Bangladesh", () => {
  const html = renderToStaticMarkup(React.createElement(EmergencyCenter, { initial: directory("BD") }));
  assert.match(html, /href="tel:999"/);
  assert.ok(!html.includes('href="sms:'));
  assert.ok(html.includes("Emergency SMS is not officially supported for this service"));
  assert.ok(html.includes("Nearby Hospitals"));
  assert.ok(html.includes("Road Accident"));
});
test("verified SMS service first requires eligibility; no delivery claim or automatic sending", () => {
  const html = renderToStaticMarkup(React.createElement(EmergencyCenter, { initial: directory("GB") }));
  assert.ok(html.includes("SEND EMERGENCY TEXT"));
  assert.ok(html.includes("I meet the eligibility requirements listed above"));
  assert.ok(html.includes("Press Send in your messaging app"));
  assert.ok(!html.includes('href="sms:'));
  assert.match(html, /href="tel:999"/);
});
test("country voice contacts change and unreviewed country never gets an invented fallback", () => {
  const japan = renderToStaticMarkup(React.createElement(EmergencyCenter, { initial: directory("JP") }));
  assert.match(japan, /href="tel:110"/); assert.match(japan, /href="tel:119"/); assert.ok(!japan.includes('href="tel:999"'));
  const unavailable = renderToStaticMarkup(React.createElement(EmergencyCenter, { initial: directory("AF") }));
  assert.ok(!unavailable.includes('href="tel:')); assert.ok(unavailable.includes("No verified contacts"));
});
test("location endpoint searches globally and returns country, caches results, handles provider failure", async () => {
  let count = 0;
  const endpoint = loader({ "@/lib/http": { clientKey: () => "test", rateLimit: () => ({ allowed: true }), fail: (error, status = 400) => Response.json({ error }, { status }), tooMany: () => Response.json({}, { status: 429 }) }, setTimeout: (resolve) => { resolve(); return 0; }, fetch: async (url) => { count++; assert.ok(!url.searchParams.has("viewbox")); return Response.json([{ display_name: "Dhaka, Bangladesh", lat: "23.81", lon: "90.41", address: { country_code: "bd", state: "Dhaka Division" } }]); } })("app/api/emergency/location/route.ts");
  const request = new Request("http://civis.local/api/emergency/location?q=Dhaka");
  const first = await endpoint.GET(request); const result = await first.json();
  assert.equal(result.results[0].countryCode, "BD"); assert.equal(result.results[0].lat, 23.81);
  await endpoint.GET(request); assert.equal(count, 1);
  assert.equal((await endpoint.GET(new Request("http://civis.local/api/emergency/location?lat=&lng="))).status, 400);
  const failing = loader({ "@/lib/http": { clientKey: () => "test", rateLimit: () => ({ allowed: true }), fail: (error, status = 400) => Response.json({ error }, { status }) }, fetch: async () => { throw Error("Offline"); } })("app/api/emergency/location/route.ts");
  const error = await failing.GET(request); assert.equal(error.status, 502); assert.ok((await error.json()).error.includes("GPS coordinates"));
});

test("cached reverse addresses preserve current GPS coordinates and stay separate from manual searches", async () => {
  let count = 0;
  const raw = { display_name: "Dhaka, Bangladesh", lat: "23.8103", lon: "90.4125", address: { country_code: "bd", state: "Dhaka Division" } };
  const endpoint = loader({ "@/lib/http": { clientKey: () => "test", rateLimit: () => ({ allowed: true }), fail: (error, status = 400) => Response.json({ error }, { status }) }, setTimeout: (resolve) => { resolve(); return 0; }, fetch: async (url) => { count++; return Response.json(url.pathname === "/reverse" ? raw : [raw]); } })("app/api/emergency/location/route.ts");
  await endpoint.GET(new Request("http://civis.local/api/emergency/location?lat=23.810301&lng=90.412501"));
  const moved = await endpoint.GET(new Request("http://civis.local/api/emergency/location?lat=23.810302&lng=90.412502")).then((response) => response.json());
  assert.equal(count, 1);
  assert.equal(moved.location.lat, 23.810302); assert.equal(moved.location.lng, 90.412502);
  const search = await endpoint.GET(new Request("http://civis.local/api/emergency/location?q=23.8103%2C90.4125")).then((response) => response.json());
  assert.equal(count, 2); assert.equal(search.results.length, 1);
});

#!/usr/bin/env node
/**
 * Import the DGHS Health Facility Registry into CIVIS.
 *
 * Source: https://hris.mohfw.gov.bd/public/facility-registry/
 * Endpoint: the same server-side DataTables JSON the public page itself uses.
 *
 * What this writes:
 *   registry_facilities  one row per official facility (coordinates left NULL)
 *   registry_contacts    the facility's published number, marked 'registry'
 *   registry_imports     one row per run, so the UI can show the data's age
 *
 * What this will not do:
 *   - invent coordinates. The registry publishes none, so `lat`/`lng` stay NULL
 *     and `location_status` is 'unavailable' until someone verifies a location.
 *   - claim a number is call-verified. Registry numbers are labelled as such.
 *
 * Usage:
 *   node scripts/import-hospital-registry.mjs
 *   node scripts/import-hospital-registry.mjs --district Sunamganj
 *   node scripts/import-hospital-registry.mjs --dry --pages 1
 *   node scripts/import-hospital-registry.mjs --geocode   # opt-in, slow, approximate
 */

import pkg from "node-sqlite3-wasm";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { newId, nowIso } from "./_ids.mjs";

const { Database } = pkg;

const ENDPOINT = "https://hris.mohfw.gov.bd/public/facility-registry/facilities/datatable/json";
const SOURCE = "DGHS Health Facility Registry";
const SOURCE_BASE = "https://hris.mohfw.gov.bd/public/facility-registry/facilities";
// The endpoint ignores `division_id` as a filter and returns the whole country,
// so scope the request with the search term the public page itself uses. Sylhet
// Division rows all carry division_name = 'Sylhet', which is re-checked below.
const SCOPE = "Sylhet";

const COLUMNS = [
  "id", "name", "name_bn", "code", "email_1", "facility_agency_name", "facility_type_name",
  "is_private", "division_name", "district_name", "city_corporation_name", "upazila_name", "is_active",
];

function parseArgs(argv) {
  const args = { district: "", pages: 0, dry: false, geocode: false, prune: false, pageSize: 100 };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === "--district") args.district = argv[++i] ?? "";
    else if (key === "--pages") args.pages = Number(argv[++i] ?? 0);
    else if (key === "--dry") args.dry = true;
    else if (key === "--prune") args.prune = true;
    else if (key === "--geocode") args.geocode = true;
    else if (key === "--page-size") args.pageSize = Number(argv[++i] ?? 100);
  }
  return args;
}

/** The table renders id and name as anchors; keep the text and the profile URL. */
function anchorText(value) {
  if (typeof value !== "string") return "";
  return value.replace(/<[^>]*>/g, "").trim();
}

function anchorHref(value) {
  if (typeof value !== "string") return null;
  return value.match(/href=["']?([^"'\s>]+)/)?.[1] ?? null;
}

export function normalizeCategory(raw) {
  const value = String(raw ?? "").toLowerCase();
  if (value.includes("medical college")) return "medical_college";
  if (value.includes("district hospital") || value.includes("general hospital")) return "district_hospital";
  if (value.includes("upazila health")) return "upazila_health_complex";
  if (value.includes("union health") || value.includes("union sub")) return "union_health_centre";
  if (value.includes("community clinic")) return "community_clinic";
  if (value.includes("diagnostic") || value.includes("pathology")) return "diagnostic_centre";
  if (value.includes("clinic")) return "clinic";
  if (value.includes("special") || value.includes("chest") || value.includes("eye") ||
      value.includes("mental") || value.includes("cancer") || value.includes("cardiac") ||
      value.includes("ortho") || value.includes("children") || value.includes("maternity")) {
    return "specialized";
  }
  if (value.includes("hospital")) return "hospital";
  if (value.includes("office") || value.includes("directorate")) return "administrative";
  if (value.includes("dental")) return "dental";
  if (value.includes("ambulance")) return "ambulance";
  return "other";
}

function normalizePhone(raw) {
  if (!raw) return { phone: null, e164: null };
  const text = String(raw).trim();
  const digits = text.replace(/[^\d]/g, "");
  if (/^01\d{9}$/.test(digits)) return { phone: text, e164: `+88${digits}` };
  if (/^8801\d{9}$/.test(digits)) return { phone: text, e164: `+${digits}` };
  if (/^\+8801\d{9}$/.test(text)) return { phone: text, e164: text };
  return { phone: text, e164: null };
}

async function fetchPage({ start, length }) {
  const params = new URLSearchParams();
  params.set("draw", "1");
  params.set("start", String(start));
  params.set("length", String(length));
  params.set("search[value]", "");
  params.set("search[regex]", "false");
  params.set("order[0][column]", "0");
  params.set("order[0][dir]", "asc");
  COLUMNS.forEach((data, index) => {
    params.set(`columns[${index}][data]`, data);
    params.set(`columns[${index}][name]`, `facilities.${data}`);
    params.set(`columns[${index}][searchable]`, "true");
    params.set(`columns[${index}][orderable]`, "true");
    params.set(`columns[${index}][search][value]`, "");
    params.set(`columns[${index}][search][regex]`, "false");
  });
  params.set("search[value]", SCOPE);

  const response = await fetch(`${ENDPOINT}?${params}`, {
    headers: {
      Accept: "application/json",
      "X-Requested-With": "XMLHttpRequest",
      Referer: "https://hris.mohfw.gov.bd/public/facility-registry/",
      "User-Agent": "CIVIS/1.0 hospital registry import (one-off public dataset sync)",
    },
  });
  if (!response.ok) throw new Error(`Registry returned HTTP ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(`Registry error: ${payload.error}`);
  return payload;
}

/** Optional, off by default: approximate a coordinate from OpenStreetMap. */
async function geocode(row) {
  const query = [row.name, row.upazila, row.district, "Bangladesh"].filter(Boolean).join(", ");
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=bd&q=${encodeURIComponent(query)}`;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "CIVIS/1.0 hospital registry geocode", Accept: "application/json" },
    });
    if (!response.ok) return null;
    const results = await response.json();
    const hit = results?.[0];
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  console.log("\nDGHS hospital registry import");
  console.log("────────────────────────────");

  const dbPath = join(process.cwd(), "data", "civis.db");
  const db = new Database(dbPath);
  db.exec(readFileSync(join(process.cwd(), "lib", "hospitals", "registry.sql"), "utf8"));

  if (args.prune && !args.dry) {
    db.run("DELETE FROM registry_facilities WHERE division IS NULL OR division != ?", [SCOPE]);
    console.log(`  pruned rows outside ${SCOPE}`);
  }

  const now = nowIso();
  let seen = 0, written = 0, skipped = 0, contacts = 0;
  let start = 0;
  let total = Infinity;
  let page = 0;

  while (start < total) {
    if (args.pages && page >= args.pages) break;
    const payload = await fetchPage({ start, length: args.pageSize });
    total = Number(payload.recordsFiltered ?? 0);
    const rows = Array.isArray(payload.data) ? payload.data : [];
    if (!rows.length) break;

    console.log(`  page ${page + 1}: ${rows.length} rows (${Math.min(start + rows.length, total)}/${total})`);

    if (!args.dry) db.exec("BEGIN");
    try {
      for (const raw of rows) {
        seen += 1;
        const name = anchorText(raw.name);
        const profileUrl = anchorHref(raw.name);
        const sourceId = String(raw.id ?? "").match(/\/(\d+)\/profile/)?.[1] ?? anchorText(raw.id);
        if (!name || !sourceId) { skipped += 1; continue; }

        const division = anchorText(raw.division_name) || null;
        if (division !== SCOPE) { skipped += 1; continue; }
        const district = anchorText(raw.district_name) || null;
        const upazila = anchorText(raw.upazila_name) || null;
        if (args.district && district && district.toLowerCase() !== args.district.toLowerCase()) {
          skipped += 1;
          continue;
        }

        const id = `rf-dghs-${sourceId}`;
        const ownership = /private/i.test(String(raw.is_private ?? "")) ? "private" : "public";
        const category = normalizeCategory(raw.facility_type_name);
        const { phone, e164 } = normalizePhone(raw.mobile_1);

        let lat = null, lng = null, locationStatus = "unavailable";
        if (args.geocode) {
          const hit = await geocode({ name, upazila, district });
          if (hit) { lat = hit.lat; lng = hit.lng; locationStatus = "approximate"; }
          await new Promise((resolve) => setTimeout(resolve, 1100));
        }

        if (!args.dry) {
          db.run(
            `INSERT INTO registry_facilities
              (id, source, source_id, source_url, name, name_bn, facility_code, facility_type,
               facility_category, agency, ownership, division, district, city_corporation, upazila,
               address, lat, lng, location_status, phone, email, active, imported_at, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(source, source_id) DO UPDATE SET
               name=excluded.name, name_bn=excluded.name_bn, facility_code=excluded.facility_code,
               facility_type=excluded.facility_type, facility_category=excluded.facility_category,
               agency=excluded.agency, ownership=excluded.ownership, division=excluded.division,
               district=excluded.district, city_corporation=excluded.city_corporation,
               upazila=excluded.upazila, address=excluded.address, phone=excluded.phone,
               email=excluded.email, active=excluded.active, imported_at=excluded.imported_at,
               updated_at=excluded.updated_at`,
            [
              id, SOURCE, sourceId, profileUrl ?? `${SOURCE_BASE}/${sourceId}/profile`,
              name, anchorText(raw.name_bn) || null, String(raw.code ?? "") || null,
              anchorText(raw.facility_type_name) || null, category,
              anchorText(raw.facility_agency_name) || null, ownership,
              division, district,
              anchorText(raw.city_corporation_name) || null, upazila,
              null, lat, lng, locationStatus, phone, String(raw.email_1 ?? "") || null,
              anchorText(raw.is_active) || null, now, now, now,
            ],
          );
          written += 1;

          // The registry publishes one facility number. It becomes a 'general'
          // contact, never a department-specific one.
          if (phone) {
            db.run(
              `INSERT INTO registry_contacts
                 (id, facility_id, department_code, department_name, contact_group, phone, phone_e164,
                  operating_hours, contact_type, source, source_url, verification_status,
                  last_verified_at, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(facility_id, department_code) DO UPDATE SET
                 phone=excluded.phone, phone_e164=excluded.phone_e164, source=excluded.source,
                 source_url=excluded.source_url, updated_at=excluded.updated_at`,
              [
                `rc-${id}-general`, id, "general", "Main reception / general enquiry", "general",
                phone, e164, null, "voice", SOURCE,
                profileUrl ?? `${SOURCE_BASE}/${sourceId}/profile`, "registry", null, now, now,
              ],
            );
            contacts += 1;
          }
        }
      }
      if (!args.dry) db.exec("COMMIT");
    } catch (error) {
      if (!args.dry) db.exec("ROLLBACK");
      throw error;
    }

    start += rows.length;
    page += 1;
    if (start >= total) break;
    await new Promise((resolve) => setTimeout(resolve, 260));
  }

  if (!args.dry) {
    db.run(
      `INSERT INTO registry_imports
         (id, source, scope, records_seen, records_written, records_skipped, note, ran_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        newId("ri"), SOURCE, SCOPE, seen, written, skipped,
        args.geocode
          ? "Coordinates approximated via Nominatim; review before trusting."
          : "Registry listing imported; coordinates unavailable.",
        now,
      ],
    );
  }

  if (args.dry) {
    console.log(`\nDry run: ${seen} rows seen, ${skipped} skipped. Nothing written.`);
  } else {
    const counts = db.all(
      "SELECT division, district, COUNT(*) AS c FROM registry_facilities GROUP BY division, district ORDER BY district",
    );
    console.log(`\n✓ ${written} facilities written, ${contacts} contacts, ${skipped} skipped`);
    for (const row of counts) console.log(`   ${row.district ?? "(unknown)"}: ${row.c}`);
  }
  db.close();
}

main().catch((error) => {
  console.error("\n✗ Import failed:", error.message, "\n");
  process.exit(1);
});

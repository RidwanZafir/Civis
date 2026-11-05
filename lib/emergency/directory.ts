import fs from "node:fs";
import path from "node:path";
import { all, get, getDb, run, transaction } from "../db";
import { COUNTRIES } from "./countries";
import { DIRECTORY_REVIEW_DATE, REVIEWED_CONTACTS } from "./contacts";
import { EMERGENCY_SERVICES, INCIDENT_CATEGORIES } from "./incidents";
import type { EmergencyContact, EmergencyCountry, EmergencyDirectory, EmergencyService, IncidentCategory, OfficialSource, ServiceId } from "./types";

const SEED_VERSION = `directory-${DIRECTORY_REVIEW_DATE}-1`;
const globalDirectory = globalThis as unknown as { __civisEmergencyVersion?: string };

function saveSource(source: OfficialSource, checkedAt: string, kind: string): string {
  run(`INSERT INTO official_data_sources(id,name,url,kind,checked_at) VALUES(?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,checked_at=excluded.checked_at`, [source.url, source.name, source.url, kind, checkedAt]);
  return source.url;
}

/** Called by the reviewed seed and by the explicit operator import script. */
export function upsertEmergencyContact(contact: EmergencyContact) {
  const sourceId = saveSource(contact.source, contact.lastVerifiedAt, "official_emergency_voice");
  run(`INSERT INTO emergency_contacts(id,country_code,region_code,service_id,phone_number,voice_supported,coverage,verification_status,source_id,last_verified_at)
    VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET country_code=excluded.country_code,region_code=excluded.region_code,
    service_id=excluded.service_id,phone_number=excluded.phone_number,voice_supported=excluded.voice_supported,
    coverage=excluded.coverage,verification_status=excluded.verification_status,source_id=excluded.source_id,last_verified_at=excluded.last_verified_at`,
  [contact.id, contact.countryCode, contact.regionCode, contact.serviceId, contact.phoneNumber, Number(contact.voiceSupported), contact.coverage, contact.verificationStatus, sourceId, contact.lastVerifiedAt]);
  const smsSourceId = contact.sms.source ? saveSource(contact.sms.source, contact.sms.verifiedAt ?? contact.lastVerifiedAt, "official_emergency_sms") : null;
  run(`INSERT INTO emergency_sms_contacts(contact_id,supported,sms_number,eligibility_requirements,regional_restrictions,verification_status,source_id,verified_at)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(contact_id) DO UPDATE SET supported=excluded.supported,sms_number=excluded.sms_number,
    eligibility_requirements=excluded.eligibility_requirements,regional_restrictions=excluded.regional_restrictions,
    verification_status=excluded.verification_status,source_id=excluded.source_id,verified_at=excluded.verified_at`,
  [contact.id, Number(contact.sms.supported), contact.sms.number, contact.sms.eligibility, contact.sms.restrictions,
    contact.sms.supported ? "verified" : "unverified", smsSourceId, contact.sms.verifiedAt]);
  run(`INSERT OR IGNORE INTO emergency_contact_verifications(id,contact_id,channel,status,source_id,reviewed_at,note) VALUES(?,?,?,?,?,?,?)`,
    [`${contact.id}:voice:${contact.lastVerifiedAt}`, contact.id, "voice", contact.verificationStatus, sourceId, contact.lastVerifiedAt, "Official published contact reviewed; no emergency test call was made."]);
  if (smsSourceId && contact.sms.verifiedAt) run(`INSERT OR IGNORE INTO emergency_contact_verifications(id,contact_id,channel,status,source_id,reviewed_at,note) VALUES(?,?,?,?,?,?,?)`,
    [`${contact.id}:sms:${contact.sms.verifiedAt}`, contact.id, "sms", contact.sms.supported ? "verified" : "unverified", smsSourceId, contact.sms.verifiedAt, `${contact.sms.eligibility} ${contact.sms.restrictions}`]);
}

export function ensureEmergencyDirectory() {
  if (globalDirectory.__civisEmergencyVersion === SEED_VERSION) return;
  // Supports a warmed dev-process database opened before this upgrade.
  getDb().exec(fs.readFileSync(path.join(process.cwd(), "lib", "emergency", "schema.sql"), "utf8"));
  if (get<{ value: string }>("SELECT value FROM meta WHERE key='emergency_directory_version'")?.value !== SEED_VERSION) {
    transaction(() => {
      for (const c of COUNTRIES) run("INSERT OR IGNORE INTO emergency_countries(code,name,flag,dial_code,regions_json) VALUES(?,?,?,?,?)", [c.code, c.name, c.flag, c.dialCode, JSON.stringify(c.regions)]);
      for (const s of EMERGENCY_SERVICES) run("INSERT OR IGNORE INTO emergency_services(id,name,description) VALUES(?,?,?)", [s.id, s.name, s.description]);
      for (const i of INCIDENT_CATEGORIES) run("INSERT OR IGNORE INTO emergency_incident_categories(id,label,category_group,service_ids_json,guidance_json) VALUES(?,?,?,?,?)", [i.id, i.label, i.group, JSON.stringify(i.serviceIds), JSON.stringify(i.guidance)]);
      for (const c of REVIEWED_CONTACTS) upsertEmergencyContact(c);
      run("INSERT INTO meta(key,value) VALUES('emergency_directory_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [SEED_VERSION]);
    });
  }
  globalDirectory.__civisEmergencyVersion = SEED_VERSION;
}

type ContactRow = {
  id: string; country_code: string; region_code: string | null; service_id: ServiceId;
  phone_number: string; voice_supported: number; verification_status: "verified" | "unverified";
  coverage: string; last_verified_at: string; source_name: string; source_url: string;
  sms_supported: number; sms_number: string | null; eligibility_requirements: string | null;
  regional_restrictions: string | null; sms_status: string | null; sms_verified_at: string | null;
  sms_source_name: string | null; sms_source_url: string | null;
};

export function getEmergencyDirectory(countryCode = "BD", regionCode?: string): EmergencyDirectory {
  ensureEmergencyDirectory();
  const countries = all<{ code: string; name: string; flag: string; dial_code: string; regions_json: string }>("SELECT * FROM emergency_countries ORDER BY name").map((c): EmergencyCountry => ({ code: c.code, name: c.name, flag: c.flag, dialCode: c.dial_code, regions: JSON.parse(c.regions_json) }));
  const country = countries.find((c) => c.code === countryCode.toUpperCase());
  if (!country) throw new Error("Choose a country from the directory.");
  if (regionCode && !country.regions.some((r) => r.code === regionCode)) throw new Error("Choose a listed region for this country.");
  const services = all<EmergencyService>("SELECT id,name,description FROM emergency_services");
  const incidents = all<{ id: string; label: string; category_group: IncidentCategory["group"]; service_ids_json: string; guidance_json: string }>("SELECT * FROM emergency_incident_categories ORDER BY rowid")
    .map((i): IncidentCategory => ({ id: i.id, label: i.label, group: i.category_group, serviceIds: JSON.parse(i.service_ids_json), guidance: JSON.parse(i.guidance_json) }));
  const rows = all<ContactRow>(`SELECT c.*,v.name AS source_name,v.url AS source_url,
    s.supported AS sms_supported,s.sms_number,s.eligibility_requirements,s.regional_restrictions,
    s.verification_status AS sms_status,s.verified_at AS sms_verified_at,sv.name AS sms_source_name,sv.url AS sms_source_url
    FROM emergency_contacts c JOIN official_data_sources v ON v.id=c.source_id
    LEFT JOIN emergency_sms_contacts s ON s.contact_id=c.id
    LEFT JOIN official_data_sources sv ON sv.id=s.source_id
    WHERE c.country_code=? AND (c.region_code IS NULL OR c.region_code=?)`, [country.code, regionCode ?? ""]);
  // A region-specific record replaces its country's shared contact for that service.
  const selected = new Map<ServiceId, ContactRow>();
  for (const row of rows.sort((a, b) => Number(Boolean(a.region_code)) - Number(Boolean(b.region_code)))) selected.set(row.service_id, row);
  const contacts = [...selected.values()].map((r): EmergencyContact => ({
    id: r.id, countryCode: r.country_code, regionCode: r.region_code, serviceId: r.service_id,
    phoneNumber: r.phone_number, voiceSupported: Boolean(r.voice_supported), verificationStatus: r.verification_status,
    coverage: r.coverage, source: { name: r.source_name, url: r.source_url }, lastVerifiedAt: r.last_verified_at,
    sms: {
      supported: Boolean(r.sms_supported) && r.sms_status === "verified" && Boolean(r.sms_number && r.sms_source_url && r.sms_verified_at),
      number: r.sms_number, eligibility: r.eligibility_requirements ?? "Direct emergency SMS has not been verified.",
      restrictions: r.regional_restrictions ?? "Use the direct call option.",
      source: r.sms_source_url ? { name: r.sms_source_name ?? "Official SMS source", url: r.sms_source_url } : null,
      verifiedAt: r.sms_verified_at,
    },
  })).sort((a, b) => EMERGENCY_SERVICES.findIndex((s) => s.id === a.serviceId) - EMERGENCY_SERVICES.findIndex((s) => s.id === b.serviceId));
  return {
    countries, services, incidents, country, contacts,
    coverageNote: contacts.length ? "Only contacts reviewed against the linked official sources are actionable. Specialty services without a verified contact are not listed. Short codes connect locally in the selected country; they do not make international calls."
      : "No verified emergency contacts have been entered for this country yet. CIVIS does not substitute an unverified emergency number. Ask a local official or check your government's emergency information.",
  };
}

import { all, get, run } from "@/lib/db";
import { haversineKm } from "@/lib/format";

/**
 * Read layer for the official hospital directory.
 *
 * Two distinct search modes, because they answer different questions:
 *   - "nearby" needs a coordinate and is distance-sorted.
 *   - "region" is the directory: every imported record for a division, whether
 *     or not it has a coordinate yet.
 *
 * Nothing here reports availability. Bed and service state live in
 * `lib/hospitals/repo.ts` and only exist when an organisation published them.
 */

export type RegistryFacility = {
  id: string;
  name: string;
  nameBn: string | null;
  category: string;
  facilityType: string | null;
  ownership: string | null;
  agency: string | null;
  division: string | null;
  district: string | null;
  upazila: string | null;
  cityCorporation: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  locationStatus: "verified" | "approximate" | "unavailable";
  phone: string | null;
  email: string | null;
  active: string | null;
  source: string;
  sourceId: string;
  sourceUrl: string;
  importedAt: string;
  distanceKm: number | null;
};

export type RegistryContact = {
  id: string;
  facilityId: string;
  departmentCode: string;
  departmentName: string;
  contactGroup: "general" | "emergency" | "department" | "diagnostic" | "support";
  phone: string;
  phoneE164: string | null;
  operatingHours: string | null;
  contactType: "voice" | "ambulance" | "emergency" | "fax";
  source: string;
  sourceUrl: string | null;
  verificationStatus: "verified" | "registry" | "unverified";
  lastVerifiedAt: string | null;
};

export type RegistrySummary = {
  total: number;
  withCoordinates: number;
  withoutCoordinates: number;
  lastImportAt: string | null;
  lastImportSource: string | null;
  divisions: { division: string; count: number }[];
  districts: { district: string; count: number }[];
};

export const FACILITY_CATEGORIES: { value: string; label: string }[] = [
  { value: "medical_college", label: "Medical college hospital" },
  { value: "district_hospital", label: "District / general hospital" },
  { value: "upazila_health_complex", label: "Upazila health complex" },
  { value: "union_health_centre", label: "Union health centre" },
  { value: "community_clinic", label: "Community clinic" },
  { value: "hospital", label: "Hospital" },
  { value: "specialized", label: "Specialized facility" },
  { value: "clinic", label: "Clinic" },
  { value: "diagnostic_centre", label: "Diagnostic centre" },
  { value: "dental", label: "Dental facility" },
  { value: "administrative", label: "Administrative office" },
  { value: "ambulance", label: "Ambulance service" },
  { value: "other", label: "Other registered facility" },
];

/** Categories that are healthcare facilities rather than offices. */
export const CARE_CATEGORIES = new Set([
  "medical_college", "district_hospital", "upazila_health_complex", "union_health_centre",
  "community_clinic", "hospital", "specialized", "clinic", "diagnostic_centre", "dental",
]);

export function categoryLabel(value: string): string {
  return FACILITY_CATEGORIES.find((entry) => entry.value === value)?.label ?? value;
}

/** Department list offered when an authorised user adds a contact. */
export const DEPARTMENT_OPTIONS: { code: string; name: string; group: RegistryContact["contactGroup"] }[] = [
  { code: "general", name: "Main reception / general enquiry", group: "general" },
  { code: "administration", name: "Hospital administration", group: "general" },
  { code: "admission", name: "Admission office", group: "general" },
  { code: "emergency-department", name: "Emergency department", group: "emergency" },
  { code: "ambulance", name: "Ambulance service", group: "emergency" },
  { code: "trauma", name: "Trauma department", group: "emergency" },
  { code: "icu", name: "ICU desk", group: "emergency" },
  { code: "ccu", name: "CCU desk", group: "emergency" },
  { code: "emergency-surgery", name: "Emergency surgery", group: "emergency" },
  { code: "cardiology", name: "Cardiology", group: "department" },
  { code: "neurology", name: "Neurology", group: "department" },
  { code: "orthopaedics", name: "Orthopaedics", group: "department" },
  { code: "paediatrics", name: "Paediatrics", group: "department" },
  { code: "gynaecology", name: "Gynaecology", group: "department" },
  { code: "oncology", name: "Oncology", group: "department" },
  { code: "nephrology", name: "Nephrology", group: "department" },
  { code: "psychiatry", name: "Psychiatry", group: "department" },
  { code: "ophthalmology", name: "Ophthalmology", group: "department" },
  { code: "ent", name: "ENT", group: "department" },
  { code: "urology", name: "Urology", group: "department" },
  { code: "blood-bank", name: "Blood bank", group: "diagnostic" },
  { code: "laboratory", name: "Laboratory", group: "diagnostic" },
  { code: "ct", name: "CT scan", group: "diagnostic" },
  { code: "mri", name: "MRI", group: "diagnostic" },
  { code: "xray", name: "X-ray", group: "diagnostic" },
  { code: "ultrasound", name: "Ultrasound", group: "diagnostic" },
  { code: "dialysis", name: "Dialysis", group: "support" },
  { code: "pharmacy", name: "Pharmacy", group: "support" },
  { code: "operation-theatre", name: "Operation theatre", group: "support" },
];

/** Bangla-friendly E.164 handling. Returns null when the number is unusable. */
export function normalizePhone(raw: string): { phone: string; e164: string | null } {
  const text = String(raw ?? "").trim();
  const digits = text.replace(/\D/g, "");
  if (/^01\d{9}$/.test(digits)) return { phone: text, e164: `+88${digits}` };
  if (/^8801\d{9}$/.test(digits)) return { phone: text, e164: `+${digits}` };
  if (/^\+8801\d{9}$/.test(text)) return { phone: text, e164: text };
  if (/^0\d{8,9}$/.test(digits)) return { phone: text, e164: `+880${digits.slice(1)}` };
  return { phone: text, e164: null };
}

/** Only a number that produced a resolvable dial target may become a link. */
export function telHref(contact: { phone: string; phoneE164: string | null }): string | null {
  if (contact.phoneE164) return `tel:${contact.phoneE164}`;
  const { e164 } = normalizePhone(contact.phone);
  return e164 ? `tel:${e164}` : null;
}

type Row = Record<string, unknown>;

function mapFacility(row: Row, from?: { lat: number; lng: number }): RegistryFacility {
  const lat = typeof row.lat === "number" ? row.lat : null;
  const lng = typeof row.lng === "number" ? row.lng : null;
  return {
    id: String(row.id),
    name: String(row.name),
    nameBn: (row.name_bn as string | null) ?? null,
    category: String(row.facility_category ?? "other"),
    facilityType: (row.facility_type as string | null) ?? null,
    ownership: (row.ownership as string | null) ?? null,
    agency: (row.agency as string | null) ?? null,
    division: (row.division as string | null) ?? null,
    district: (row.district as string | null) ?? null,
    upazila: (row.upazila as string | null) ?? null,
    cityCorporation: (row.city_corporation as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    lat,
    lng,
    locationStatus: (row.location_status as RegistryFacility["locationStatus"]) ?? "unavailable",
    phone: (row.phone as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    active: (row.active as string | null) ?? null,
    source: String(row.source),
    sourceId: String(row.source_id),
    sourceUrl: String(row.source_url),
    importedAt: String(row.imported_at),
    distanceKm:
      from && lat !== null && lng !== null ? Math.round(haversineKm(from, { lat, lng }) * 10) / 10 : null,
  };
}

export type RegistrySearch = {
  mode: "nearby" | "region";
  q?: string;
  /** Empty/undefined means the whole country. */
  division?: string;
  district?: string;
  upazila?: string;
  category?: string;
  ownership?: string;
  /** default: healthcare facilities only, excluding administrative offices */
  includeOffices?: boolean;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  page?: number;
  pageSize?: number;
};

export type RegistrySearchResult = {
  items: RegistryFacility[];
  total: number;
  page: number;
  pageSize: number;
  asOf: string | null;
  mode: RegistrySearch["mode"];
};

export function registrySearch(params: RegistrySearch): RegistrySearchResult {
  const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 24));
  const page = Math.max(1, params.page ?? 1);
  const clauses: string[] = [];
  const values: unknown[] = [];
  if (params.division) {
    clauses.push("division = ?");
    values.push(params.division);
  }

  if (params.q) {
    const like = `%${params.q}%`;
    clauses.push("(name LIKE ? OR name_bn LIKE ? OR upazila LIKE ? OR district LIKE ? OR facility_type LIKE ?)");
    values.push(like, like, like, like, like);
  }
  if (params.district) {
    clauses.push("district = ?");
    values.push(params.district);
  }
  if (params.upazila) {
    clauses.push("upazila = ?");
    values.push(params.upazila);
  }
  if (params.category) {
    clauses.push("facility_category = ?");
    values.push(params.category);
  }
  if (params.ownership) {
    clauses.push("ownership = ?");
    values.push(params.ownership);
  }
  if (!params.includeOffices) {
    clauses.push(
      `facility_category IN (${[...CARE_CATEGORIES].map(() => "?").join(",")})`,
    );
    values.push(...CARE_CATEGORIES);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const from =
    typeof params.lat === "number" && typeof params.lng === "number"
      ? { lat: params.lat, lng: params.lng }
      : undefined;

  if (params.mode === "nearby") {
    if (!from) {
      return { items: [], total: 0, page, pageSize, asOf: null, mode: "nearby" };
    }
    // Only facilities with a real coordinate can appear on a distance search.
    clauses.push("lat IS NOT NULL AND lng IS NOT NULL");
    const radius = params.radiusKm ?? 10;
    const dLat = radius / 111;
    const dLng = radius / (111 * Math.max(0.2, Math.cos((from.lat * Math.PI) / 180)));
    clauses.push("lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?");
    values.push(from.lat - dLat, from.lat + dLat, from.lng - dLng, from.lng + dLng);

    const rows = all<Row>(`SELECT * FROM registry_facilities ${where}`, values);
    const items = rows
      .map((row) => mapFacility(row, from))
      .filter((item) => (item.distanceKm ?? Infinity) <= radius)
      .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
    const start = (page - 1) * pageSize;
    return {
      items: items.slice(start, start + pageSize),
      total: items.length,
      page,
      pageSize,
      asOf: lastImportAt(),
      mode: "nearby",
    };
  }

  const countRow = get<{ c: number }>(`SELECT COUNT(*) AS c FROM registry_facilities ${where}`, values);
  const rows = all<Row>(
    `SELECT * FROM registry_facilities ${where}
     ORDER BY district, upazila, name
     LIMIT ? OFFSET ?`,
    [...values, pageSize, (page - 1) * pageSize],
  );
  return {
    items: rows.map((row) => mapFacility(row, from)),
    total: countRow?.c ?? 0,
    page,
    pageSize,
    asOf: lastImportAt(),
    mode: "region",
  };
}

export function registryFacility(id: string, from?: { lat: number; lng: number }) {
  const row = get<Row>("SELECT * FROM registry_facilities WHERE id = ?", [id]);
  if (!row) return null;
  const contacts = all<Row>(
    "SELECT * FROM registry_contacts WHERE facility_id = ? ORDER BY contact_group, department_name",
    [id],
  ).map(mapContact);
  return { facility: mapFacility(row, from), contacts };
}

function mapContact(row: Row): RegistryContact {
  return {
    id: String(row.id),
    facilityId: String(row.facility_id),
    departmentCode: String(row.department_code),
    departmentName: String(row.department_name),
    contactGroup: row.contact_group as RegistryContact["contactGroup"],
    phone: String(row.phone),
    phoneE164: (row.phone_e164 as string | null) ?? null,
    operatingHours: (row.operating_hours as string | null) ?? null,
    contactType: row.contact_type as RegistryContact["contactType"],
    source: String(row.source),
    sourceUrl: (row.source_url as string | null) ?? null,
    verificationStatus: row.verification_status as RegistryContact["verificationStatus"],
    lastVerifiedAt: (row.last_verified_at as string | null) ?? null,
  };
}

export function lastImportAt(): string | null {
  const row = get<{ ran_at: string; source: string }>(
    "SELECT ran_at, source FROM registry_imports ORDER BY ran_at DESC LIMIT 1",
  );
  return row?.ran_at ?? null;
}

export function registrySummary(): RegistrySummary {
  const total = get<{ c: number }>("SELECT COUNT(*) AS c FROM registry_facilities")?.c ?? 0;
  const withCoords =
    get<{ c: number }>(
      "SELECT COUNT(*) AS c FROM registry_facilities WHERE lat IS NOT NULL AND lng IS NOT NULL",
    )?.c ?? 0;
  const divisions = all<{ division: string; count: number }>(
    `SELECT division, COUNT(*) AS count FROM registry_facilities
     WHERE division IS NOT NULL AND division != ''
     GROUP BY division ORDER BY count DESC`,
  );
  const districts = all<{ district: string; count: number }>(
    `SELECT district, COUNT(*) AS count FROM registry_facilities
     WHERE district IS NOT NULL AND district != ''
     GROUP BY district ORDER BY district`,
  );
  const last = get<{ ran_at: string; source: string }>(
    "SELECT ran_at, source FROM registry_imports ORDER BY ran_at DESC LIMIT 1",
  );
  return {
    total,
    withCoordinates: withCoords,
    withoutCoordinates: total - withCoords,
    lastImportAt: last?.ran_at ?? null,
    lastImportSource: last?.source ?? null,
    divisions,
    districts,
  };
}

/** Districts for the dependent filter, optionally scoped to one division. */
export function districtsFor(division?: string): string[] {
  const rows = division
    ? all<{ district: string }>(
        `SELECT DISTINCT district FROM registry_facilities
         WHERE division = ? AND district IS NOT NULL AND district != ''
         ORDER BY district`,
        [division],
      )
    : all<{ district: string }>(
        `SELECT DISTINCT district FROM registry_facilities
         WHERE district IS NOT NULL AND district != ''
         ORDER BY district`,
      );
  return rows.map((row) => row.district);
}

/** Upazilas for a district, for the dependent filter. */
export function upazilasFor(district: string): string[] {
  return all<{ upazila: string }>(
    `SELECT DISTINCT upazila FROM registry_facilities
     WHERE district = ? AND upazila IS NOT NULL AND upazila != ''
     ORDER BY upazila`,
    [district],
  ).map((row) => row.upazila);
}

export type ContactInput = {
  id?: string;
  facilityId: string;
  departmentCode: string;
  phone: string;
  operatingHours?: string | null;
  contactType?: RegistryContact["contactType"];
  source: string;
  sourceUrl?: string | null;
  verificationStatus?: RegistryContact["verificationStatus"];
  updatedBy: string;
};

/** Uppercase/lowercase-insensitive department lookup. */
export function departmentMeta(code: string) {
  return DEPARTMENT_OPTIONS.find((entry) => entry.code === code) ?? null;
}

export function upsertContact(input: ContactInput): { ok: true } | { ok: false; message: string } {
  const meta = departmentMeta(input.departmentCode);
  if (!meta) return { ok: false, message: "Choose a department from the list." };
  const { phone, e164 } = normalizePhone(input.phone);
  if (!e164) return { ok: false, message: "That number does not look like a usable Bangladeshi phone number." };

  const now = new Date().toISOString();
  const id = input.id ?? `rc-${input.facilityId}-${input.departmentCode}`;
  run(
    `INSERT INTO registry_contacts
       (id, facility_id, department_code, department_name, contact_group, phone, phone_e164,
        operating_hours, contact_type, source, source_url, verification_status, last_verified_at,
        updated_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(facility_id, department_code) DO UPDATE SET
       phone = excluded.phone, phone_e164 = excluded.phone_e164,
       operating_hours = excluded.operating_hours, contact_type = excluded.contact_type,
       source = excluded.source, source_url = excluded.source_url,
       verification_status = excluded.verification_status,
       last_verified_at = excluded.last_verified_at, updated_by = excluded.updated_by,
       updated_at = excluded.updated_at`,
    [
      id, input.facilityId, meta.code, meta.name, meta.group, phone, e164,
      input.operatingHours ?? null, input.contactType ?? "voice",
      input.source, input.sourceUrl ?? null,
      input.verificationStatus ?? "unverified",
      input.verificationStatus === "verified" ? now : null,
      input.updatedBy, now, now,
    ],
  );
  return { ok: true };
}

export function deleteContact(facilityId: string, departmentCode: string) {
  run("DELETE FROM registry_contacts WHERE facility_id = ? AND department_code = ?", [facilityId, departmentCode]);
}

import { all, get, run, transaction } from "@/lib/db";
import { newId, nowIso } from "@/lib/crypto";
import { audit, notify } from "@/lib/auth";
import { ensureFacilitySchema, storeFacilities } from "@/lib/emergency/facilities";
import { nominatimFetch } from "@/lib/nominatim";
import { SERVICE_TYPES, WARD_TYPES } from "./constants";
import { serviceAvailability, summarizeAvailability, wardAvailability } from "./availability";
import type {
  AdmissionStatus,
  AvailabilitySummary,
  Freshness,
  HospitalAvailabilityDetail,
  HospitalAvailabilityHistoryRow,
  HospitalCandidate,
  HospitalLinkRow,
  MedicalService,
  PublicHospitalAvailability,
  PublishHospitalAvailabilityInput,
  ServiceStatus,
  VerificationStatus,
  Ward,
  WardState,
} from "./types";
import type { Facility } from "@/lib/emergency/facilities-types";

type HealthOrganisation = { id: string; name: string; type: string; verification_status: string };
type ProfileRow = {
  facility_id: string;
  department_id: string;
  version: number;
  source: string;
  note: string | null;
  updated_at: string;
  organisation_name: string;
};
type WardRow = {
  id: string;
  facility_id: string;
  department_id: string;
  code: string;
  name: string;
  ward_group: Ward["group"];
  total_beds: number | null;
  available_beds: number | null;
  occupied_beds: number | null;
  admission_status: AdmissionStatus;
  source: string | null;
  verification_status: VerificationStatus;
  version: number;
  updated_at: string;
};
type ServiceRow = {
  id: string;
  facility_id: string;
  department_id: string;
  code: string;
  name: string;
  service_group: MedicalService["group"];
  exists_flag: number;
  availability_status: ServiceStatus;
  operating_hours: string | null;
  emergency_available: number | null;
  contact: string | null;
  contact_verified: number;
  source: string | null;
  verification_status: VerificationStatus;
  version: number;
  updated_at: string;
};
type LinkRow = {
  id: string;
  facility_id: string;
  facility_name: string;
  facility_kind: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  department_id: string;
  department_name: string;
  department_type: string;
  link_status: HospitalLinkRow["linkStatus"];
  requested_by: string;
  requested_by_name: string | null;
  reviewed_by_name: string | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  availability_version: number | null;
  availability_updated_at: string | null;
  ward_count: number;
  service_count: number;
};
type NominatimPlace = {
  osm_type?: string;
  osm_id?: number;
  lat?: string;
  lon?: string;
  category?: string;
  type?: string;
  name?: string;
  display_name?: string;
  address?: Record<string, string>;
  extratags?: Record<string, string>;
};

const WARD_INDEX = new Map<string, { name: string; group: string }>(
  WARD_TYPES.map(([code, name, group]) => [code, { name, group }]),
);
const SERVICE_INDEX = new Map<string, { name: string; group: string }>(
  SERVICE_TYPES.map(([code, name, group]) => [code, { name, group }]),
);
const WARD_GROUPS = new Set(["general", "critical", "specialized"]);
const SERVICE_GROUPS = new Set(["emergency", "diagnostic", "specialist", "support"]);
const ADMISSION_STATUSES = new Set(["open", "limited", "full", "closed", "unknown"]);
const SERVICE_STATUSES = new Set(["available", "restricted", "unavailable", "closed", "unknown"]);
const OSM_PATH: Record<string, string> = { node: "node", way: "way", relation: "relation" };

export class HospitalAvailabilityError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "HospitalAvailabilityError";
    this.status = status;
  }
}

function placeholders(values: unknown[]) {
  return values.map(() => "?").join(",");
}

function uniqueIds(ids: string[]) {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

function toWard(row: WardRow, now: number): Ward {
  return wardAvailability({
    id: row.id,
    hospitalId: row.facility_id,
    code: row.code,
    name: row.name,
    group: row.ward_group,
    totalBeds: row.total_beds,
    availableBeds: row.available_beds,
    occupiedBeds: row.occupied_beds,
    admissionStatus: row.admission_status,
    lastUpdatedAt: row.updated_at,
    source: row.source,
    verificationStatus: row.verification_status,
    version: row.version,
  }, now);
}

function toService(row: ServiceRow, now: number): MedicalService {
  return serviceAvailability({
    id: row.id,
    hospitalId: row.facility_id,
    code: row.code,
    name: row.name,
    group: row.service_group,
    exists: row.exists_flag === 1,
    availabilityStatus: row.availability_status,
    operatingHours: row.operating_hours,
    emergencyAvailable: row.emergency_available === null ? null : row.emergency_available === 1,
    contact: row.contact,
    contactVerified: row.contact_verified === 1,
    lastUpdatedAt: row.updated_at,
    source: row.source,
    verificationStatus: row.verification_status,
    version: row.version,
  }, now);
}

function publicShape(detail: HospitalAvailabilityDetail): PublicHospitalAvailability {
  return {
    facilityId: detail.facilityId,
    organisation: detail.organisation,
    version: detail.version,
    source: detail.source,
    note: detail.note,
    updatedAt: detail.updatedAt,
    summary: detail.summary,
    stale: detail.stale,
    wards: detail.wards.map((ward) => ({
      code: ward.code,
      name: ward.name,
      group: ward.group,
      state: ward.state,
      freshness: ward.freshness,
      totalBeds: ward.totalBeds,
      confirmedAvailableBeds: ward.confirmedAvailableBeds,
      lastUpdatedAt: ward.lastUpdatedAt,
    })),
    services: detail.services.map((service) => ({
      code: service.code,
      name: service.name,
      group: service.group,
      status: service.effectiveStatus,
      freshness: service.freshness,
      operatingHours: service.operatingHours,
      emergencyAvailable: service.emergencyAvailable,
      lastUpdatedAt: service.lastUpdatedAt,
    })),
  };
}

export function healthOrganisation(departmentId: string | null): HealthOrganisation | undefined {
  if (!departmentId) return undefined;
  return get<HealthOrganisation>(
    "SELECT id, name, type, verification_status FROM departments WHERE id = ?",
    [departmentId],
  );
}

export function requireHealthOrganisation(departmentId: string | null): HealthOrganisation {
  const organisation = healthOrganisation(departmentId);
  if (!organisation || organisation.type !== "health") {
    throw new HospitalAvailabilityError(
      "Hospital availability is managed by verified health organisations. Your organisation is not registered as a health provider.",
      403,
    );
  }
  if (organisation.verification_status !== "approved") {
    throw new HospitalAvailabilityError(
      "Your health organisation must be verified before it can report hospital availability.",
      403,
    );
  }
  return organisation;
}

function loadAvailability(facilityIds: string[]): Record<string, HospitalAvailabilityDetail> {
  const ids = uniqueIds(facilityIds).slice(0, 120);
  if (!ids.length) return {};
  const marks = placeholders(ids);
  const profiles = all<ProfileRow>(
    `SELECT p.facility_id, p.department_id, p.version, p.source, p.note, p.updated_at,
            d.name AS organisation_name
     FROM hospital_availability_profiles p
     JOIN hospital_org_links l
       ON l.facility_id = p.facility_id AND l.department_id = p.department_id AND l.status = 'approved'
     JOIN departments d
       ON d.id = p.department_id AND d.verification_status = 'approved' AND d.type = 'health'
     WHERE p.facility_id IN (${marks})`,
    ids,
  );
  if (!profiles.length) return {};

  const wards = all<WardRow>(
    `SELECT id, facility_id, department_id, code, name, ward_group, total_beds, available_beds,
            occupied_beds, admission_status, source, verification_status, version, updated_at
     FROM hospital_wards WHERE facility_id IN (${marks})`,
    ids,
  );
  const services = all<ServiceRow>(
    `SELECT id, facility_id, department_id, code, name, service_group, exists_flag, availability_status,
            operating_hours, emergency_available, contact, contact_verified, source, verification_status,
            version, updated_at
     FROM hospital_services WHERE facility_id IN (${marks})`,
    ids,
  );

  const now = Date.now();
  const result: Record<string, HospitalAvailabilityDetail> = {};
  for (const profile of profiles) {
    const profileWards = wards
      .filter((row) => row.facility_id === profile.facility_id && row.department_id === profile.department_id)
      .map((row) => toWard(row, now));
    const profileServices = services
      .filter((row) => row.facility_id === profile.facility_id && row.department_id === profile.department_id)
      .map((row) => toService(row, now));
    const summary = summarizeAvailability(profileWards, profileServices, now);
    result[profile.facility_id] = {
      facilityId: profile.facility_id,
      organisation: { id: profile.department_id, name: profile.organisation_name },
      version: profile.version,
      source: profile.source,
      note: profile.note,
      updatedAt: profile.updated_at,
      wards: profileWards,
      services: profileServices,
      summary,
      stale: !["recent", "aging"].includes(summary.freshness),
    };
  }
  return result;
}

export function publicAvailabilityFor(facilityIds: string[]): Record<string, PublicHospitalAvailability> {
  const details = loadAvailability(facilityIds);
  return Object.fromEntries(
    Object.entries(details).map(([facilityId, detail]) => [facilityId, publicShape(detail)]),
  );
}

export function hasApprovedHospitalLink(facilityId: string, departmentId: string): boolean {
  return !!get<{ id: string }>(
    "SELECT id FROM hospital_org_links WHERE facility_id = ? AND department_id = ? AND status = 'approved'",
    [facilityId, departmentId],
  );
}

export function departmentAvailability(facilityId: string, departmentId: string): HospitalAvailabilityDetail | null {
  if (!hasApprovedHospitalLink(facilityId, departmentId)) return null;
  return loadAvailability([facilityId])[facilityId] ?? null;
}

function mapLink(row: LinkRow): HospitalLinkRow {
  return {
    id: row.id,
    facilityId: row.facility_id,
    facilityName: row.facility_name,
    facilityKind: row.facility_kind,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    departmentId: row.department_id,
    departmentName: row.department_name,
    departmentType: row.department_type,
    linkStatus: row.link_status,
    requestedBy: row.requested_by,
    requestedByName: row.requested_by_name,
    reviewedByName: row.reviewed_by_name,
    reviewNote: row.review_note,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
    availabilityVersion: row.availability_version,
    availabilityUpdatedAt: row.availability_updated_at,
    wardCount: row.ward_count,
    serviceCount: row.service_count,
  };
}

const LINK_SELECT = `
  SELECT l.id, l.facility_id, f.name AS facility_name, f.kind AS facility_kind,
         fl.address, fl.lat, fl.lng,
         l.department_id, d.name AS department_name, d.type AS department_type,
         l.status AS link_status, l.requested_by, req.name AS requested_by_name,
         rev.name AS reviewed_by_name, l.review_note, l.created_at, l.reviewed_at,
         p.version AS availability_version, p.updated_at AS availability_updated_at,
         (SELECT COUNT(*) FROM hospital_wards w
           WHERE w.facility_id = l.facility_id AND w.department_id = l.department_id) AS ward_count,
         (SELECT COUNT(*) FROM hospital_services s
           WHERE s.facility_id = l.facility_id AND s.department_id = l.department_id) AS service_count
  FROM hospital_org_links l
  JOIN emergency_facilities f ON f.id = l.facility_id
  JOIN departments d ON d.id = l.department_id
  LEFT JOIN facility_locations fl ON fl.facility_id = l.facility_id
  LEFT JOIN hospital_availability_profiles p
    ON p.facility_id = l.facility_id AND p.department_id = l.department_id
  LEFT JOIN users req ON req.id = l.requested_by
  LEFT JOIN users rev ON rev.id = l.reviewed_by
`;

export function departmentHospitalLinks(departmentId: string): HospitalLinkRow[] {
  ensureFacilitySchema();
  return all<LinkRow>(
    `${LINK_SELECT} WHERE l.department_id = ? ORDER BY CASE l.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, l.created_at DESC`,
    [departmentId],
  ).map(mapLink);
}

export function allHospitalLinks(status?: string): HospitalLinkRow[] {
  ensureFacilitySchema();
  const valid = status && ["pending", "approved", "rejected", "revoked"].includes(status) ? status : null;
  return all<LinkRow>(
    `${LINK_SELECT} ${valid ? "WHERE l.status = ?" : ""} ORDER BY CASE l.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, l.created_at DESC`,
    valid ? [valid] : [],
  ).map(mapLink);
}

export function pendingHospitalLinkCount(): number {
  return get<{ n: number }>("SELECT COUNT(*) AS n FROM hospital_org_links WHERE status = 'pending'")?.n ?? 0;
}

export function hospitalLinkStats() {
  const rows = all<{ status: string; n: number }>(
    "SELECT status, COUNT(*) AS n FROM hospital_org_links GROUP BY status",
  );
  const byStatus = Object.fromEntries(rows.map((row) => [row.status, row.n]));
  return {
    total: rows.reduce((sum, row) => sum + row.n, 0),
    pending: byStatus.pending ?? 0,
    approved: byStatus.approved ?? 0,
    rejected: (byStatus.rejected ?? 0) + (byStatus.revoked ?? 0),
  };
}

export function requestHospitalLink(userId: string, departmentId: string, facilityId: string) {
  ensureFacilitySchema();
  const organisation = requireHealthOrganisation(departmentId);
  const facility = get<{ name: string; kind: string }>(
    "SELECT name, kind FROM emergency_facilities WHERE id = ?",
    [facilityId],
  );
  if (!facility) {
    throw new HospitalAvailabilityError(
      "That hospital is not in the CIVIS facility directory yet. Search the public Nearby Hospitals finder for its area first, then try again.",
      404,
    );
  }
  if (!["hospital", "clinic"].includes(facility.kind)) {
    throw new HospitalAvailabilityError("Availability can only be linked to a hospital or clinic.", 422);
  }

  const existing = get<{ id: string; status: string }>(
    "SELECT id, status FROM hospital_org_links WHERE facility_id = ? AND department_id = ?",
    [facilityId, departmentId],
  );
  if (existing?.status === "approved") {
    throw new HospitalAvailabilityError("Your organisation is already linked to this hospital.", 409);
  }
  if (existing?.status === "pending") {
    return { id: existing.id, status: "pending" as const, already: true };
  }

  const stamp = nowIso();
  const id = existing?.id ?? newId("hlink");
  if (existing) {
    run(
      `UPDATE hospital_org_links
       SET status = 'pending', requested_by = ?, reviewed_by = NULL, review_note = NULL,
           created_at = ?, reviewed_at = NULL
       WHERE id = ?`,
      [userId, stamp, id],
    );
  } else {
    run(
      `INSERT INTO hospital_org_links
        (id, facility_id, department_id, status, requested_by, reviewed_by, review_note, created_at, reviewed_at)
       VALUES (?,?,?, 'pending', ?, NULL, NULL, ?, NULL)`,
      [id, facilityId, departmentId, userId, stamp],
    );
  }

  audit({ id: userId, role: "authority", name: null }, "hospital.link_requested", {
    type: "hospital",
    id: facilityId,
  }, `${organisation.name} requested to report availability for ${facility.name}.`);

  const admins = all<{ id: string }>(
    "SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL AND suspended = 0",
  );
  for (const admin of admins) {
    notify(admin.id, {
      type: "hospital_link_request",
      title: "Hospital availability link request",
      body: `${organisation.name} requested permission to report availability for ${facility.name}.`,
    });
  }
  return { id, status: "pending" as const, already: false };
}

export function reviewHospitalLink(
  linkId: string,
  action: "approve" | "reject" | "revoke",
  note: string | null,
  admin: { id: string; name: string | null },
) {
  const link = get<{
    id: string;
    facility_id: string;
    department_id: string;
    status: HospitalLinkRow["linkStatus"];
    requested_by: string;
    facility_name: string;
    organisation_name: string;
  }>(
    `SELECT l.id, l.facility_id, l.department_id, l.status, l.requested_by,
            f.name AS facility_name, d.name AS organisation_name
     FROM hospital_org_links l
     JOIN emergency_facilities f ON f.id = l.facility_id
     JOIN departments d ON d.id = l.department_id
     WHERE l.id = ?`,
    [linkId],
  );
  if (!link) throw new HospitalAvailabilityError("Hospital link request not found.", 404);
  const allowed = action === "approve"
    ? link.status === "pending"
    : action === "reject"
      ? link.status === "pending"
      : link.status === "approved";
  if (!allowed) {
    throw new HospitalAvailabilityError(
      `This link is ${link.status} and cannot be ${action === "approve" ? "approved" : `${action}d`} now.`,
      409,
    );
  }

  const nextStatus: HospitalLinkRow["linkStatus"] = action === "approve" ? "approved" : action === "reject" ? "rejected" : "revoked";
  const stamp = nowIso();
  transaction(() => {
    run(
      "UPDATE hospital_org_links SET status = ?, reviewed_by = ?, review_note = ?, reviewed_at = ? WHERE id = ?",
      [nextStatus, admin.id, note, stamp, linkId],
    );
    if (nextStatus === "revoked") {
      const profile = get<{ version: number; source: string; note: string | null; updated_at: string }>(
        "SELECT version, source, note, updated_at FROM hospital_availability_profiles WHERE facility_id = ? AND department_id = ?",
        [link.facility_id, link.department_id],
      );
      run("DELETE FROM hospital_wards WHERE facility_id = ? AND department_id = ?", [link.facility_id, link.department_id]);
      run("DELETE FROM hospital_services WHERE facility_id = ? AND department_id = ?", [link.facility_id, link.department_id]);
      run("DELETE FROM hospital_availability_profiles WHERE facility_id = ? AND department_id = ?", [link.facility_id, link.department_id]);
      run(
        `INSERT INTO hospital_availability_history
          (id, facility_id, department_id, resource_type, resource_id, previous_payload, current_payload,
           source, note, actor_id, actor_label, created_at)
         VALUES (?,?,?, 'profile', NULL, ?, NULL, ?, ?, ?, ?, ?)`,
        [
          newId("hhist"),
          link.facility_id,
          link.department_id,
          profile ? JSON.stringify(profile) : null,
          "Link revoked by platform administration",
          note,
          admin.id,
          admin.name,
          stamp,
        ],
      );
    }
    run(
      `INSERT INTO audit_logs (id, actor_id, actor_role, actor_label, action, target_type, target_id, detail, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        newId("audit"),
        admin.id,
        "admin",
        admin.name,
        `hospital.link_${action}`,
        "hospital",
        link.facility_id,
        `${link.organisation_name} — ${link.facility_name}${note ? ` — ${note}` : ""}`,
        stamp,
      ],
    );
  });

  const recipients = new Set<string>([link.requested_by]);
  for (const member of all<{ user_id: string }>(
    "SELECT user_id FROM department_members WHERE department_id = ? AND status = 'active'",
    [link.department_id],
  )) {
    recipients.add(member.user_id);
  }
  for (const userId of recipients) {
    notify(userId, {
      type: `hospital_link_${nextStatus}`,
      title:
        nextStatus === "approved"
          ? "Hospital availability link approved"
          : nextStatus === "rejected"
            ? "Hospital availability link rejected"
            : "Hospital availability link revoked",
      body: `${link.facility_name}: ${nextStatus}${note ? ` — ${note}` : ""}.`,
    });
  }

  return { id: linkId, status: nextStatus };
}

function integerOrNull(value: number | null, field: string) {
  if (value === null) return null;
  if (!Number.isInteger(value) || value < 0 || value > 100_000) {
    throw new HospitalAvailabilityError(`${field} must be a whole number between 0 and 100,000.`, 422);
  }
  return value;
}

function parseHistory(payload: string | null): unknown {
  if (!payload) return null;
  try { return JSON.parse(payload); } catch { return null; }
}

export function publishHospitalAvailability(
  userId: string,
  departmentId: string,
  facilityId: string,
  input: PublishHospitalAvailabilityInput,
): HospitalAvailabilityDetail {
  const organisation = requireHealthOrganisation(departmentId);
  const link = get<{ id: string }>(
    "SELECT id FROM hospital_org_links WHERE facility_id = ? AND department_id = ? AND status = 'approved'",
    [facilityId, departmentId],
  );
  if (!link) {
    throw new HospitalAvailabilityError(
      "Your organisation is not approved to report availability for this hospital.",
      403,
    );
  }
  if (!input.wards.length && !input.services.length) {
    throw new HospitalAvailabilityError("Add at least one ward or medical service before publishing.", 422);
  }
  if (input.wards.length > 80 || input.services.length > 80) {
    throw new HospitalAvailabilityError("Too many rows in one availability report.", 422);
  }
  const source = input.source.trim();
  if (source.length < 3 || source.length > 240) {
    throw new HospitalAvailabilityError("Describe how this report was collected (3–240 characters).", 422);
  }
  const note = input.note?.trim() || null;
  if (note && note.length > 1000) throw new HospitalAvailabilityError("The note is too long.", 422);

  const wardCodes = new Set<string>();
  const wards = input.wards.map((ward) => {
    const definition = WARD_INDEX.get(ward.code);
    if (!definition || !WARD_GROUPS.has(definition.group)) {
      throw new HospitalAvailabilityError(`Unknown ward type: ${ward.code}`, 422);
    }
    if (wardCodes.has(ward.code)) throw new HospitalAvailabilityError(`Ward ${ward.code} appears twice.`, 422);
    wardCodes.add(ward.code);
    if (!ADMISSION_STATUSES.has(ward.admissionStatus)) {
      throw new HospitalAvailabilityError(`Invalid admission status for ${definition.name}.`, 422);
    }
    const totalBeds = integerOrNull(ward.totalBeds, `${definition.name} total beds`);
    const availableBeds = integerOrNull(ward.availableBeds, `${definition.name} available beds`);
    if (totalBeds !== null && availableBeds !== null && availableBeds > totalBeds) {
      throw new HospitalAvailabilityError(`${definition.name} cannot have more available beds than total beds.`, 422);
    }
    return {
      code: ward.code,
      name: definition.name,
      group: definition.group as Ward["group"],
      totalBeds,
      availableBeds,
      occupiedBeds: totalBeds !== null && availableBeds !== null ? totalBeds - availableBeds : null,
      admissionStatus: ward.admissionStatus,
    };
  });

  const serviceCodes = new Set<string>();
  const services = input.services.map((service) => {
    const definition = SERVICE_INDEX.get(service.code);
    if (!definition || !SERVICE_GROUPS.has(definition.group)) {
      throw new HospitalAvailabilityError(`Unknown medical service: ${service.code}`, 422);
    }
    if (serviceCodes.has(service.code)) {
      throw new HospitalAvailabilityError(`Service ${service.code} appears twice.`, 422);
    }
    serviceCodes.add(service.code);
    if (!SERVICE_STATUSES.has(service.availabilityStatus)) {
      throw new HospitalAvailabilityError(`Invalid status for ${definition.name}.`, 422);
    }
    const operatingHours = service.operatingHours?.trim() || null;
    const contact = service.contact?.trim() || null;
    if (operatingHours && operatingHours.length > 120) {
      throw new HospitalAvailabilityError(`${definition.name} operating hours are too long.`, 422);
    }
    if (contact && contact.length > 60) {
      throw new HospitalAvailabilityError(`${definition.name} contact is too long.`, 422);
    }
    return {
      code: service.code,
      name: definition.name,
      group: definition.group as MedicalService["group"],
      exists: service.exists !== false,
      availabilityStatus: service.availabilityStatus,
      operatingHours,
      emergencyAvailable: service.emergencyAvailable ?? null,
      contact,
      contactVerified: false,
    };
  });

  const profile = get<{ version: number; source: string; note: string | null; updated_at: string }>(
    "SELECT version, source, note, updated_at FROM hospital_availability_profiles WHERE facility_id = ?",
    [facilityId],
  );
  if ((profile?.version ?? 0) !== input.expectedVersion) {
    throw new HospitalAvailabilityError(
      "This availability report changed since you opened it. Reload the hospital to get the latest version before publishing.",
      409,
    );
  }

  const previousWards = new Map(
    all<WardRow>(
      "SELECT * FROM hospital_wards WHERE facility_id = ? AND department_id = ?",
      [facilityId, departmentId],
    ).map((row) => [row.code, row]),
  );
  const previousServices = new Map(
    all<ServiceRow>(
      "SELECT * FROM hospital_services WHERE facility_id = ? AND department_id = ?",
      [facilityId, departmentId],
    ).map((row) => [row.code, row]),
  );

  const stamp = nowIso();
  const nextVersion = (profile?.version ?? 0) + 1;

  transaction(() => {
    run(
      `INSERT INTO hospital_availability_profiles
        (facility_id, department_id, version, source, note, updated_by, updated_at)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(facility_id) DO UPDATE SET
         department_id = excluded.department_id,
         version = excluded.version,
         source = excluded.source,
         note = excluded.note,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at`,
      [facilityId, departmentId, nextVersion, source, note, userId, stamp],
    );
    run("DELETE FROM hospital_wards WHERE facility_id = ?", [facilityId]);
    run("DELETE FROM hospital_services WHERE facility_id = ?", [facilityId]);

    for (const ward of wards) {
      const previous = previousWards.get(ward.code) ?? null;
      const id = previous?.id ?? newId("ward");
      run(
        `INSERT INTO hospital_wards
          (id, facility_id, department_id, code, name, ward_group, total_beds, available_beds,
           occupied_beds, admission_status, source, verification_status, version, updated_by, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?, 'verified', ?, ?, ?)`,
        [
          id, facilityId, departmentId, ward.code, ward.name, ward.group, ward.totalBeds,
          ward.availableBeds, ward.occupiedBeds, ward.admissionStatus, source, nextVersion, userId, stamp,
        ],
      );
      run(
        `INSERT INTO hospital_availability_history
          (id, facility_id, department_id, resource_type, resource_id, previous_payload, current_payload,
           source, note, actor_id, actor_label, created_at)
         VALUES (?,?,?, 'ward', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId("hhist"), facilityId, departmentId, id,
          previous ? JSON.stringify(previous) : null,
          JSON.stringify({ ...ward, id, version: nextVersion, verificationStatus: "verified", updatedAt: stamp }),
          source, note, userId, organisation.name, stamp,
        ],
      );
    }
    for (const [code, previous] of previousWards) {
      if (wardCodes.has(code)) continue;
      run(
        `INSERT INTO hospital_availability_history
          (id, facility_id, department_id, resource_type, resource_id, previous_payload, current_payload,
           source, note, actor_id, actor_label, created_at)
         VALUES (?,?,?, 'ward', ?, ?, NULL, ?, ?, ?, ?, ?)`,
        [newId("hhist"), facilityId, departmentId, previous.id, JSON.stringify(previous), source, note, userId, organisation.name, stamp],
      );
    }

    for (const service of services) {
      const previous = previousServices.get(service.code) ?? null;
      const id = previous?.id ?? newId("hsvc");
      run(
        `INSERT INTO hospital_services
          (id, facility_id, department_id, code, name, service_group, exists_flag, availability_status,
           operating_hours, emergency_available, contact, contact_verified, source, verification_status,
           version, updated_by, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'verified', ?, ?, ?)`,
        [
          id, facilityId, departmentId, service.code, service.name, service.group,
          service.exists ? 1 : 0, service.availabilityStatus, service.operatingHours,
          service.emergencyAvailable === null ? null : service.emergencyAvailable ? 1 : 0,
          service.contact, service.contactVerified ? 1 : 0, source, nextVersion, userId, stamp,
        ],
      );
      run(
        `INSERT INTO hospital_availability_history
          (id, facility_id, department_id, resource_type, resource_id, previous_payload, current_payload,
           source, note, actor_id, actor_label, created_at)
         VALUES (?,?,?, 'service', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId("hhist"), facilityId, departmentId, id,
          previous ? JSON.stringify(previous) : null,
          JSON.stringify({ ...service, id, version: nextVersion, verificationStatus: "verified", updatedAt: stamp }),
          source, note, userId, organisation.name, stamp,
        ],
      );
    }
    for (const [code, previous] of previousServices) {
      if (serviceCodes.has(code)) continue;
      run(
        `INSERT INTO hospital_availability_history
          (id, facility_id, department_id, resource_type, resource_id, previous_payload, current_payload,
           source, note, actor_id, actor_label, created_at)
         VALUES (?,?,?, 'service', ?, ?, NULL, ?, ?, ?, ?, ?)`,
        [newId("hhist"), facilityId, departmentId, previous.id, JSON.stringify(previous), source, note, userId, organisation.name, stamp],
      );
    }

    run(
      `INSERT INTO hospital_availability_history
        (id, facility_id, department_id, resource_type, resource_id, previous_payload, current_payload,
         source, note, actor_id, actor_label, created_at)
       VALUES (?,?,?, 'profile', NULL, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId("hhist"), facilityId, departmentId,
        profile ? JSON.stringify(profile) : null,
        JSON.stringify({ version: nextVersion, source, note, wardCount: wards.length, serviceCount: services.length, updatedAt: stamp }),
        source, note, userId, organisation.name, stamp,
      ],
    );

    run(
      `INSERT INTO audit_logs (id, actor_id, actor_role, actor_label, action, target_type, target_id, detail, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        newId("audit"), userId, "authority", organisation.name, "hospital.availability_published",
        "hospital", facilityId, `Version ${nextVersion}: ${wards.length} wards, ${services.length} services. ${source}`, stamp,
      ],
    );
  });

  const detail = loadAvailability([facilityId])[facilityId];
  if (!detail) throw new HospitalAvailabilityError("The availability report could not be read back after saving.", 500);
  return detail;
}

export function hospitalAvailabilityHistory(
  facilityId: string,
  departmentId: string,
  limit = 20,
): HospitalAvailabilityHistoryRow[] {
  const rows = all<{
    id: string;
    resource_type: "profile" | "ward" | "service";
    resource_id: string | null;
    previous_payload: string | null;
    current_payload: string | null;
    source: string | null;
    note: string | null;
    actor_label: string | null;
    created_at: string;
  }>(
    `SELECT id, resource_type, resource_id, previous_payload, current_payload, source, note,
            actor_label, created_at
     FROM hospital_availability_history
     WHERE facility_id = ? AND department_id = ?
     ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    [facilityId, departmentId, Math.min(100, Math.max(1, limit))],
  );
  return rows.map((row) => ({
    id: row.id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    previous: parseHistory(row.previous_payload),
    current: parseHistory(row.current_payload),
    source: row.source,
    note: row.note,
    actorLabel: row.actor_label,
    createdAt: row.created_at,
  }));
}

function safeUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.startsWith("www.") ? `https://${value}` : value);
    return ["https:", "http:"].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function candidateFacility(place: NominatimPlace, now: string): Facility | null {
  const path = place.osm_type ? OSM_PATH[place.osm_type] : undefined;
  const osmId = Number(place.osm_id);
  const lat = Number(place.lat);
  const lng = Number(place.lon);
  if (!path || !Number.isInteger(osmId) || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (!["hospital", "clinic"].includes(place.type ?? "")) return null;
  if (!["amenity", "healthcare"].includes(place.category ?? "")) return null;

  const extra = place.extratags ?? {};
  const address = place.address ?? {};
  const specialties = (extra["healthcare:speciality"] ?? "")
    .split(";")
    .map((value) => value.trim())
    .filter((value) => value && value !== "general");
  const rawPhone = extra["contact:phone"] ?? extra.phone ?? extra.telephone;
  const phone = rawPhone && /^[+\d][\d ()-]{2,30}$/.test(rawPhone.split(";")[0].trim())
    ? rawPhone.split(";")[0].trim()
    : null;
  const operatorType = extra["operator:type"] ?? extra.ownership ?? extra.operator;
  const fullAddress = place.display_name?.trim() || [
    address.house_number, address.road, address.neighbourhood ?? address.suburb,
    address.city ?? address.town ?? address.village, address.state_district ?? address.county,
    address.postcode, address.country,
  ].filter(Boolean).join(", ");
  const sourceUrl = `https://www.openstreetmap.org/${path}/${osmId}`;
  const name = place.name?.trim() || fullAddress.split(",")[0]?.trim() || `Unnamed ${place.type}`;

  return {
    id: `osm:${path}:${osmId}`,
    name,
    kind: place.type === "clinic" ? "clinic" : "hospital",
    lat,
    lng,
    address: fullAddress || "Full address not published in source data",
    distanceKm: 0,
    phone,
    phoneVerified: false,
    phoneSource: phone ? sourceUrl : null,
    phoneCheckedAt: null,
    website: safeUrl(extra["contact:website"] ?? extra.website),
    photo: safeUrl(extra.image),
    openingHours: extra.opening_hours?.trim() || null,
    emergencyDepartment: place.type === "hospital" && extra.emergency === "yes"
      ? true
      : place.type === "hospital" && extra.emergency === "no"
        ? false
        : null,
    trauma: specialties.includes("trauma") || extra["healthcare:trauma_center"] === "yes",
    ownership: operatorType && ["government", "public"].includes(operatorType)
      ? "public"
      : operatorType === "private" ? "private" : null,
    children: specialties.length === 1 && ["paediatrics", "pediatrics"].includes(specialties[0]),
    specialties,
    capabilitySource: sourceUrl,
    source: "OpenStreetMap contributors via Nominatim",
    sourceUrl,
    updatedAt: now,
  };
}

export async function searchHospitalCandidates(query: string, departmentId: string) {
  ensureFacilitySchema();
  const term = query.trim();
  if (term.length < 2) {
    return { candidates: [] as HospitalCandidate[], source: "CIVIS facility directory", warning: "Enter at least two characters of the hospital name or city." };
  }
  const like = `%${term}%`;
  const local = all<{
    id: string;
    name: string;
    kind: string;
    address: string | null;
    lat: number;
    lng: number;
    link_status: string | null;
  }>(
    `SELECT f.id, f.name, f.kind, fl.address, fl.lat, fl.lng, l.status AS link_status
     FROM emergency_facilities f
     JOIN facility_locations fl ON fl.facility_id = f.id
     LEFT JOIN hospital_org_links l ON l.facility_id = f.id AND l.department_id = ?
     WHERE f.kind IN ('hospital','clinic') AND (f.name LIKE ? OR fl.address LIKE ?)
     ORDER BY CASE WHEN f.name LIKE ? THEN 0 ELSE 1 END, f.name
     LIMIT 24`,
    [departmentId, like, like, `${term}%`],
  );
  const candidates = new Map<string, HospitalCandidate>();
  for (const row of local) {
    candidates.set(row.id, {
      id: row.id,
      name: row.name,
      address: row.address ?? "Address not published",
      kind: row.kind,
      lat: row.lat,
      lng: row.lng,
      linkStatus: row.link_status,
    });
  }
  if (candidates.size >= 8) {
    return { candidates: [...candidates.values()], source: "CIVIS facility directory", warning: null };
  }

  let warning: string | null = null;
  let source = "CIVIS facility directory";
  try {
    const endpoint = process.env.CIVIS_NOMINATIM_URL ?? "https://nominatim.openstreetmap.org/search";
    const places = await nominatimFetch(async () => {
      const url = new URL(endpoint);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("q", term);
      url.searchParams.set("limit", "24");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("extratags", "1");
      url.searchParams.set("accept-language", "en");
      const response = await fetch(url.toString(), {
        headers: { "User-Agent": "CIVIS/1.0 hospital availability directory", Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`Hospital directory returned ${response.status}.`);
      const data = await response.json() as NominatimPlace[];
      if (!Array.isArray(data)) throw new Error("Hospital directory returned an unexpected response.");
      return data;
    });
    const stamp = nowIso();
    const discovered = places
      .map((place) => candidateFacility(place, stamp))
      .filter((facility): facility is Facility => facility !== null);
    if (discovered.length) {
      storeFacilities(discovered);
      source = "OpenStreetMap contributors via Nominatim";
      const ids = discovered.map((facility) => facility.id);
      const links = all<{ facility_id: string; status: string }>(
        `SELECT facility_id, status FROM hospital_org_links
         WHERE department_id = ? AND facility_id IN (${placeholders(ids)})`,
        [departmentId, ...ids],
      );
      const linkMap = new Map(links.map((row) => [row.facility_id, row.status]));
      for (const facility of discovered) {
        if (candidates.has(facility.id)) continue;
        candidates.set(facility.id, {
          id: facility.id,
          name: facility.name,
          address: facility.address,
          kind: facility.kind,
          lat: facility.lat,
          lng: facility.lng,
          linkStatus: linkMap.get(facility.id) ?? null,
        });
      }
    }
  } catch {
    warning = candidates.size
      ? "Showing hospitals already stored in CIVIS. The live hospital directory is unavailable right now."
      : "The live hospital directory is unavailable right now. Search the public Nearby Hospitals finder for the facility's area, then try again.";
  }

  return {
    candidates: [...candidates.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 30),
    source,
    warning,
  };
}

import { all, get, run, transaction } from "@/lib/db";
import { newId, nowIso } from "@/lib/crypto";
import { haversineKm } from "@/lib/format";
import { audit } from "@/lib/auth";
import {
  createNotification,
  moderatorIds,
  organisationUserIds,
} from "@/lib/notifications";
import {
  BLOOD_GROUPS,
  COMPONENTS,
  URGENCIES,
  compatibleDonorGroups,
  urgencyMeta,
  type BloodComponent,
  type BloodGroup,
  type RequestStatus,
  type Urgency,
} from "./compat";

/**
 * Blood Connect data layer.
 *
 * Rules that matter here:
 *  - a request is never described as verified until a moderator verifies it;
 *  - donor alerts only go to opted-in, available, compatible donors inside the
 *    request radius, and only once per request per donor;
 *  - contact details are never returned to an anonymous browser;
 *  - closing or fulfilling a request stops all further matching alerts.
 */

export class BloodError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "BloodError";
    this.status = status;
  }
}

type SessionUser = { id: string; role: string; name: string };

type DonorRow = {
  id: string;
  user_id: string;
  full_name: string;
  blood_group: string;
  city: string;
  district: string;
  preferred_area: string | null;
  contact_phone: string | null;
  latitude: number | null;
  longitude: number | null;
  location_privacy: string;
  availability: string;
  notification_consent: number;
  contact_method: string;
  previous_donation_date: string | null;
  note: string | null;
  active: number;
  created_at: string;
  updated_at: string;
};

type RequestRow = {
  id: string;
  request_code: string;
  requester_id: string | null;
  patient_name: string;
  blood_group: string;
  component: string;
  component_note: string | null;
  units_required: number;
  units_fulfilled: number;
  hospital_name: string;
  hospital_address: string | null;
  district: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  required_date: string;
  required_time: string;
  required_at: string;
  urgency: string;
  contact_name: string;
  contact_phone: string;
  contact_method: string;
  notes: string | null;
  proof_url: string | null;
  verification_status: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
  is_demo: number;
  distance_km?: number;
};

const PHONE_RE = /^\+?[0-9][0-9 ()-]{6,19}$/;
const OPEN_STATUSES: RequestStatus[] = ["verified", "active", "partially_fulfilled"];
const CLOSED_STATUSES: RequestStatus[] = ["fulfilled", "cancelled", "rejected"];

function cleanText(value: string | undefined | null, max: number): string | null {
  const text = value?.trim();
  if (!text) return null;
  return text.slice(0, max);
}

function assertCoordinates(lat: number, lng: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw new BloodError("Choose a valid hospital location on the map.", 422);
  }
}

export function bloodRadiusKm(): number {
  const row = get<{ value: string }>("SELECT value FROM meta WHERE key = 'blood.radius_km'");
  const parsed = Number(row?.value);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 100 ? parsed : 25;
}

/** Initials only — used where even a first name would identify a donor. */
function initials(name: string): string {
  const letters = name.trim().split(/\s+/).filter(Boolean).map((part) => part[0]?.toUpperCase() ?? "");
  return letters.length ? `${letters.join(". ")}.` : "Donor";
}

export function maskPatient(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Patient";
  if (parts.length === 1) return parts[0].slice(0, 1) + "•••";
  return `${parts[0]} ${parts[parts.length - 1].slice(0, 1)}.`;
}

export function nextRequestCode(): string {
  const year = new Date().getFullYear();
  const prefix = `CIVIS-BLOOD-${year}-`;
  const row = get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM blood_requests WHERE request_code LIKE ?",
    [`${prefix}%`],
  );
  let sequence = (row?.n ?? 0) + 1;
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const code = `${prefix}${String(sequence).padStart(5, "0")}`;
    if (!get<{ id: string }>("SELECT id FROM blood_requests WHERE request_code = ?", [code])) {
      return code;
    }
    sequence += 1;
  }
  return `${prefix}${Date.now().toString().slice(-5)}`;
}

export type CreateRequestInput = {
  patientName: string;
  bloodGroup: string;
  component: string;
  componentNote?: string | null;
  unitsRequired: number;
  hospitalName: string;
  hospitalAddress?: string | null;
  district?: string | null;
  city?: string | null;
  latitude: number;
  longitude: number;
  requiredDate: string;
  requiredTime: string;
  urgency: string;
  contactName: string;
  contactPhone: string;
  contactMethod?: "in_app" | "phone";
  notes?: string | null;
  proofUrl?: string | null;
};

export function createBloodRequest(user: SessionUser, input: CreateRequestInput) {
  if (!BLOOD_GROUPS.includes(input.bloodGroup as BloodGroup)) {
    throw new BloodError("Choose the blood group the patient needs.", 422);
  }
  if (!COMPONENTS.some((entry) => entry.value === input.component)) {
    throw new BloodError("Choose the blood component required.", 422);
  }
  if (!URGENCIES.some((entry) => entry.value === input.urgency)) {
    throw new BloodError("Choose an urgency level.", 422);
  }
  const units = Number(input.unitsRequired);
  if (!Number.isInteger(units) || units < 1 || units > 20) {
    throw new BloodError("Number of units must be a whole number between 1 and 20.", 422);
  }
  const patientName = cleanText(input.patientName, 120);
  if (!patientName) throw new BloodError("Enter the patient's name.", 422);
  const hospitalName = cleanText(input.hospitalName, 160);
  if (!hospitalName) throw new BloodError("Enter the hospital name.", 422);
  const contactName = cleanText(input.contactName, 120);
  if (!contactName) throw new BloodError("Enter a contact name.", 422);
  const phone = input.contactPhone.trim();
  if (!PHONE_RE.test(phone)) throw new BloodError("Enter a contact number the hospital or family can answer.", 422);
  assertCoordinates(Number(input.latitude), Number(input.longitude));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.requiredDate) || !/^\d{2}:\d{2}$/.test(input.requiredTime)) {
    throw new BloodError("Enter the date and time the blood is needed.", 422);
  }
  const requiredAt = new Date(`${input.requiredDate}T${input.requiredTime}:00`);
  if (Number.isNaN(requiredAt.getTime())) throw new BloodError("That date and time could not be read.", 422);
  if (requiredAt.getTime() < Date.now() - 3_600_000) {
    throw new BloodError("Choose a required date and time in the future.", 422);
  }

  // Duplicate protection: an identical open request for the same patient,
  // phone and timing within the last two hours is treated as a double submit.
  const duplicate = get<{ id: string; request_code: string }>(
    `SELECT id, request_code FROM blood_requests
      WHERE contact_phone = ? AND lower(patient_name) = lower(?)
        AND required_at = ? AND status NOT IN ('cancelled','rejected','fulfilled')
        AND created_at > ?`,
    [phone, patientName, requiredAt.toISOString(), new Date(Date.now() - 2 * 3_600_000).toISOString()],
  );
  if (duplicate) {
    throw new BloodError(`This request already exists as ${duplicate.request_code}.`, 409);
  }

  const urgent = input.urgency === "critical";
  const expiresAt = new Date(Math.max(requiredAt.getTime(), Date.now()) + 12 * 3_600_000).toISOString();
  const stamp = nowIso();
  const id = newId("blood");
  const code = nextRequestCode();

  transaction(() => {
    run(
      `INSERT INTO blood_requests (
        id, request_code, requester_id, patient_name, blood_group, component, component_note,
        units_required, units_fulfilled, hospital_name, hospital_address, district, city,
        latitude, longitude, required_date, required_time, required_at, urgency,
        contact_name, contact_phone, contact_method, notes, proof_url,
        verification_status, status, created_at, updated_at, expires_at, is_demo
      ) VALUES (?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending','pending_verification',?,?,?,0)`,
      [
        id, code, user.id, patientName, input.bloodGroup, input.component,
        cleanText(input.componentNote, 160), units, hospitalName,
        cleanText(input.hospitalAddress, 300), cleanText(input.district, 80), cleanText(input.city, 80),
        Number(input.latitude), Number(input.longitude),
        input.requiredDate, input.requiredTime, requiredAt.toISOString(), input.urgency,
        contactName, phone, input.contactMethod ?? "in_app", cleanText(input.notes, 800),
        cleanText(input.proofUrl, 500), stamp, stamp, expiresAt,
      ],
    );
    run(
      `INSERT INTO blood_request_history (id, blood_request_id, previous_status, new_status, performed_by, notes, created_at)
       VALUES (?,?,NULL,'pending_verification',?,?,?)`,
      [newId("bhist"), id, user.id, "Submitted by the requester.", stamp],
    );
  });

  audit({ id: user.id, role: user.role, name: user.name }, "blood.request_created", {
    type: "blood",
    id,
  }, `${code} — ${input.bloodGroup} ${input.component} ×${units} at ${hospitalName}`);

  // Moderators screen every submission before donors are alerted.
  const reviewers = [...new Set([...moderatorIds(), ...adminIds()])];
  for (const reviewer of reviewers) {
    createNotification({
      userId: reviewer,
      type: urgent ? "blood_request_urgent" : "blood_request_created",
      title: urgent ? "Critical blood request needs verification" : "New blood request needs verification",
      body: `${code} — ${input.bloodGroup} ${input.component.toLowerCase().replaceAll("_", " ")} ×${units} at ${hospitalName}.`,
      category: "blood",
      priority: urgent ? "critical" : "high",
      actionUrl: `/blood/${id}`,
      bloodRequestId: id,
      dedupeKey: `blood_new:${id}:${reviewer}`,
    });
  }

  return { id, code, status: "pending_verification", moderatorsNotified: reviewers.length };
}

function requestRow(idOrCode: string): RequestRow | undefined {
  return get<RequestRow>(
    "SELECT * FROM blood_requests WHERE id = ? OR request_code = ?",
    [idOrCode, idOrCode.toUpperCase()],
  );
}

function viewerRole(viewer: SessionUser | null, row: RequestRow) {
  if (!viewer) return "public" as const;
  if (viewer.role === "admin" || viewer.role === "moderator") return "staff" as const;
  if (row.requester_id === viewer.id) return "owner" as const;
  return "public" as const;
}

export function publicRequestShape(row: RequestRow, viewer: SessionUser | null) {
  const role = viewerRole(viewer, row);
  const base = {
    id: row.id,
    code: row.request_code,
    bloodGroup: row.blood_group,
    component: row.component,
    componentNote: row.component_note,
    componentLabel: COMPONENTS.find((entry) => entry.value === row.component)?.label ?? row.component,
    unitsRequired: row.units_required,
    unitsFulfilled: row.units_fulfilled,
    hospitalName: row.hospital_name,
    hospitalAddress: row.hospital_address,
    district: row.district,
    city: row.city,
    latitude: row.latitude,
    longitude: row.longitude,
    requiredAt: row.required_at,
    requiredDate: row.required_date,
    requiredTime: row.required_time,
    urgency: row.urgency,
    urgencyLabel: urgencyMeta(row.urgency).label,
    verificationStatus: row.verification_status,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    distanceKm: row.distance_km ?? null,
    isOwner: role === "owner",
  };

  if (role === "staff") {
    return {
      ...base,
      patientName: row.patient_name,
      contactName: row.contact_name,
      contactPhone: row.contact_phone,
      contactMethod: row.contact_method,
      reviewNotes: row.review_notes,
      proofUrl: row.proof_url,
      redacted: false,
    };
  }
  if (role === "owner") {
    return {
      ...base,
      patientName: row.patient_name,
      contactName: row.contact_name,
      contactPhone: row.contact_phone,
      contactMethod: row.contact_method,
      reviewNotes: row.review_notes,
      redacted: false,
    };
  }
  return {
    ...base,
    patientName: maskPatient(row.patient_name),
    contactName: null,
    contactPhone: null,
    reviewNotes: null,
    proofUrl: null,
    redacted: true,
  };
}

export function getBloodRequest(idOrCode: string, viewer: SessionUser | null) {
  const row = requestRow(idOrCode);
  if (!row) throw new BloodError("Blood request not found.", 404);
  return { row, shape: publicRequestShape(row, viewer) };
}

export type ListOptions = {
  lat?: number | null;
  lng?: number | null;
  radius?: number;
  bloodGroup?: string | null;
  component?: string | null;
  urgency?: string | null;
  status?: string | null;
  requesterId?: string | null;
  includeClosed?: boolean;
  limit?: number;
};

export function listBloodRequests(options: ListOptions, viewer: SessionUser | null) {
  const limit = Math.min(100, Math.max(1, options.limit ?? 40));
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (options.requesterId) {
    clauses.push("requester_id = ?");
    params.push(options.requesterId);
  } else if (!options.status) {
    clauses.push("status IN ('verified','active','partially_fulfilled')");
  }

  if (options.status && options.status !== "all") {
    if (options.status === "open") {
      clauses.push("status IN ('verified','active','partially_fulfilled')");
    } else {
      clauses.push("status = ?");
      params.push(options.status);
    }
  }
  if (options.bloodGroup) {
    clauses.push("blood_group = ?");
    params.push(options.bloodGroup);
  }
  if (options.component) {
    clauses.push("component = ?");
    params.push(options.component);
  }
  if (options.urgency) {
    clauses.push("urgency = ?");
    params.push(options.urgency);
  }

  const lat = Number(options.lat);
  const lng = Number(options.lng);
  const hasPoint = options.lat !== null && options.lat !== undefined && Number.isFinite(lat)
    && options.lng !== null && options.lng !== undefined && Number.isFinite(lng);

  let rows: RequestRow[];
  if (hasPoint) {
    // Bounding box narrows the scan inside SQLite; the exact radius is applied
    // with the same haversine used everywhere else in CIVIS.
    const radius = options.radius && options.radius > 0 ? Math.min(100, options.radius) : bloodRadiusKm();
    const latDelta = radius / 111.32;
    const lngDelta = radius / (111.32 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
    clauses.push("latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?");
    params.push(lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta);
    rows = all<RequestRow>(
      `SELECT * FROM blood_requests WHERE ${clauses.join(" AND ")} ORDER BY created_at DESC LIMIT 400`,
      params,
    )
      .map((row) => ({ ...row, distance_km: haversineKm({ lat, lng }, { lat: row.latitude, lng: row.longitude }) }))
      .filter((row) => (row.distance_km ?? Infinity) <= radius)
      .sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0))
      .slice(0, limit);
  } else {
    rows = all<RequestRow>(
      `SELECT * FROM blood_requests ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
        ORDER BY CASE urgency WHEN 'critical' THEN 0 WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,
                 created_at DESC
        LIMIT ?`,
      [...params, limit],
    );
  }

  return rows.map((row) => publicRequestShape(row, viewer));
}

export function expireStaleRequests() {
  const stamp = nowIso();
  const rows = all<{ id: string; status: string }>(
    "SELECT id, status FROM blood_requests WHERE status IN ('verified','active','partially_fulfilled') AND expires_at < ?",
    [stamp],
  );
  for (const row of rows) {
    transaction(() => {
      run("UPDATE blood_requests SET status = 'expired', updated_at = ? WHERE id = ?", [stamp, row.id]);
      run(
        `INSERT INTO blood_request_history (id, blood_request_id, previous_status, new_status, performed_by, notes, created_at)
         VALUES (?,?,?,'expired','system','Requested time passed without the request being fulfilled.',?)`,
        [newId("bhist"), row.id, row.status, stamp],
      );
    });
  }
  return rows.length;
}

export function updateRequestStatus(
  actor: SessionUser,
  idOrCode: string,
  input: { status: string; unitsFulfilled?: number; notes?: string | null },
) {
  const row = requestRow(idOrCode);
  if (!row) throw new BloodError("Blood request not found.", 404);
  const allowed: RequestStatus[] = ["active", "partially_fulfilled", "fulfilled", "cancelled", "expired"];
  if (!allowed.includes(input.status as RequestStatus)) {
    throw new BloodError("That status cannot be set from this screen.", 422);
  }
  const isOwner = row.requester_id === actor.id;
  const isStaff = actor.role === "admin" || actor.role === "moderator";
  if (!isOwner && !isStaff) throw new BloodError("You cannot change this request.", 403);
  if (actor.role === "authority") throw new BloodError("Only the requester or platform staff can change a blood request.", 403);

  if ((input.status === "fulfilled" || input.status === "partially_fulfilled") && !isOwner && !isStaff) {
    throw new BloodError("Only the requester or staff can confirm units.", 403);
  }

  const units = input.unitsFulfilled === undefined
    ? row.units_fulfilled
    : Math.max(0, Math.min(row.units_required, Math.round(Number(input.unitsFulfilled))));
  if (input.status === "partially_fulfilled" && units >= row.units_required) {
    throw new BloodError("Mark the request fulfilled when all units are arranged.", 422);
  }

  const stamp = nowIso();
  transaction(() => {
    run(
      "UPDATE blood_requests SET status = ?, units_fulfilled = ?, updated_at = ? WHERE id = ?",
      [input.status, input.status === "fulfilled" ? row.units_required : units, stamp, row.id],
    );
    run(
      `INSERT INTO blood_request_history (id, blood_request_id, previous_status, new_status, performed_by, notes, created_at)
       VALUES (?,?,?,?,?,?,?)`,
      [newId("bhist"), row.id, row.status, input.status, actor.id, cleanText(input.notes, 400), stamp],
    );
  });

  audit({ id: actor.id, role: actor.role, name: actor.name }, `blood.status_${input.status}`, {
    type: "blood",
    id: row.id,
  }, `${row.request_code}: ${row.status} → ${input.status}`);

  if (row.requester_id && row.requester_id !== actor.id) {
    createNotification({
      userId: row.requester_id,
      type: input.status === "fulfilled" ? "blood_request_fulfilled" : "blood_request",
      title: input.status === "fulfilled"
        ? "Your blood request was marked fulfilled"
        : `Blood request ${input.status.replaceAll("_", " ")}`,
      body: `${row.request_code} — ${row.hospital_name}.`,
      category: "blood",
      actionUrl: `/blood/${row.id}`,
      bloodRequestId: row.id,
    });
  }

  if (CLOSED_STATUSES.includes(input.status as RequestStatus)) {
    for (const moderator of moderatorIds()) {
      createNotification({
        userId: moderator,
        type: "blood_request_fulfilled",
        title: input.status === "fulfilled" ? "Blood request fulfilled" : "Blood request closed",
        body: `${row.request_code} is now ${input.status}; matching alerts have stopped.`,
        category: "blood",
        priority: "low",
        actionUrl: `/blood/${row.id}`,
        bloodRequestId: row.id,
        dedupeKey: `blood_closed:${row.id}:${input.status}:${moderator}`,
      });
    }
  }

  return { id: row.id, status: input.status };
}

export type ReviewAction = "verify" | "reject" | "request_info" | "flag";

export function reviewBloodRequest(
  reviewer: SessionUser,
  idOrCode: string,
  action: ReviewAction,
  notes: string | null,
) {
  if (reviewer.role !== "admin" && reviewer.role !== "moderator") {
    throw new BloodError("Only moderators and administrators can review blood requests.", 403);
  }
  const row = requestRow(idOrCode);
  if (!row) throw new BloodError("Blood request not found.", 404);
  if ((action === "verify" || action === "reject") && row.status !== "pending_verification") {
    throw new BloodError(
      `This request is already ${row.status.replaceAll("_", " ")} and cannot be re-reviewed.`,
      409,
    );
  }
  const stamp = nowIso();
  const note = cleanText(notes, 600);

  if (action === "flag") {
    run("UPDATE blood_requests SET updated_at = ? WHERE id = ?", [stamp, row.id]);
    for (const other of moderatorIds().filter((id) => id !== reviewer.id)) {
      createNotification({
        userId: other,
        type: "blood_request_flagged",
        title: "Blood request flagged for review",
        body: `${row.request_code} — ${note ?? "flagged by a moderator"}.`,
        category: "blood",
        priority: "high",
        actionUrl: `/blood/${row.id}`,
        bloodRequestId: row.id,
        dedupeKey: `blood_flag:${row.id}:${reviewer.id}:${other}:${stamp}`,
      });
    }
    return { id: row.id, status: row.status, flagged: true };
  }

  if (action === "request_info") {
    if (!row.requester_id) throw new BloodError("This request has no account to notify.", 422);
    createNotification({
      userId: row.requester_id,
      type: "blood_request",
      title: "More information needed for your blood request",
      body: note ?? "A moderator needs more information before this request is published.",
      category: "blood",
      priority: "high",
      actionUrl: `/blood/${row.id}`,
      bloodRequestId: row.id,
    });
    return { id: row.id, status: row.status };
  }

  const nextStatus = action === "verify" ? "verified" : "rejected";
  transaction(() => {
    run(
      `UPDATE blood_requests SET verification_status = ?, status = ?, reviewed_by = ?, reviewed_at = ?,
         review_notes = ?, updated_at = ? WHERE id = ?`,
      [action === "verify" ? "verified" : "rejected", nextStatus, reviewer.id, stamp, note, stamp, row.id],
    );
    run(
      `INSERT INTO blood_request_verification (id, blood_request_id, reviewer_id, verification_status, review_notes, reviewed_at)
       VALUES (?,?,?,?,?,?)`,
      [newId("bver"), row.id, reviewer.id, nextStatus, note, stamp],
    );
    run(
      `INSERT INTO blood_request_history (id, blood_request_id, previous_status, new_status, performed_by, notes, created_at)
       VALUES (?,?,?,?,?,?,?)`,
      [newId("bhist"), row.id, row.status, nextStatus, reviewer.id, note, stamp],
    );
  });

  audit({ id: reviewer.id, role: reviewer.role, name: reviewer.name }, `blood.${action}`, {
    type: "blood",
    id: row.id,
  }, `${row.request_code}${note ? ` — ${note}` : ""}`);

  if (row.requester_id) {
    createNotification({
      userId: row.requester_id,
      type: action === "verify" ? "blood_request_verified" : "blood_request",
      title: action === "verify" ? "Your blood request is verified" : "Your blood request was not approved",
      body: note ?? (action === "verify"
        ? "Matching donors in the area are being alerted now."
        : "A moderator could not verify this request. Contact support if this is a mistake."),
      category: "blood",
      priority: action === "verify" ? (row.urgency === "critical" ? "critical" : "high") : "normal",
      actionUrl: `/blood/${row.id}`,
      bloodRequestId: row.id,
    });
  }

  let donorsNotified = 0;
  if (action === "verify") {
    donorsNotified = notifyMatchingDonors(row);
    notifyHealthOrganisations(row);
  }
  return { id: row.id, status: nextStatus, donorsNotified };
}

/** Matching donors: opted in, available, compatible, inside the radius, unsent. */
export function notifyMatchingDonors(request: RequestRow, radiusKm = bloodRadiusKm()) {
  const groups = compatibleDonorGroups(request.blood_group as BloodGroup, request.component as BloodComponent);
  if (!groups.length) return 0;
  const latDelta = radiusKm / 111.32;
  const lngDelta = radiusKm / (111.32 * Math.max(0.01, Math.cos((request.latitude * Math.PI) / 180)));
  const placeholders = groups.map(() => "?").join(",");

  const candidates = all<DonorRow>(
    `SELECT * FROM blood_donors
      WHERE active = 1 AND notification_consent = 1 AND availability = 'available'
        AND user_id <> ?
        AND blood_group IN (${placeholders})
        AND latitude IS NOT NULL AND longitude IS NOT NULL
        AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?`,
    [request.requester_id ?? "", ...groups, request.latitude - latDelta, request.latitude + latDelta, request.longitude - lngDelta, request.longitude + lngDelta],
  ).filter((donor) => {
    const distance = haversineKm(
      { lat: request.latitude, lng: request.longitude },
      { lat: donor.latitude ?? 0, lng: donor.longitude ?? 0 },
    );
    return distance <= radiusKm;
  });

  let sent = 0;
  const stamp = nowIso();
  for (const donor of candidates) {
    const created = createNotification({
      userId: donor.user_id,
      type: request.urgency === "critical" ? "blood_request_urgent" : "blood_donor_match",
      title: `${urgencyMeta(request.urgency).label.split(" —")[0]} blood request — ${request.blood_group}`,
      body: `${request.request_code}: ${request.units_required} unit${request.units_required === 1 ? "" : "s"} of ${request.component.replaceAll("_", " ")} needed at ${request.hospital_name}, ${request.district ?? request.city ?? "your area"}.`,
      category: "blood",
      priority: request.urgency === "critical" ? "critical" : "high",
      actionUrl: `/blood/${request.id}`,
      bloodRequestId: request.id,
      dedupeKey: `blood_donor:${request.id}:${donor.user_id}`,
    });
    if (created) {
      sent += 1;
      try {
        run(
          `INSERT OR IGNORE INTO blood_request_notifications
            (id, blood_request_id, recipient_user_id, notification_channel, delivery_status, created_at)
           VALUES (?,?,?,?,?,?)`,
          [newId("bntf"), request.id, donor.user_id, "in_app", "delivered", stamp],
        );
      } catch {
        // The alert is already stored; the delivery ledger is best-effort.
      }
    }
  }
  return sent;
}

/** Verified health organisations covering the district are told about the need. */
function notifyHealthOrganisations(request: RequestRow) {
  const organisations = all<{ id: string; name: string }>(
    `SELECT id, name FROM departments
      WHERE type = 'health' AND verification_status = 'approved'
        AND (district IS NULL OR lower(district) = lower(?))`,
    [request.district ?? ""],
  );
  for (const organisation of organisations) {
    for (const userId of organisationUserIds(organisation.id)) {
      createNotification({
        userId,
        type: "blood_request",
        title: `${request.blood_group} blood needed near your hospital`,
        body: `${request.request_code}: ${request.units_required} unit(s) at ${request.hospital_name}. Coordinate with the hospital or blood bank.`,
        category: "blood",
        priority: request.urgency === "critical" ? "critical" : "normal",
        actionUrl: `/blood/${request.id}`,
        bloodRequestId: request.id,
        organisationId: organisation.id,
        dedupeKey: `blood_org:${request.id}:${userId}`,
      });
    }
  }
}

export function expressInterest(user: SessionUser, idOrCode: string, message: string | null) {
  const row = requestRow(idOrCode);
  if (!row) throw new BloodError("Blood request not found.", 404);
  if (!OPEN_STATUSES.includes(row.status as RequestStatus)) {
    throw new BloodError("This request is no longer collecting donors.", 409);
  }
  if (row.requester_id === user.id) throw new BloodError("You cannot respond to your own request.", 422);

  const donor = get<DonorRow>("SELECT * FROM blood_donors WHERE user_id = ? AND active = 1", [user.id]);
  if (!donor) throw new BloodError("Register as a blood donor before offering to donate.", 403);
  if (donor.availability !== "available") {
    throw new BloodError("Your donor profile is marked unavailable. Update it before offering to donate.", 409);
  }

  const stamp = nowIso();
  const existing = get<{ id: string; status: string }>(
    "SELECT id, status FROM blood_interests WHERE blood_request_id = ? AND donor_id = ?",
    [row.id, donor.id],
  );
  if (existing) {
    if (existing.status === "withdrawn") {
      run("UPDATE blood_interests SET status = 'offered', message = ?, updated_at = ? WHERE id = ?", [
        cleanText(message, 500), stamp, existing.id,
      ]);
    } else {
      return { id: existing.id, status: existing.status, alreadyOffered: true };
    }
  } else {
    run(
      `INSERT INTO blood_interests (id, blood_request_id, donor_id, user_id, message, status, created_at, updated_at)
       VALUES (?,?,?,?,?,'offered',?,?)`,
      [newId("bint"), row.id, donor.id, user.id, cleanText(message, 500), stamp, stamp],
    );
  }

  audit({ id: user.id, role: user.role, name: user.name }, "blood.interest_offered", {
    type: "blood",
    id: row.id,
  }, `${row.request_code} — donor ${donor.blood_group}`);

  if (row.requester_id) {
    createNotification({
      userId: row.requester_id,
      type: "blood_donor_interest",
      title: "A donor offered to help",
      body: `A ${donor.blood_group} donor is interested in ${row.request_code}. Open the request to review and contact them.`,
      category: "blood",
      priority: row.urgency === "critical" ? "critical" : "high",
      actionUrl: `/blood/${row.id}`,
      bloodRequestId: row.id,
      dedupeKey: `blood_interest:${row.id}:${donor.id}:${row.requester_id}`,
    });
  }
  return { id: existing?.id ?? null, status: "offered", alreadyOffered: false };
}

/** Contact details are only shared once the requester accepts an offer. */
export function interestsForRequest(requestId: string, viewer: SessionUser) {
  const row = requestRow(requestId);
  if (!row) throw new BloodError("Blood request not found.", 404);
  const isOwner = row.requester_id === viewer.id;
  const isStaff = viewer.role === "admin" || viewer.role === "moderator";
  if (!isOwner && !isStaff) throw new BloodError("Only the requester or staff can see donor responses.", 403);

  return all<{
    id: string;
    status: string;
    message: string | null;
    created_at: string;
    updated_at: string;
    donor_id: string;
    donor_name: string;
    blood_group: string;
    city: string;
    district: string;
    availability: string;
    contact_method: string;
    contact_phone: string | null;
    last_donation: string | null;
  }>(
    `SELECT i.id, i.status, i.message, i.created_at, i.updated_at, d.id AS donor_id,
            d.full_name AS donor_name, d.blood_group, d.city, d.district, d.availability,
            d.contact_method, d.contact_phone, d.previous_donation_date AS last_donation
       FROM blood_interests i JOIN blood_donors d ON d.id = i.donor_id
      WHERE i.blood_request_id = ?
      ORDER BY CASE i.status WHEN 'accepted' THEN 0 WHEN 'offered' THEN 1 ELSE 2 END, i.created_at`,
    [row.id],
  ).map((interest) => ({
    ...interest,
    // An offer that has not been accepted exposes no personal contact detail
    // and no identifying name — only initials and the blood group.
    contact_phone: interest.status === "accepted" ? interest.contact_phone : null,
    donor_name: interest.status === "accepted" ? interest.donor_name : initials(interest.donor_name),
    message: interest.message,
  }));
}

export function setInterestStatus(
  user: SessionUser,
  idOrCode: string,
  interestId: string,
  status: "accepted" | "declined" | "donated" | "withdrawn",
) {
  const row = requestRow(idOrCode);
  if (!row) throw new BloodError("Blood request not found.", 404);
  const interest = get<{ id: string; donor_id: string; user_id: string; status: string }>(
    "SELECT id, donor_id, user_id, status FROM blood_interests WHERE id = ? AND blood_request_id = ?",
    [interestId, row.id],
  );
  if (!interest) throw new BloodError("Donor response not found.", 404);

  const isOwner = row.requester_id === user.id;
  const isDonor = interest.user_id === user.id;
  const isStaff = user.role === "admin" || user.role === "moderator";
  if (status === "withdrawn" && !isDonor && !isStaff) throw new BloodError("Only the donor can withdraw an offer.", 403);
  if (status !== "withdrawn" && !isOwner && !isStaff) throw new BloodError("Only the requester can respond to offers.", 403);

  const stamp = nowIso();
  run("UPDATE blood_interests SET status = ?, updated_at = ? WHERE id = ?", [status, stamp, interest.id]);

  if (status === "accepted") {
    createNotification({
      userId: interest.user_id,
      type: "blood_donor_interest",
      title: "Your donation offer was accepted",
      body: `${row.request_code} at ${row.hospital_name}. The requester can now see the contact method you chose. Coordinate through the hospital or blood bank.`,
      category: "blood",
      priority: "high",
      actionUrl: `/blood/${row.id}`,
      bloodRequestId: row.id,
    });
  }
  return { id: interest.id, status };
}

export type DonorInput = {
  fullName: string;
  bloodGroup: string;
  city: string;
  district: string;
  preferredArea?: string | null;
  contactPhone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationPrivacy?: "area" | "exact";
  availability?: string;
  notificationConsent?: boolean;
  contactMethod?: "in_app" | "phone";
  previousDonationDate?: string | null;
  note?: string | null;
  active?: boolean;
};

const AVAILABILITY = ["available", "temporarily_unavailable", "break", "not_eligible"];

export function upsertDonor(user: SessionUser, input: DonorInput) {
  if (!BLOOD_GROUPS.includes(input.bloodGroup as BloodGroup)) {
    throw new BloodError("Choose your blood group.", 422);
  }
  const fullName = cleanText(input.fullName, 120);
  if (!fullName) throw new BloodError("Enter your name.", 422);
  const city = cleanText(input.city, 80);
  const district = cleanText(input.district, 80);
  if (!city || !district) throw new BloodError("Enter your city and district.", 422);
  const availability = input.availability ?? "available";
  if (!AVAILABILITY.includes(availability)) throw new BloodError("Choose a valid availability.", 422);

  const phone = input.contactPhone?.trim() || null;
  if (phone && !PHONE_RE.test(phone)) throw new BloodError("Enter a contact number donors can reach.", 422);
  const contactMethod = input.contactMethod ?? "in_app";
  if (contactMethod === "phone" && !phone) {
    throw new BloodError("Add a contact number to accept phone contact.", 422);
  }

  let lat: number | null = null;
  let lng: number | null = null;
  if (input.latitude !== undefined && input.latitude !== null && input.longitude !== undefined && input.longitude !== null) {
    if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)
      || Math.abs(input.latitude) > 90 || Math.abs(input.longitude) > 180) {
      throw new BloodError("Those coordinates are not valid.", 422);
    }
    lat = input.latitude;
    lng = input.longitude;
  }

  const stamp = nowIso();
  const existing = get<{ id: string }>("SELECT id FROM blood_donors WHERE user_id = ?", [user.id]);
  const id = existing?.id ?? newId("donor");
  if (existing) {
    run(
      `UPDATE blood_donors SET full_name = ?, blood_group = ?, city = ?, district = ?, preferred_area = ?,
         contact_phone = ?, latitude = ?, longitude = ?, location_privacy = ?, availability = ?,
         notification_consent = ?, contact_method = ?, previous_donation_date = ?, note = ?,
         active = ?, updated_at = ?
       WHERE id = ?`,
      [
        fullName, input.bloodGroup, city, district, cleanText(input.preferredArea, 120),
        phone, lat, lng, input.locationPrivacy === "exact" ? "exact" : "area", availability,
        input.notificationConsent === false ? 0 : 1, contactMethod,
        cleanText(input.previousDonationDate, 10), cleanText(input.note, 400),
        input.active === false ? 0 : 1, stamp, id,
      ],
    );
  } else {
    run(
      `INSERT INTO blood_donors (id, user_id, full_name, blood_group, city, district, preferred_area,
         contact_phone, latitude, longitude, location_privacy, availability, notification_consent,
         contact_method, previous_donation_date, note, active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id, user.id, fullName, input.bloodGroup, city, district, cleanText(input.preferredArea, 120),
        phone, lat, lng, input.locationPrivacy === "exact" ? "exact" : "area", availability,
        input.notificationConsent === false ? 0 : 1, contactMethod,
        cleanText(input.previousDonationDate, 10), cleanText(input.note, 400),
        input.active === false ? 0 : 1, stamp, stamp,
      ],
    );
  }

  audit({ id: user.id, role: user.role, name: user.name }, existing ? "blood.donor_updated" : "blood.donor_registered", {
    type: "donor",
    id,
  }, input.bloodGroup);
  return { id, created: !existing };
}

export function donorProfile(userId: string) {
  const donor = get<DonorRow>("SELECT * FROM blood_donors WHERE user_id = ?", [userId]);
  if (!donor) return null;
  return {
    id: donor.id,
    fullName: donor.full_name,
    bloodGroup: donor.blood_group,
    city: donor.city,
    district: donor.district,
    preferredArea: donor.preferred_area,
    contactPhone: donor.contact_phone,
    latitude: donor.latitude,
    longitude: donor.longitude,
    locationPrivacy: donor.location_privacy,
    availability: donor.availability,
    notificationConsent: donor.notification_consent === 1,
    contactMethod: donor.contact_method,
    previousDonationDate: donor.previous_donation_date,
    note: donor.note,
    active: donor.active === 1,
    updatedAt: donor.updated_at,
  };
}

export function bloodStats() {
  const count = (sql: string, params: unknown[] = []) =>
    get<{ n: number }>(sql, params)?.n ?? 0;
  expireStaleRequests();
  return {
    open: count("SELECT COUNT(*) AS n FROM blood_requests WHERE status IN ('verified','active','partially_fulfilled')"),
    critical: count("SELECT COUNT(*) AS n FROM blood_requests WHERE status IN ('verified','active','partially_fulfilled') AND urgency = 'critical'"),
    pending: count("SELECT COUNT(*) AS n FROM blood_requests WHERE status = 'pending_verification'"),
    fulfilled: count("SELECT COUNT(*) AS n FROM blood_requests WHERE status = 'fulfilled'"),
    donors: count("SELECT COUNT(*) AS n FROM blood_donors WHERE active = 1"),
    availableDonors: count("SELECT COUNT(*) AS n FROM blood_donors WHERE active = 1 AND availability = 'available'"),
    interests: count("SELECT COUNT(*) AS n FROM blood_interests WHERE status IN ('offered','accepted')"),
  };
}

export function moderationBloodQueue() {
  const pending = all<RequestRow>(
    "SELECT * FROM blood_requests WHERE status = 'pending_verification' ORDER BY CASE urgency WHEN 'critical' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END, created_at ASC LIMIT 60",
  );
  const recent = all<RequestRow>(
    "SELECT * FROM blood_requests WHERE status <> 'pending_verification' ORDER BY updated_at DESC LIMIT 40",
  );
  return { pending: pending.map((row) => publicRequestShape(row, null)), recent: recent.map((row) => publicRequestShape(row, null)) };
}

export function flagBloodRequest(user: SessionUser, idOrCode: string, reason: string) {
  const row = requestRow(idOrCode);
  if (!row) throw new BloodError("Blood request not found.", 404);
  const text = cleanText(reason, 300);
  if (!text) throw new BloodError("Describe why this request looks suspicious.", 422);
  run(
    "INSERT INTO blood_abuse_reports (id, blood_request_id, reporter_id, reason, created_at) VALUES (?,?,?,?,?)",
    [newId("babuse"), row.id, user.id, text, nowIso()],
  );
  for (const reviewer of [...new Set([...moderatorIds(), ...adminIds()])]) {
    createNotification({
      userId: reviewer,
      type: "blood_request_flagged",
      title: "Blood request reported by a user",
      body: `${row.request_code} — ${text}`,
      category: "blood",
      priority: "high",
      actionUrl: `/blood/${row.id}`,
      bloodRequestId: row.id,
      dedupeKey: `blood_abuse:${row.id}:${reviewer}:${Date.now()}`,
    });
  }
  return { ok: true };
}

function adminIds(): string[] {
  return all<{ id: string }>(
    "SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL AND suspended = 0",
  ).map((row) => row.id);
}

/** Donor availability for an organisation managing a hospital (hospital staff). */
export function nearbyDonorSummary(departmentId: string) {
  return organisationUserIds(departmentId).length;
}

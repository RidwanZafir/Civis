import { all, get, run } from "./db";
import { newId, nowIso } from "./crypto";
import { haversineKm } from "./format";
import { createNotification, moderatorIds, organisationUserIds } from "./notifications";

/**
 * Report routing engine.
 *
 * A report is matched to a verified organisation by (a) incident category and
 * (b) geography — either the organisation's own jurisdiction radius measured
 * from its office coordinates, or an explicit district name match.
 *
 * If nothing matches, the report stays in the central CIVIS queue marked
 * `awaiting_assignment` and the platform administrators are notified. It is
 * never claimed that an authority received it.
 */

export const CATEGORY_ORG_TYPES: Record<string, string[]> = {
  roads: ["roads", "municipal"],
  crossings: ["roads", "police"],
  sidewalks: ["municipal", "roads"],
  drainage: ["municipal", "disaster"],
  electrical: ["utility"],
  streetlights: ["utility", "municipal"],
  facilities: ["municipal", "health"],
  other: ["municipal"],
};

export const CATEGORY_AUTHORITY_LABEL: Record<string, string> = {
  roads: "Roads & highways authority",
  crossings: "Traffic police",
  sidewalks: "Municipal authority",
  drainage: "Municipal / disaster management",
  electrical: "Utility authority",
  streetlights: "Utility authority",
  facilities: "Municipal / public facilities",
  other: "Municipal authority",
};

type OrgRow = {
  id: string;
  name: string;
  type: string;
  lat: number | null;
  lng: number | null;
  radius_km: number | null;
  district: string | null;
  division: string | null;
  categories: string | null;
};

export type RoutingOutcome = {
  routed: boolean;
  organisationId: string | null;
  organisationName: string | null;
  reason: string;
};

function supportsCategory(org: OrgRow, category: string) {
  if (!org.categories) return true;
  return org.categories
    .split(",")
    .map((entry) => entry.trim())
    .includes(category);
}

function coversLocation(org: OrgRow, lat: number, lng: number, district: string | null) {
  if (district && org.district && org.district.toLowerCase() === district.toLowerCase()) {
    return { ok: true, distance: 0 };
  }
  if (org.lat === null || org.lng === null) {
    // Organisation has no coordinates: only an explicit district match can
    // reach it, handled above.
    return { ok: false, distance: Number.POSITIVE_INFINITY };
  }
  const distance = haversineKm({ lat, lng }, { lat: org.lat, lng: org.lng });
  const radius = org.radius_km ?? 25;
  return { ok: distance <= radius, distance };
}

export function routeReport(reportId: string): RoutingOutcome {
  const report = get<{
    id: string;
    category_slug: string;
    lat: number;
    lng: number;
    district: string | null;
    title: string;
    user_id: string | null;
  }>("SELECT id, category_slug, lat, lng, district, title, user_id FROM reports WHERE id = ?", [reportId]);

  if (!report) {
    return { routed: false, organisationId: null, organisationName: null, reason: "Report not found." };
  }

  const preferred = CATEGORY_ORG_TYPES[report.category_slug] ?? ["municipal"];
  const organisations = all<OrgRow>(
    `SELECT id, name, type, lat, lng, radius_km, district, division, categories
     FROM departments WHERE verification_status = 'approved'`,
  );

  const candidates = organisations
    .filter((org) => preferred.includes(org.type) && supportsCategory(org, report.category_slug))
    .map((org) => ({ org, ...coversLocation(org, report.lat, report.lng, report.district) }))
    .filter((entry) => entry.ok)
    .sort((a, b) => a.distance - b.distance);

  if (candidates.length === 0) {
    run("UPDATE reports SET routing_state = 'awaiting_assignment', updated_at = ? WHERE id = ?", [
      nowIso(),
      reportId,
    ]);
    const admins = all<{ id: string }>("SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL");
    for (const admin of admins) {
      createNotification({
        userId: admin.id,
        type: "routing_failed",
        title: "Report awaiting authority assignment",
        body: `${reportId} (${report.category_slug}) matched no verified organisation and needs manual routing.`,
        reportId,
        category: "emergencies",
        priority: "high",
        actionUrl: `/incidents/${reportId}`,
        dedupeKey: `routing_failed:${reportId}:${admin.id}`,
      });
    }
    for (const moderator of moderatorIds()) {
      createNotification({
        userId: moderator,
        type: "moderation_needed",
        title: "Unrouted report needs review",
        body: `${reportId} — ${report.title} matched no verified organisation.`,
        reportId,
        category: "moderation",
        actionUrl: `/incidents/${reportId}`,
        dedupeKey: `moderation_needed:${reportId}:${moderator}`,
      });
    }
    return {
      routed: false,
      organisationId: null,
      organisationName: null,
      reason: `No verified ${CATEGORY_AUTHORITY_LABEL[report.category_slug] ?? "authority"} covers this location yet.`,
    };
  }

  const primary = candidates[0].org;
  const assignedAt = nowIso();

  run(
    `INSERT INTO authority_assignments (id, report_id, department_id, assigned_by, created_at)
     VALUES (?,?,?,NULL,?)
     ON CONFLICT(report_id) DO UPDATE SET department_id = excluded.department_id, created_at = excluded.created_at`,
    [newId("asg"), reportId, primary.id, assignedAt],
  );
  run(
    `UPDATE reports SET department_id = ?, routing_state = 'delivered', district = COALESCE(district, ?),
       updated_at = ? WHERE id = ?`,
    [primary.id, report.district ?? null, assignedAt, reportId],
  );

  const members = all<{ user_id: string }>(
    "SELECT user_id FROM department_members WHERE department_id = ? AND status = 'active'",
    [primary.id],
  );
  const officers = members.length
    ? members
    : all<{ user_id: string }>(
        "SELECT id AS user_id FROM users WHERE department_id = ? AND role = 'authority' AND deleted_at IS NULL",
        [primary.id],
      );
  const severity = get<{ severity: string }>("SELECT severity FROM reports WHERE id = ?", [reportId])?.severity;
  const urgent = severity === "critical" || severity === "high";
  for (const officer of officers) {
    createNotification({
      userId: officer.user_id,
      type: "report_assigned",
      title: urgent ? "Urgent report routed to your organisation" : "New report routed to your organisation",
      body: `${reportId} — ${report.title}. Priority: ${severity ?? "unknown"}.`,
      reportId,
      category: urgent ? "emergencies" : "reports",
      priority: severity === "critical" ? "critical" : urgent ? "high" : "normal",
      actionUrl: `/incidents/${reportId}`,
      organisationId: primary.id,
      dedupeKey: `report_routed:${reportId}:${officer.user_id}`,
    });
  }

  // Moderators see unscreened community reports; they never inherit the
  // authority feed, so this is a distinct moderation alert.
  for (const moderator of moderatorIds()) {
    createNotification({
      userId: moderator,
      type: "moderation_needed",
      title: "Report awaiting moderation",
      body: `${reportId} — ${report.title} needs a first review.`,
      reportId,
      category: "moderation",
      priority: "normal",
      actionUrl: `/incidents/${reportId}`,
      dedupeKey: `moderation_needed:${reportId}:${moderator}`,
    });
  }

  return {
    routed: true,
    organisationId: primary.id,
    organisationName: primary.name,
    reason: `Routed to ${primary.name}.`,
  };
}

export function manualAssign(reportId: string, departmentId: string, actorLabel: string) {
  const stamp = nowIso();
  run(
    `INSERT INTO authority_assignments (id, report_id, department_id, assigned_by, created_at)
     VALUES (?,?,?,?,?)
     ON CONFLICT(report_id) DO UPDATE SET department_id = excluded.department_id, assigned_by = excluded.assigned_by`,
    [newId("asg"), reportId, departmentId, actorLabel, stamp],
  );
  run("UPDATE reports SET department_id = ?, routing_state = 'delivered', updated_at = ? WHERE id = ?", [
    departmentId,
    stamp,
    reportId,
  ]);

  const report = get<{ title: string; severity: string }>(
    "SELECT title, severity FROM reports WHERE id = ?",
    [reportId],
  );
  const organisation = get<{ name: string }>("SELECT name FROM departments WHERE id = ?", [departmentId]);
  for (const member of organisationUserIds(departmentId)) {
    createNotification({
      userId: member,
      type: "report_assigned",
      title: "A report was assigned to your organisation",
      body: `${reportId} — ${report?.title ?? "Incident"}. Assigned by ${actorLabel}.`,
      reportId,
      category: report?.severity === "critical" ? "emergencies" : "reports",
      priority: report?.severity === "critical" ? "critical" : "high",
      actionUrl: `/incidents/${reportId}`,
      organisationId: departmentId,
      dedupeKey: `report_manual:${reportId}:${member}`,
    });
  }
  return { organisationName: organisation?.name ?? null };
}

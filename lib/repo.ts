import { all, get } from "./db";
import { haversineKm } from "./format";
import { VERIFIED_STATES } from "./constants";

/**
 * Read layer. Every public statistic is derived from SQL over `reports` or the
 * `verified_reports` view, never from hard-coded numbers.
 */

export type ReportListItem = {
  id: string;
  title: string;
  description: string;
  category_slug: string;
  severity: string;
  status: string;
  verification: string;
  lat: number;
  lng: number;
  address: string | null;
  neighborhood: string | null;
  extra_info: string | null;
  anonymous: number;
  is_demo: number;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  credibility: number;
  department_id: string | null;
  department_name: string | null;
  reporter_name: string | null;
  reporter_public: number | null;
  supporters: number;
  comment_count: number;
  cover_image: string | null;
  response_count: number;
  distance_km?: number;
};

const BASE_SELECT = `
  SELECT r.id, r.title, r.description, r.category_slug, r.severity, r.status,
         r.verification, r.lat, r.lng, r.address, r.neighborhood, r.extra_info, r.anonymous,
         r.is_demo, r.user_id, r.created_at, r.updated_at, r.resolved_at, r.credibility,
         r.department_id, d.name AS department_name,
         CASE WHEN r.anonymous = 1 THEN NULL ELSE u.name END AS reporter_name,
         u.public_name AS reporter_public,
         (SELECT COUNT(*) FROM report_support s WHERE s.report_id = r.id) AS supporters,
         (SELECT COUNT(*) FROM report_comments c WHERE c.report_id = r.id AND c.hidden = 0) AS comment_count,
         (SELECT i.url FROM report_images i WHERE i.report_id = r.id AND i.kind = 'evidence'
            ORDER BY i.created_at LIMIT 1) AS cover_image,
         (SELECT COUNT(*) FROM authority_responses ar WHERE ar.report_id = r.id) AS response_count
  FROM reports r
  LEFT JOIN users u ON u.id = r.user_id
  LEFT JOIN departments d ON d.id = r.department_id
`;

export type ReportFilters = {
  q?: string;
  category?: string;
  severity?: string;
  status?: string;
  verification?: string;
  neighborhood?: string;
  from?: string;
  to?: string;
  sort?: string;
  near?: { lat: number; lng: number };
  /** Viewport filter, so a map never asks for the whole country. */
  bbox?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  userId?: string;
  departmentId?: string;
  assignedOnly?: boolean;
  page?: number;
  pageSize?: number;
  verifiedOnly?: boolean;
};

function buildWhere(f: ReportFilters) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (f.q) {
    clauses.push("(r.title LIKE ? OR r.description LIKE ? OR r.address LIKE ? OR r.neighborhood LIKE ?)");
    const like = `%${f.q}%`;
    params.push(like, like, like, like);
  }
  if (f.category) {
    clauses.push("r.category_slug = ?");
    params.push(f.category);
  }
  if (f.severity) {
    clauses.push("r.severity = ?");
    params.push(f.severity);
  }
  if (f.status) {
    if (f.status === "unresolved") {
      clauses.push("r.status NOT IN ('resolved','rejected')");
    } else if (f.status === "resolved") {
      clauses.push("r.status = 'resolved'");
    } else {
      clauses.push("r.status = ?");
      params.push(f.status);
    }
  }
  if (f.verification) {
    clauses.push("r.verification = ?");
    params.push(f.verification);
  }
  if (f.verifiedOnly) {
    clauses.push("r.verification IN ('community_verified','officially_confirmed')");
  }
  if (f.neighborhood) {
    clauses.push("r.neighborhood = ?");
    params.push(f.neighborhood);
  }
  if (f.from) {
    clauses.push("r.created_at >= ?");
    params.push(f.from);
  }
  if (f.to) {
    clauses.push("r.created_at <= ?");
    params.push(f.to);
  }
  if (f.userId) {
    clauses.push("r.user_id = ?");
    params.push(f.userId);
  }
  if (f.departmentId) {
    clauses.push("r.department_id = ?");
    params.push(f.departmentId);
  }
  if (f.bbox) {
    clauses.push("r.lat BETWEEN ? AND ? AND r.lng BETWEEN ? AND ?");
    params.push(f.bbox.minLat, f.bbox.maxLat, f.bbox.minLng, f.bbox.maxLng);
  }
  if (f.near) {
    // Bounding box pre-filter; exact distance is applied in JS afterwards.
    const dLat = 0.35;
    const dLng = 0.35;
    clauses.push("r.lat BETWEEN ? AND ? AND r.lng BETWEEN ? AND ?");
    params.push(f.near.lat - dLat, f.near.lat + dLat, f.near.lng - dLng, f.near.lng + dLng);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

export function listReports(f: ReportFilters = {}): { items: ReportListItem[]; total: number } {
  const { where, params } = buildWhere(f);
  const sort = f.sort ?? "latest";
  let order = "r.created_at DESC";
  if (sort === "supported") order = "supporters DESC, r.created_at DESC";
  if (sort === "critical") order = "CASE r.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, r.created_at DESC";
  if (sort === "resolved") order = "r.resolved_at DESC";

  const page = Math.max(1, f.page ?? 1);
  // The map asks for a larger page than a paginated list does. Keeping the cap
  // here (rather than in each caller) is what previously limited the map to 60
  // points no matter what pageSize it requested.
  const pageSize = Math.min(500, Math.max(1, f.pageSize ?? 12));

  const rows = all<ReportListItem>(`${BASE_SELECT} ${where} ORDER BY ${order}`, params);
  let items = rows;

  if (f.near) {
    items = rows
      .map((r) => ({ ...r, distance_km: haversineKm(f.near!, { lat: r.lat, lng: r.lng }) }))
      .sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0));
  }

  const total = items.length;
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total };
}

export function reportDetail(id: string) {
  const report = get<ReportListItem>(`${BASE_SELECT} WHERE r.id = ?`, [id]);
  if (!report) return null;

  return {
    report,
    images: all<{ id: string; url: string; kind: string; caption: string | null; created_at: string }>(
      "SELECT id, url, kind, caption, created_at FROM report_images WHERE report_id = ? ORDER BY created_at",
      [id],
    ),
    comments: all<{
      id: string;
      body: string;
      created_at: string;
      author: string;
      role: string;
      hidden: number;
      user_id: string;
    }>(
      `SELECT c.id, c.body, c.created_at, u.name AS author, u.role, c.hidden, c.user_id
       FROM report_comments c LEFT JOIN users u ON u.id = c.user_id
       WHERE c.report_id = ? AND c.hidden = 0 ORDER BY c.created_at ASC`,
      [id],
    ),
    history: all<{
      id: string;
      from_status: string | null;
      to_status: string;
      note: string | null;
      actor_label: string | null;
      actor_role: string | null;
      created_at: string;
    }>(
      `SELECT id, from_status, to_status, note, actor_label, actor_role, created_at
       FROM report_status_history WHERE report_id = ? ORDER BY created_at ASC`,
      [id],
    ),
    verifications: all<{
      id: string;
      stage: string;
      decision: string;
      note: string | null;
      created_at: string;
      actor: string | null;
    }>(
      `SELECT v.id, v.stage, v.decision, v.note, v.created_at, u.name AS actor
       FROM report_verifications v LEFT JOIN users u ON u.id = v.actor_id
       WHERE v.report_id = ? ORDER BY v.created_at ASC`,
      [id],
    ),
    responses: all<{
      id: string;
      body: string;
      progress: number;
      eta: string | null;
      created_at: string;
      department: string;
      official: string;
    }>(
      `SELECT a.id, a.body, a.progress, a.eta, a.created_at, d.name AS department, u.name AS official
       FROM authority_responses a
       JOIN departments d ON d.id = a.department_id
       JOIN users u ON u.id = a.user_id
       WHERE a.report_id = ? ORDER BY a.created_at ASC`,
      [id],
    ),
    assignment: get<{ department_id: string; department: string; assigned_at: string }>(
      `SELECT aa.department_id, d.name AS department, aa.created_at AS assigned_at
       FROM authority_assignments aa JOIN departments d ON d.id = aa.department_id
       WHERE aa.report_id = ?`,
      [id],
    ),
    supporters: all<{ name: string; anonymous: number }>(
      `SELECT u.name, 0 AS anonymous FROM report_support s JOIN users u ON u.id = s.user_id
       WHERE s.report_id = ? ORDER BY s.created_at DESC LIMIT 8`,
      [id],
    ),
    follow_count: get<{ n: number }>("SELECT COUNT(*) AS n FROM user_follows WHERE report_id = ?", [id])?.n ?? 0,
  };
}

export function supportState(userId: string | null, reportId: string) {
  if (!userId) return { supported: false, following: false };
  const supported = !!get("SELECT 1 AS x FROM report_support WHERE report_id = ? AND user_id = ?", [reportId, userId]);
  const following = !!get("SELECT 1 AS x FROM user_follows WHERE report_id = ? AND user_id = ?", [reportId, userId]);
  return { supported, following };
}

export type StatsFilters = {
  category?: string;
  severity?: string;
  neighborhood?: string;
  from?: string;
  to?: string;
  status?: string;
};

function statWhere(f: StatsFilters) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (f.category) {
    clauses.push("category_slug = ?");
    params.push(f.category);
  }
  if (f.severity) {
    clauses.push("severity = ?");
    params.push(f.severity);
  }
  if (f.neighborhood) {
    clauses.push("neighborhood = ?");
    params.push(f.neighborhood);
  }
  if (f.from) {
    clauses.push("created_at >= ?");
    params.push(f.from);
  }
  if (f.to) {
    clauses.push("created_at <= ?");
    params.push(f.to);
  }
  if (f.status) {
    clauses.push("status = ?");
    params.push(f.status);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

export type Overview = {
  submitted: number;
  verified: number;
  resolved: number;
  unresolved: number;
  rejected: number;
  communities: number;
  avgResponseDays: number | null;
  resolutionRate: number;
  demoRows: number;
};

export function overview(f: StatsFilters = {}): Overview {
  const { where, params } = statWhere(f);
  const submitted = get<{ n: number }>(`SELECT COUNT(*) AS n FROM reports ${where}`, params)?.n ?? 0;
  const verified = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM verified_reports ${where}`,
    params,
  )?.n ?? 0;
  const resolved = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM verified_reports ${where ? `${where} AND` : "WHERE"} status = 'resolved'`,
    params,
  )?.n ?? 0;
  const rejected = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM reports ${where ? `${where} AND` : "WHERE"} status = 'rejected'`,
    params,
  )?.n ?? 0;
  const communities = get<{ n: number }>(
    "SELECT COUNT(DISTINCT neighborhood) AS n FROM reports WHERE neighborhood IS NOT NULL",
  )?.n ?? 0;
  const demoRows = get<{ n: number }>("SELECT COUNT(*) AS n FROM reports WHERE is_demo = 1")?.n ?? 0;

  const avg = get<{ d: number | null }>(
    `SELECT AVG((julianday(ar.created_at) - julianday(r.created_at))) AS d
     FROM authority_responses ar JOIN reports r ON r.id = ar.report_id`,
  )?.d;

  const unresolved = Math.max(submitted - resolved - rejected, 0);

  return {
    submitted,
    verified,
    resolved,
    unresolved,
    rejected,
    communities,
    avgResponseDays: avg === null || avg === undefined ? null : Math.round(avg * 10) / 10,
    resolutionRate: verified ? Math.round((resolved / verified) * 100) : 0,
    demoRows,
  };
}

export function byCategory(f: StatsFilters = {}) {
  const { where, params } = statWhere(f);
  return all<{ category_slug: string; total: number; verified: number; resolved: number }>(
    `SELECT category_slug,
            COUNT(*) AS total,
            SUM(CASE WHEN verification IN ('community_verified','officially_confirmed') THEN 1 ELSE 0 END) AS verified,
            SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved
     FROM reports ${where} GROUP BY category_slug ORDER BY total DESC`,
    params,
  );
}

export function byNeighborhood(f: StatsFilters = {}) {
  const { where, params } = statWhere(f);
  return all<{ neighborhood: string; total: number; verified: number; resolved: number; critical: number }>(
    `SELECT COALESCE(neighborhood,'Unassigned') AS neighborhood,
            COUNT(*) AS total,
            SUM(CASE WHEN verification IN ('community_verified','officially_confirmed') THEN 1 ELSE 0 END) AS verified,
            SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved,
            SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS critical
     FROM reports ${where} GROUP BY neighborhood ORDER BY total DESC`,
    params,
  );
}

export function bySeverity(f: StatsFilters = {}) {
  const { where, params } = statWhere(f);
  return all<{ severity: string; total: number; resolved: number }>(
    `SELECT severity, COUNT(*) AS total, SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved
     FROM reports ${where} GROUP BY severity`,
    params,
  );
}

export function monthlyTrend(f: StatsFilters = {}) {
  const { where, params } = statWhere(f);
  return all<{ month: string; submitted: number; verified: number; resolved: number }>(
    `SELECT substr(created_at, 1, 7) AS month,
            COUNT(*) AS submitted,
            SUM(CASE WHEN verification IN ('community_verified','officially_confirmed') THEN 1 ELSE 0 END) AS verified,
            SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved
     FROM reports ${where} GROUP BY month ORDER BY month ASC`,
    params,
  );
}

export function statusBreakdown(f: StatsFilters = {}) {
  const { where, params } = statWhere(f);
  return all<{ status: string; n: number }>(
    `SELECT status, COUNT(*) AS n FROM reports ${where} GROUP BY status`,
    params,
  );
}

export function responsePerformance() {
  return all<{ department: string; assigned: number; responded: number; avg_days: number | null; resolved: number }>(
    `SELECT d.name AS department,
            (SELECT COUNT(*) FROM reports r WHERE r.department_id = d.id) AS assigned,
            (SELECT COUNT(DISTINCT ar.report_id) FROM authority_responses ar WHERE ar.department_id = d.id) AS responded,
            (SELECT AVG(julianday(ar.created_at) - julianday(r.created_at))
               FROM authority_responses ar JOIN reports r ON r.id = ar.report_id
               WHERE ar.department_id = d.id) AS avg_days,
            (SELECT COUNT(*) FROM reports r WHERE r.department_id = d.id AND r.status = 'resolved') AS resolved
     FROM departments d ORDER BY assigned DESC`,
  );
}

export function recentReports(limit = 6) {
  return listReports({ pageSize: limit, sort: "latest" }).items;
}

export function mapPoints(f: ReportFilters = {}) {
  return listReports({ ...f, pageSize: 400 }).items.map((r) => ({
    id: r.id,
    title: r.title,
    lat: r.lat,
    lng: r.lng,
    severity: r.severity,
    status: r.status,
    verification: r.verification,
    category: r.category_slug,
    neighborhood: r.neighborhood,
    supporters: r.supporters,
  }));
}

export function myReports(userId: string) {
  return all<ReportListItem>(`${BASE_SELECT} WHERE r.user_id = ? ORDER BY r.created_at DESC`, [userId]);
}

export function myDashboard(userId: string) {
  const rows = myReports(userId);
  return {
    rows,
    totals: {
      total: rows.length,
      underReview: rows.filter((r) => r.status === "submitted" || r.status === "under_review").length,
      awaitingAuthority: rows.filter((r) => r.status === "community_verified" || r.status === "authority_notified").length,
      resolved: rows.filter((r) => r.status === "resolved").length,
      inProgress: rows.filter((r) => r.status === "in_progress").length,
    },
  };
}

export function authorityQueue(departmentId: string | null, isAdmin: boolean) {
  const rows = all<ReportListItem>(
    `${BASE_SELECT} ORDER BY r.created_at DESC`,
  ).filter((r) => isAdmin || r.department_id === departmentId);
  return {
    rows,
    assigned: rows.filter((r) => r.department_id),
    unassigned: rows.filter((r) => !r.department_id),
    critical: rows.filter((r) => r.severity === "critical" && r.status !== "resolved"),
    overdue: rows.filter(
      (r) =>
        r.response_count === 0 &&
        r.status !== "resolved" &&
        Date.now() - new Date(r.created_at).getTime() > 7 * 86_400_000,
    ),
    investigating: rows.filter((r) => r.status === "under_review"),
    resolved: rows.filter((r) => r.status === "resolved"),
  };
}

export function moderationQueue() {
  const pending = all<ReportListItem>(
    `${BASE_SELECT} WHERE r.verification IN ('unverified','pending_review') ORDER BY
     CASE r.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
     r.created_at ASC`,
  );
  const flagged = all<{
    id: string;
    target_type: string;
    target_id: string;
    reason: string;
    created_at: string;
    reporter: string | null;
    title: string | null;
  }>(
    `SELECT f.id, f.target_type, f.target_id, f.reason, f.created_at, u.name AS reporter, r.title
     FROM abuse_flags f
     LEFT JOIN users u ON u.id = f.reporter_id
     LEFT JOIN reports r ON r.id = f.target_id
     ORDER BY f.created_at DESC LIMIT 25`,
  );
  const duplicateCandidates = all<{ id: string; title: string; neighborhood: string | null; d: number }>(
    `SELECT a.id, a.title, a.neighborhood,
            (SELECT COUNT(*) FROM reports b
              WHERE b.id <> a.id AND b.category_slug = a.category_slug
                AND ABS(b.lat - a.lat) < 0.002 AND ABS(b.lng - a.lng) < 0.002) AS d
     FROM reports a WHERE a.status IN ('submitted','under_review') AND d > 0
     ORDER BY d DESC LIMIT 10`,
  );
  return { pending, flagged, duplicateCandidates };
}

export function notificationsFor(userId: string) {
  return all<{
    id: string;
    type: string;
    title: string;
    body: string | null;
    report_id: string | null;
    read_at: string | null;
    created_at: string;
  }>(
    "SELECT id, type, title, body, report_id, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
    [userId],
  );
}

export function adminUsers() {
  return all<{
    id: string;
    name: string;
    email: string;
    role: string;
    department_name: string | null;
    suspended: number;
    email_verified: number;
    created_at: string;
    report_count: number;
    is_demo: number;
  }>(
    `SELECT u.id, u.name, u.email, u.role, d.name AS department_name, u.suspended,
            u.email_verified, u.created_at, u.is_demo,
            (SELECT COUNT(*) FROM reports r WHERE r.user_id = u.id) AS report_count
     FROM users u LEFT JOIN departments d ON d.id = u.department_id
     WHERE u.deleted_at IS NULL ORDER BY u.created_at ASC`,
  );
}

export function auditLogs(limit = 60) {
  return all<{
    id: string;
    actor_label: string | null;
    actor_role: string | null;
    action: string;
    target_type: string | null;
    target_id: string | null;
    detail: string | null;
    created_at: string;
  }>(
    "SELECT id, actor_label, actor_role, action, target_type, target_id, detail, created_at FROM audit_logs ORDER BY created_at DESC LIMIT ?",
    [limit],
  );
}

export function departments() {
  return all<{ id: string; name: string; jurisdiction: string | null }>(
    "SELECT id, name, jurisdiction FROM departments ORDER BY name",
  );
}

export function verifiedCountForExport() {
  return VERIFIED_STATES;
}

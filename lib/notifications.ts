import { all, get, run } from "./db";
import { newId, nowIso } from "./crypto";

/**
 * Notification engine.
 *
 * Every alert is a real row addressed to a real user. Delivery is targeted by
 * role, organisation and assignment — a moderator never inherits an authority's
 * incident feed, and an officer only sees the reports routed to them.
 *
 * `dedupe_key` makes an insert idempotent: a replayed realtime event, a retried
 * form submission or a repeated routing pass cannot create a second copy.
 */

export type NotificationCategory =
  | "reports"
  | "emergencies"
  | "blood"
  | "authority"
  | "moderation"
  | "system";

export type NotificationPriority = "low" | "normal" | "high" | "critical";

export type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  report_id: string | null;
  blood_request_id: string | null;
  category: string | null;
  priority: string;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
};

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  reports: "Reports",
  emergencies: "Emergencies",
  blood: "Blood requests",
  authority: "Authority updates",
  moderation: "Moderation",
  system: "System alerts",
};

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  "reports",
  "emergencies",
  "blood",
  "authority",
  "moderation",
  "system",
];

/** Derive a category for legacy rows and for callers that only pass a type. */
export function categoryForType(type: string): NotificationCategory {
  if (type.startsWith("blood_")) return "blood";
  if (type.startsWith("moderation_") || type === "abuse_flag" || type === "content_flag") return "moderation";
  if (type.startsWith("hospital_link_") || type === "authority_application" || type.startsWith("authority_")) {
    return "authority";
  }
  if (type.startsWith("system_") || type === "account" || type === "security") return "system";
  return "reports";
}

export type CreateNotificationInput = {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  category?: NotificationCategory;
  priority?: NotificationPriority;
  reportId?: string | null;
  bloodRequestId?: string | null;
  actionUrl?: string | null;
  organisationId?: string | null;
  recipientRole?: string | null;
  dedupeKey?: string | null;
};

/** Insert one notification. Returns false when the dedupe key already existed. */
export function createNotification(input: CreateNotificationInput): boolean {
  const category = input.category ?? categoryForType(input.type);
  const id = newId("ntf");
  const stamp = nowIso();
  try {
    const result = run(
      `INSERT INTO notifications
        (id, user_id, type, title, body, report_id, read_at, created_at,
         category, priority, action_url, blood_request_id, organisation_id, recipient_role, dedupe_key)
       VALUES (?,?,?,?,?,?,NULL,?,?,?,?,?,?,?,?)`,
      [
        id,
        input.userId,
        input.type,
        input.title,
        input.body ?? null,
        input.reportId ?? null,
        stamp,
        category,
        input.priority ?? "normal",
        input.actionUrl ?? null,
        input.bloodRequestId ?? null,
        input.organisationId ?? null,
        input.recipientRole ?? null,
        input.dedupeKey ?? null,
      ],
    ) as { changes?: number } | undefined;
    // `INSERT OR IGNORE` semantics: a unique dedupe key yields zero changes.
    return (result?.changes ?? 1) > 0;
  } catch {
    // A duplicate dedupe key arrives here as a constraint error. That is a
    // successful no-op, not a failure worth surfacing.
    return false;
  }
}

export function notifyUsers(
  userIds: string[],
  input: Omit<CreateNotificationInput, "userId">,
): number {
  let sent = 0;
  for (const userId of new Set(userIds.filter(Boolean))) {
    if (createNotification({ ...input, userId })) sent += 1;
  }
  return sent;
}

export function adminIds(): string[] {
  return all<{ id: string }>(
    "SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL AND suspended = 0",
  ).map((row) => row.id);
}

export function moderatorIds(): string[] {
  return all<{ id: string }>(
    "SELECT id FROM users WHERE role = 'moderator' AND deleted_at IS NULL AND suspended = 0",
  ).map((row) => row.id);
}

/** Everyone who acts on an organisation: its members, plus its account holders. */
export function organisationUserIds(departmentId: string): string[] {
  const rows = all<{ user_id: string }>(
    `SELECT user_id FROM department_members WHERE department_id = ? AND status = 'active'
     UNION
     SELECT id AS user_id FROM users
      WHERE department_id = ? AND deleted_at IS NULL AND suspended = 0`,
    [departmentId, departmentId],
  );
  return [...new Set(rows.map((row) => row.user_id))];
}

export function organisationAdmins(departmentId: string): string[] {
  return all<{ user_id: string }>(
    `SELECT user_id FROM department_members
      WHERE department_id = ? AND member_role = 'org_admin' AND status = 'active'`,
    [departmentId],
  ).map((row) => row.user_id);
}

const SELECT_COLUMNS = `id, type, title, body, report_id, blood_request_id, category, priority,
  action_url, read_at, created_at`;

export type NotificationFilter = "all" | "unread" | NotificationCategory;

export function listNotifications(
  userId: string,
  options: { filter?: NotificationFilter; query?: string; limit?: number } = {},
): NotificationRow[] {
  const clauses = ["user_id = ?"];
  const params: unknown[] = [userId];
  const filter = options.filter ?? "all";
  if (filter === "unread") {
    clauses.push("read_at IS NULL");
  } else if (filter !== "all") {
    clauses.push("COALESCE(category, 'reports') = ?");
    params.push(filter);
  }
  const query = options.query?.trim();
  if (query) {
    clauses.push("(title LIKE ? OR body LIKE ? OR type LIKE ?)");
    const like = `%${query}%`;
    params.push(like, like, like);
  }
  const limit = Math.min(200, Math.max(1, options.limit ?? 60));
  params.push(limit);
  return all<NotificationRow>(
    `SELECT ${SELECT_COLUMNS} FROM notifications
      WHERE ${clauses.join(" AND ")}
      ORDER BY created_at DESC, rowid DESC
      LIMIT ?`,
    params,
  );
}

export function unreadNotificationCount(userId: string): number {
  return (
    get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL",
      [userId],
    )?.n ?? 0
  );
}

export function unreadCountsByCategory(userId: string): Record<string, number> {
  const rows = all<{ category: string | null; n: number }>(
    `SELECT COALESCE(category, 'reports') AS category, COUNT(*) AS n
       FROM notifications WHERE user_id = ? AND read_at IS NULL
      GROUP BY COALESCE(category, 'reports')`,
    [userId],
  );
  return Object.fromEntries(rows.map((row) => [row.category ?? "reports", row.n]));
}

export function markNotificationsRead(userId: string, ids: string[]): number {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 200);
  if (!unique.length) return 0;
  const marks = unique.map(() => "?").join(",");
  run(
    `UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND id IN (${marks})`,
    [nowIso(), userId, ...unique],
  );
  return unreadNotificationCount(userId);
}

export function markAllNotificationsRead(userId: string): number {
  run("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL", [
    nowIso(),
    userId,
  ]);
  return 0;
}

/** Cheap change token used by the realtime stream to detect new rows. */
export function notificationSignature(userId: string) {
  const row = get<{ n: number; latest: string | null }>(
    "SELECT COUNT(*) AS n, MAX(created_at) AS latest FROM notifications WHERE user_id = ?",
    [userId],
  );
  return {
    total: row?.n ?? 0,
    latest: row?.latest ?? null,
    unread: unreadNotificationCount(userId),
  };
}

export function notificationHrefFor(row: Pick<NotificationRow, "action_url" | "report_id" | "blood_request_id" | "type">): string | null {
  if (row.action_url) return row.action_url;
  if (row.blood_request_id) return `/blood/${row.blood_request_id}`;
  if (row.report_id) return `/incidents/${row.report_id}`;
  if (row.type === "authority_application") return "/admin/authorities";
  if (row.type === "hospital_link_request") return "/admin/hospitals";
  if (row.type.startsWith("hospital_link_")) return "/authority/hospitals";
  return null;
}

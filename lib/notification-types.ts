export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  report_id: string | null;
  blood_request_id?: string | null;
  category?: string | null;
  priority?: string | null;
  action_url?: string | null;
  read_at: string | null;
  created_at: string;
};

export const NOTIFICATION_ICONS: Record<string, { glyph: string; color: string }> = {
  report_submitted: { glyph: "↑", color: "#36D9FF" },
  report_routed: { glyph: "↗", color: "#36D9FF" },
  report_nearby: { glyph: "◎", color: "#36D9FF" },
  report_awaiting_authority: { glyph: "⚑", color: "#F5B94B" },
  report_assigned_to_you: { glyph: "◆", color: "#F5B94B" },
  report_assigned: { glyph: "◆", color: "#F5B94B" },
  report_urgent: { glyph: "!", color: "#F16D78" },
  routing_failed: { glyph: "⚑", color: "#F16D78" },
  verification: { glyph: "✓", color: "#43D6A0" },
  comment: { glyph: "◌", color: "#36D9FF" },
  support_milestone: { glyph: "♥", color: "#F16D78" },
  authority_response: { glyph: "◆", color: "#F5B94B" },
  status_change: { glyph: "→", color: "#F5B94B" },
  resolution: { glyph: "✓", color: "#43D6A0" },
  authority_application: { glyph: "▣", color: "#F5B94B" },
  officer_assigned: { glyph: "◆", color: "#F5B94B" },
  moderation_needed: { glyph: "⚖", color: "#F5B94B" },
  moderation_report_flagged: { glyph: "⚖", color: "#F5B94B" },
  blood_request: { glyph: "♥", color: "#F16D78" },
  blood_request_created: { glyph: "♥", color: "#F16D78" },
  blood_request_verified: { glyph: "✓", color: "#43D6A0" },
  blood_request_urgent: { glyph: "!", color: "#F16D78" },
  blood_request_fulfilled: { glyph: "✓", color: "#43D6A0" },
  blood_donor_match: { glyph: "♥", color: "#F16D78" },
  blood_donor_interest: { glyph: "◆", color: "#F5B94B" },
  blood_request_flagged: { glyph: "⚑", color: "#F5B94B" },
  hospital_link_request: { glyph: "▤", color: "#F5B94B" },
  hospital_link_approved: { glyph: "✓", color: "#43D6A0" },
  hospital_link_rejected: { glyph: "×", color: "#F16D78" },
  hospital_link_revoked: { glyph: "◍", color: "#929FB2" },
  system_alert: { glyph: "◍", color: "#929FB2" },
  account: { glyph: "◍", color: "#929FB2" },
};

export function notificationIcon(type: string) {
  return NOTIFICATION_ICONS[type] ?? NOTIFICATION_ICONS.account;
}

export const CATEGORY_LABELS: Record<string, string> = {
  reports: "Reports",
  emergencies: "Emergencies",
  blood: "Blood requests",
  authority: "Authority updates",
  moderation: "Moderation",
  system: "System alerts",
};

export type NotificationCategory = keyof typeof CATEGORY_LABELS;

export const CATEGORY_ORDER: NotificationCategory[] = [
  "reports",
  "emergencies",
  "blood",
  "authority",
  "moderation",
  "system",
];

export function notificationCategory(item: Pick<NotificationItem, "type" | "category">): NotificationCategory {
  const explicit = item.category ?? undefined;
  if (explicit && CATEGORY_ORDER.includes(explicit as NotificationCategory)) {
    return explicit as NotificationCategory;
  }
  const type = item.type;
  if (type.startsWith("blood_")) return "blood";
  if (type.startsWith("moderation_") || type === "abuse_flag") return "moderation";
  if (type.startsWith("authority_") || type.startsWith("hospital_link_") || type === "officer_assigned") {
    return "authority";
  }
  if (type.startsWith("system_") || type === "account") return "system";
  return "reports";
}

export function priorityColor(priority?: string | null): string {
  switch (priority) {
    case "critical":
      return "#F16D78";
    case "high":
      return "#F5B94B";
    case "low":
      return "#929FB2";
    default:
      return "#36D9FF";
  }
}

/** Persistent notifications may store an explicit deep link; otherwise map by type. */
export function notificationHref(
  item: Pick<NotificationItem, "type" | "report_id"> &
    Partial<Pick<NotificationItem, "action_url" | "blood_request_id">>,
): string | null {
  if (item.action_url) return item.action_url;
  if (item.blood_request_id) return `/blood/${item.blood_request_id}`;
  if (item.report_id) return `/incidents/${item.report_id}`;
  if (item.type === "authority_application") return "/admin/authorities";
  if (item.type === "hospital_link_request") return "/admin/hospitals";
  if (item.type.startsWith("hospital_link_")) return "/authority/hospitals";
  if (item.type === "report_assigned_to_you") return "/authority";
  if (item.type === "moderation_needed") return "/moderation";
  return null;
}

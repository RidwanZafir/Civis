export const BRAND = {
  name: "CIVIS",
  tagline: "See what's broken. Make it better.",
  mission:
    "Turning community observations into safer, better public spaces.",
};

export const CITY = {
  name: "Kolkata",
  center: { lat: 22.5726, lng: 88.3639 },
};

export type CategorySlug =
  | "streetlights"
  | "crossings"
  | "roads"
  | "sidewalks"
  | "drainage"
  | "electrical"
  | "facilities"
  | "other";

export const CATEGORIES: {
  slug: CategorySlug;
  label: string;
  description: string;
  color: string;
  examples: string;
}[] = [
  {
    slug: "streetlights",
    label: "Streetlights",
    description: "Dark stretches, flickering lamps, broken poles.",
    color: "#F5B94B",
    examples: "Unlit stretch, broken lamp post, damaged luminaire",
  },
  {
    slug: "crossings",
    label: "Pedestrian crossings",
    description: "Faded zebra lines, missing signals, unsafe junctions.",
    color: "#36D9FF",
    examples: "Worn crossing paint, non-working signal, blocked footpath",
  },
  {
    slug: "roads",
    label: "Roads & potholes",
    description: "Potholes, broken asphalt, sunken utility cuts.",
    color: "#F16D78",
    examples: "Deep pothole, crumbling carriageway, open utility trench",
  },
  {
    slug: "sidewalks",
    label: "Sidewalks",
    description: "Broken paving, missing slabs, obstructions.",
    color: "#43D6A0",
    examples: "Cracked slabs, missing kerb, encroached footpath",
  },
  {
    slug: "drainage",
    label: "Drainage & flooding",
    description: "Blocked drains, standing water, overflowing sewers.",
    color: "#36D9FF",
    examples: "Choked gully, waterlogged lane, open manhole",
  },
  {
    slug: "electrical",
    label: "Electrical hazards",
    description: "Exposed wiring, damaged boxes, illegal connections.",
    color: "#F16D78",
    examples: "Exposed live wire, leaning pole, sparking junction box",
  },
  {
    slug: "facilities",
    label: "Public facilities",
    description: "Unsafe parks, toilets, bus stops and public buildings.",
    color: "#F5B94B",
    examples: "Broken park equipment, unsafe bus shelter, unusable toilet",
  },
  {
    slug: "other",
    label: "Other infrastructure",
    description: "Anything else that makes public space unsafe.",
    color: "#929FB2",
    examples: "Fallen signage, damaged railing, unsafe construction site",
  },
];

export function category(slug: string) {
  return CATEGORIES.find((c) => c.slug === slug) ?? CATEGORIES[7];
}

export type Severity = "low" | "medium" | "high" | "critical";

export const SEVERITIES: {
  value: Severity;
  label: string;
  color: string;
  guidance: string;
}[] = [
  {
    value: "low",
    label: "Low",
    color: "#43D6A0",
    guidance: "Inconvenient but not dangerous. Cosmetic damage, minor wear.",
  },
  {
    value: "medium",
    label: "Medium",
    color: "#36D9FF",
    guidance: "Needs attention soon. Trip hazards, poor visibility at night.",
  },
  {
    value: "high",
    label: "High",
    color: "#F5B94B",
    guidance: "A real risk of injury, especially for children or the elderly.",
  },
  {
    value: "critical",
    label: "Critical",
    color: "#F16D78",
    guidance: "Immediate danger to life. Exposed live wires, open deep pits.",
  },
];

export function severityMeta(value: string) {
  return SEVERITIES.find((s) => s.value === value) ?? SEVERITIES[0];
}

export type Status =
  | "submitted"
  | "under_review"
  | "community_verified"
  | "authority_notified"
  | "in_progress"
  | "resolved"
  | "rejected";

export const STATUS_FLOW: { value: Status; label: string; color: string }[] = [
  { value: "submitted", label: "Submitted", color: "#929FB2" },
  { value: "under_review", label: "Under review", color: "#36D9FF" },
  { value: "community_verified", label: "Community verified", color: "#43D6A0" },
  { value: "authority_notified", label: "Authority notified", color: "#F5B94B" },
  { value: "in_progress", label: "In progress", color: "#F5B94B" },
  { value: "resolved", label: "Resolved", color: "#43D6A0" },
  { value: "rejected", label: "Rejected", color: "#F16D78" },
];

export function statusMeta(value: string) {
  return STATUS_FLOW.find((s) => s.value === value) ?? STATUS_FLOW[0];
}

export type Verification =
  | "unverified"
  | "pending_review"
  | "community_verified"
  | "officially_confirmed"
  | "rejected";

export const VERIFICATIONS: {
  value: Verification;
  label: string;
  color: string;
  description: string;
}[] = [
  {
    value: "unverified",
    label: "Community submitted",
    color: "#929FB2",
    description: "Freshly submitted. Not yet reviewed or confirmed by anyone.",
  },
  {
    value: "pending_review",
    label: "Under review",
    color: "#36D9FF",
    description: "A moderator is checking the evidence, location and duplicates.",
  },
  {
    value: "community_verified",
    label: "Community verified",
    color: "#43D6A0",
    description:
      "Independent neighbours confirmed the problem exists. Counted separately from official confirmation.",
  },
  {
    value: "officially_confirmed",
    label: "Officially confirmed",
    color: "#36D9FF",
    description:
      "A responsible authority account has accepted and acknowledged this incident.",
  },
  {
    value: "rejected",
    label: "Rejected",
    color: "#F16D78",
    description: "Reviewers could not confirm the report as submitted.",
  },
];

export function verificationMeta(value: string) {
  return VERIFICATIONS.find((v) => v.value === value) ?? VERIFICATIONS[0];
}

export const VERIFIED_STATES: Verification[] = [
  "community_verified",
  "officially_confirmed",
];

export const ROLES = ["citizen", "moderator", "authority", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  citizen: "Citizen",
  moderator: "Moderator",
  authority: "Authority",
  admin: "Administrator",
};

export const NEIGHBORHOODS = [
  "Salt Lake",
  "Ballygunge",
  "Garia",
  "Behala",
  "Howrah",
  "Park Street",
  "Shyambazar",
  "Jadavpur",
];

export const FEED_SORTS = [
  { value: "latest", label: "Latest" },
  { value: "supported", label: "Most supported" },
  { value: "critical", label: "Critical issues" },
  { value: "unresolved", label: "Unresolved" },
  { value: "resolved", label: "Recently resolved" },
  { value: "near", label: "Near me" },
];

export const UPLOAD = {
  maxBytes: 8 * 1024 * 1024,
  maxFiles: 6,
  types: ["image/jpeg", "image/png", "image/webp"],
};

/** Demo-only configuration, surfaced honestly in the UI. */
export const DEMO_MODE = {
  emailDelivery: false,
  reason:
    "No email provider is connected, so verification and reset links are shown in-app instead of emailed.",
};

export const RATE_LIMITS = {
  signIn: { max: 10, windowMs: 60_000 },
  write: { max: 30, windowMs: 60_000 },
  upload: { max: 20, windowMs: 60_000 },
};

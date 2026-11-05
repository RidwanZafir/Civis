/**
 * Blood component compatibility.
 *
 * These tables describe which donor groups can supply which component to a
 * recipient. They are reference data for matching alerts only. No result here
 * certifies that a person may donate: screening, cross-matching and eligibility
 * are decided by the hospital or licensed blood bank.
 */

export const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export const COMPONENTS = [
  { value: "whole_blood", label: "Whole blood" },
  { value: "red_cells", label: "Red blood cells" },
  { value: "platelets", label: "Platelets" },
  { value: "plasma", label: "Plasma" },
  { value: "other", label: "Other (specify)" },
] as const;

export type BloodComponent = (typeof COMPONENTS)[number]["value"];

export const URGENCIES = [
  { value: "critical", label: "Critical — needed immediately", color: "#F16D78" },
  { value: "urgent", label: "Urgent — within 6 hours", color: "#F5B94B" },
  { value: "high", label: "High — within 24 hours", color: "#36D9FF" },
  { value: "planned", label: "Planned — future requirement", color: "#929FB2" },
] as const;

export type Urgency = (typeof URGENCIES)[number]["value"];

export const REQUEST_STATUSES = [
  "pending_verification",
  "verified",
  "active",
  "partially_fulfilled",
  "fulfilled",
  "expired",
  "cancelled",
  "rejected",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const STATUS_LABEL: Record<RequestStatus, string> = {
  pending_verification: "Pending verification",
  verified: "Verified",
  active: "Active",
  partially_fulfilled: "Partially fulfilled",
  fulfilled: "Fulfilled",
  expired: "Expired",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

export const STATUS_COLOR: Record<RequestStatus, string> = {
  pending_verification: "#F5B94B",
  verified: "#43D6A0",
  active: "#43D6A0",
  partially_fulfilled: "#36D9FF",
  fulfilled: "#43D6A0",
  expired: "#929FB2",
  cancelled: "#929FB2",
  rejected: "#F16D78",
};

/** Red-cell and whole-blood compatibility: recipient → acceptable donor groups. */
const RECIPIENT_ACCEPTS: Record<BloodGroup, BloodGroup[]> = {
  "O-": ["O-"],
  "O+": ["O-", "O+"],
  "A-": ["O-", "A-"],
  "A+": ["O-", "O+", "A-", "A+"],
  "B-": ["O-", "B-"],
  "B+": ["O-", "O+", "B-", "B+"],
  "AB-": ["O-", "A-", "B-", "AB-"],
  "AB+": ["O-", "O+", "A-", "A+", "B-", "B+", "AB-", "AB+"],
};

/** Plasma is the reverse: AB plasma is usable by everyone, O plasma only by O. */
const PLASMA_RECIPIENT_ACCEPTS: Record<BloodGroup, BloodGroup[]> = {
  "O-": ["O-", "O+"],
  "O+": ["O-", "O+"],
  "A-": ["A-", "A+", "AB-", "AB+"],
  "A+": ["A-", "A+", "AB-", "AB+"],
  "B-": ["B-", "B+", "AB-", "AB+"],
  "B+": ["B-", "B+", "AB-", "AB+"],
  "AB-": ["AB-", "AB+"],
  "AB+": ["AB-", "AB+"],
};

function rhInsensitive(groups: BloodGroup[]): BloodGroup[] {
  return groups;
}

/**
 * Donor groups whose component may be compatible with the recipient.
 * Platelets follow ABO/Rh like red cells in this reference table, but platelet
 * matching is frequently modified by the blood bank.
 */
export function compatibleDonorGroups(
  recipient: BloodGroup,
  component: BloodComponent,
): BloodGroup[] {
  if (component === "plasma") return PLASMA_RECIPIENT_ACCEPTS[recipient];
  if (component === "platelets") return rhInsensitive(RECIPIENT_ACCEPTS[recipient]);
  return RECIPIENT_ACCEPTS[recipient];
}

/** Whether an alert should reach a donor group for this request. */
export function donorMatches(
  donorGroup: string,
  recipientGroup: string,
  component: BloodComponent,
): boolean {
  if (!BLOOD_GROUPS.includes(donorGroup as BloodGroup)) return false;
  if (!BLOOD_GROUPS.includes(recipientGroup as BloodGroup)) return false;
  return compatibleDonorGroups(recipientGroup as BloodGroup, component).includes(donorGroup as BloodGroup);
}

export function urgencyMeta(value: string) {
  return URGENCIES.find((entry) => entry.value === value) ?? URGENCIES[3];
}

export function componentLabel(value: string) {
  return COMPONENTS.find((entry) => entry.value === value)?.label ?? "Blood component";
}

export const BLOOD_SAFETY_NOTICE =
  "All donations and transfusions must be coordinated through a qualified hospital or licensed blood bank. Donor eligibility, blood screening and compatibility must be confirmed by medical professionals. CIVIS only connects people; it does not certify a donor, a request or a match.";

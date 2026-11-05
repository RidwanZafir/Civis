/**
 * Client-safe telephone rules. Kept separate from `lib/hospitals/registry.ts`
 * because that module opens the SQLite database and must never be bundled into
 * a browser component.
 */

export type DialableContact = { phone: string; phoneE164: string | null };

/**
 * Returns a `tel:` target only when the number resolves to a valid Bangladesh
 * pattern. Anything else returns null so the UI can say "no dialable number"
 * instead of rendering a link that cannot connect.
 */
export function telHref(contact: DialableContact): string | null {
  if (contact.phoneE164 && /^\+8801\d{9}$/.test(contact.phoneE164)) return `tel:${contact.phoneE164}`;
  return telFromString(contact.phone);
}

export function telFromString(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (/^01\d{9}$/.test(digits)) return `tel:+88${digits}`;
  if (/^8801\d{9}$/.test(digits)) return `tel:+${digits}`;
  if (/^1\d{9}$/.test(digits)) return `tel:+880${digits}`;
  // Landlines: 0 + area code + number, 9-10 digits total after the trunk 0.
  if (/^0\d{8,9}$/.test(digits)) return `tel:+880${digits.slice(1)}`;
  return null;
}

/** Human-readable grouping label for a contact row. */
export const CONTACT_GROUP_LABELS: Record<string, string> = {
  general: "Reception and general enquiries",
  emergency: "Emergency department",
  department: "Medical departments",
  diagnostic: "Diagnostic and support services",
  support: "Support services",
};

import { randomBytes } from "node:crypto";

/** Short prefixed identifier, matching the style used by the app's lib/crypto. */
export function newId(prefix = "id") {
  return `${prefix}-${randomBytes(9).toString("base64url").replace(/[-_]/g, "").slice(0, 12)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

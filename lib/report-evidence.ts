/** Shared constraints for browser validation and server upload verification. */
export const EVIDENCE = {
  maxFiles: 6,
  imageMaxBytes: 8 * 1024 * 1024,
  videoMaxBytes: 25 * 1024 * 1024,
  types: ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime"],
} as const;

export function evidenceValidation(file: { type: string; size: number; name: string }): string | null {
  if (!(EVIDENCE.types as readonly string[]).includes(file.type)) {
    return `${file.name}: use a JPEG, PNG, WebP, MP4, WebM or MOV file.`;
  }
  if (file.size === 0) return `${file.name}: this file is empty.`;
  const video = file.type.startsWith("video/");
  if (file.size > (video ? EVIDENCE.videoMaxBytes : EVIDENCE.imageMaxBytes)) {
    return `${file.name}: ${video ? "videos must be 25 MB" : "images must be 8 MB"} or smaller.`;
  }
  return null;
}

export function evidenceSignatureMatches(type: string, bytes: Uint8Array): boolean {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => bytes[i] === v);
  if (type === "image/webp") return bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
  if (type === "video/webm") {
    // Require the EBML header and its WebM document type, rather than accepting arbitrary Matroska files.
    return bytes.length >= 16 && [0x1a, 0x45, 0xdf, 0xa3].every((v, i) => bytes[i] === v) && ascii(0, Math.min(bytes.length, 4096)).includes("webm");
  }
  if (type === "video/mp4" || type === "video/quicktime") {
    if (bytes.length < 16 || ascii(4, 8) !== "ftyp") return false;
    const majorBrand = ascii(8, 12);
    if (type === "video/quicktime") return majorBrand === "qt  ";
    return ["isom", "iso2", "iso4", "iso5", "iso6", "mp41", "mp42", "avc1", "M4V ", "MSNV", "dash"].includes(majorBrand);
  }
  return false;
}

export type EvidenceState = { status: "preparing" | "uploading" | "success" | "error"; url: string };

export function evidenceReady(attachments: EvidenceState[]): boolean {
  return attachments.every((item) => item.status === "success" && !!item.url);
}

/** Validate fields of completed steps, never a destination step the user has not seen yet. */
export function reportStepErrors(target: number, values: {
  category: string;
  attachments: EvidenceState[];
  location: unknown;
  title: string;
  description: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (target > 0 && !values.category) errors.category = "Choose the category that fits best.";
  if (target > 1 && !evidenceReady(values.attachments)) errors.images = "Wait for uploads to finish. Retry or remove any failed attachment.";
  if (target > 2 && !values.location) errors.location = "Pick the exact location on the map.";
  if (target > 3) {
    if (values.title.trim().length < 8) errors.title = "Give the issue a clear, specific title (8+ characters).";
    if (values.description.trim().length < 30) errors.description = "Describe what you saw in at least 30 characters.";
  }
  return errors;
}

export function isVideoEvidence(url: string): boolean {
  return /\.(?:mp4|webm|mov)(?:\?|$)/i.test(url);
}

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { authorize } from "@/lib/auth";
import { clientKey, fail, rateLimit, tooMany } from "@/lib/http";
import { RATE_LIMITS } from "@/lib/constants";
import { EVIDENCE, evidenceSignatureMatches, evidenceValidation } from "@/lib/report-evidence";
import { UPLOAD_DIR, UPLOAD_EXTENSIONS } from "@/lib/upload-server";

export async function POST(req: Request) {
  const auth = await authorize();
  if (!auth.ok) return fail(auth.message, auth.status);

  const limit = rateLimit(clientKey(req, `upload:${auth.user.id}`), RATE_LIMITS.upload.max, RATE_LIMITS.upload.windowMs);
  if (!limit.allowed) return tooMany(limit.retryAfterMs);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Upload must be multipart form data.", 400);
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) return fail("No files received.", 400);
  if (files.length > EVIDENCE.maxFiles) return fail(`Up to ${EVIDENCE.maxFiles} attachments per upload.`, 422);

  const validated: { file: File; buffer: Buffer }[] = [];
  // Validate the whole batch before writing so a bad second file cannot leave a partial upload.
  for (const file of files) {
    const validation = evidenceValidation(file);
    if (validation) return fail(validation, !(EVIDENCE.types as readonly string[]).includes(file.type) ? 415 : file.size === 0 ? 422 : 413);
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!evidenceSignatureMatches(file.type, buffer)) return fail(`${file.name}: the contents do not match its declared file type.`, 415);
    validated.push({ file, buffer });
  }
  const urls: string[] = [];
  const created: string[] = [];
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    for (const { file, buffer } of validated) {
      const name = `${randomUUID()}.${UPLOAD_EXTENSIONS[file.type]}`;
      const filename = path.join(UPLOAD_DIR, name);
      const metadata = `${filename}.json`;
      created.push(filename, metadata);
      await fs.writeFile(filename, buffer, { flag: "wx" });
      await fs.writeFile(metadata, JSON.stringify({ userId: auth.user.id, name: file.name, size: file.size, type: file.type, uploadedAt: new Date().toISOString() }), { flag: "wx" });
      urls.push(`/api/media/${name}`);
    }
  } catch {
    await Promise.allSettled(created.map((filename) => fs.unlink(filename)));
    return fail("Could not save your attachments. Please retry.", 500);
  }

  return Response.json({ urls }, { status: 201 });
}

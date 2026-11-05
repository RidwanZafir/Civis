import { z } from "zod";
import { get, run } from "@/lib/db";
import { newId, nowIso } from "@/lib/crypto";
import { audit, authorize } from "@/lib/auth";
import { clientKey, fail, rateLimit, readJson, tooMany } from "@/lib/http";

const schema = z.object({
  reason: z.string().trim().min(5, "Tell us what is wrong").max(400),
  targetType: z.enum(["report", "comment"]).optional(),
  targetId: z.string().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize();
  if (!auth.ok) return fail(auth.message, auth.status);

  const limit = rateLimit(clientKey(req, `flag:${auth.user.id}`), 6, 60_000);
  if (!limit.allowed) return tooMany(limit.retryAfterMs);

  const parsed = schema.safeParse(await readJson<unknown>(req));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid flag", 422);

  const targetType = parsed.data.targetType ?? "report";
  const targetId = targetType === "comment" ? parsed.data.targetId : id;
  if (!targetId) return fail("Target missing.", 400);
  if (targetType === "report" && !get("SELECT 1 AS x FROM reports WHERE id = ?", [id])) {
    return fail("Report not found.", 404);
  }

  run(
    "INSERT INTO abuse_flags (id, target_type, target_id, reporter_id, reason, created_at) VALUES (?,?,?,?,?,?)",
    [newId("flag"), targetType, targetId, auth.user.id, parsed.data.reason, nowIso()],
  );
  audit({ id: auth.user.id, role: auth.user.role, name: auth.user.name }, "content.flagged", {
    type: targetType,
    id: targetId,
  });

  return Response.json({ ok: true, message: "Thanks — a moderator will review this." }, { status: 201 });
}

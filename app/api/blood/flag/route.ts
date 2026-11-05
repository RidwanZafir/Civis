import { z } from "zod";
import { authorize } from "@/lib/auth";
import { clientKey, fail, rateLimit, readJson, tooMany } from "@/lib/http";
import { BloodError, flagBloodRequest } from "@/lib/blood/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  id: z.string().min(1),
  reason: z.string().trim().min(4).max(300),
});

export async function POST(request: Request) {
  const auth = await authorize();
  if (!auth.ok) return fail(auth.message, auth.status);

  const limit = rateLimit(clientKey(request, "blood-flag"), 5, 10 * 60_000);
  if (!limit.allowed) return tooMany(limit.retryAfterMs);

  const parsed = schema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) return fail("Describe why this request looks suspicious.", 422);

  try {
    flagBloodRequest(auth.user, parsed.data.id, parsed.data.reason);
    return Response.json({
      ok: true,
      message: "Reported. The moderation team has been notified and the request stays visible meanwhile.",
    });
  } catch (error) {
    if (error instanceof BloodError) return fail(error.message, error.status);
    return fail("That report could not be recorded.", 500);
  }
}

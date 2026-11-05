import { z } from "zod";
import { authorize } from "@/lib/auth";
import { fail, readJson } from "@/lib/http";
import { BloodError, bloodStats, moderationBloodQueue, reviewBloodRequest } from "@/lib/blood/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await authorize(["moderator", "admin"]);
  if (!auth.ok) return fail(auth.message, auth.status);
  try {
    return Response.json(
      { ...moderationBloodQueue(), stats: bloodStats() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return fail("The blood moderation queue could not be loaded.", 500);
  }
}

const schema = z.object({
  id: z.string().min(1),
  action: z.enum(["verify", "reject", "request_info", "flag"]),
  notes: z.string().trim().max(600).optional().nullable(),
});

export async function POST(request: Request) {
  const auth = await authorize(["moderator", "admin"]);
  if (!auth.ok) return fail(auth.message, auth.status);

  const parsed = schema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) return fail("Invalid moderation action.", 422);
  if (parsed.data.action === "reject" && !parsed.data.notes?.trim()) {
    return fail("Record a reason when rejecting a blood request.", 422);
  }

  try {
    const result = reviewBloodRequest(auth.user, parsed.data.id, parsed.data.action, parsed.data.notes ?? null);
    return Response.json({
      ...result,
      ok: true,
      message:
        result.status === "verified"
          ? `Verified. ${result.donorsNotified ?? 0} matching opted-in donor${result.donorsNotified === 1 ? "" : "s"} alerted.`
          : result.flagged
            ? "Flagged for the moderation team."
            : "Moderation action recorded.",
    });
  } catch (error) {
    if (error instanceof BloodError) return fail(error.message, error.status);
    return fail("That moderation action could not be applied.", 500);
  }
}

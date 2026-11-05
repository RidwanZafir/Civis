import { z } from "zod";
import { authorize } from "@/lib/auth";
import { fail, readJson } from "@/lib/http";
import { BLOOD_GROUPS } from "@/lib/blood/compat";
import { BloodError, donorProfile, upsertDonor } from "@/lib/blood/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await authorize();
  if (!auth.ok) return fail(auth.message, auth.status);
  return Response.json(
    { donor: donorProfile(auth.user.id) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

const schema = z.object({
  fullName: z.string().trim().min(1).max(120),
  bloodGroup: z.enum(BLOOD_GROUPS),
  city: z.string().trim().min(1).max(80),
  district: z.string().trim().min(1).max(80),
  preferredArea: z.string().trim().max(120).optional().nullable(),
  contactPhone: z.string().trim().max(20).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  locationPrivacy: z.enum(["area", "exact"]).optional(),
  availability: z.enum(["available", "temporarily_unavailable", "break", "not_eligible"]).optional(),
  notificationConsent: z.boolean().optional(),
  contactMethod: z.enum(["in_app", "phone"]).optional(),
  previousDonationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  note: z.string().trim().max(400).optional().nullable(),
  active: z.boolean().optional(),
});

export async function PUT(request: Request) {
  const auth = await authorize();
  if (!auth.ok) return fail(auth.message, auth.status);
  if (auth.user.role === "authority") {
    return fail("Authority accounts cannot register as donors. Use a personal citizen account.", 403);
  }

  const parsed = schema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check your donor details.", 422);
  }

  try {
    const result = upsertDonor(auth.user, parsed.data);
    return Response.json({
      ...result,
      donor: donorProfile(auth.user.id),
      message: result.created
        ? "You are registered as a voluntary donor. CIVIS will only alert you for compatible requests inside your chosen area, and only while your profile is available and consented."
        : "Your donor profile was updated.",
    });
  } catch (error) {
    if (error instanceof BloodError) return fail(error.message, error.status);
    return fail("Your donor profile could not be saved.", 500);
  }
}

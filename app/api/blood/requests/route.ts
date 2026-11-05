import { z } from "zod";
import { authorize, getCurrentUser } from "@/lib/auth";
import { clientKey, fail, rateLimit, readJson, tooMany } from "@/lib/http";
import { BLOOD_SAFETY_NOTICE, BLOOD_GROUPS, COMPONENTS, URGENCIES } from "@/lib/blood/compat";
import {
  BloodError,
  bloodRadiusKm,
  bloodStats,
  createBloodRequest,
  expireStaleRequests,
  listBloodRequests,
} from "@/lib/blood/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limit = rateLimit(clientKey(request, "blood-list"), 90, 60_000);
  if (!limit.allowed) return tooMany(limit.retryAfterMs);

  const params = new URL(request.url).searchParams;
  const lat = params.has("lat") ? Number(params.get("lat")) : null;
  const lng = params.has("lng") ? Number(params.get("lng")) : null;
  if ((lat !== null && !Number.isFinite(lat)) || (lng !== null && !Number.isFinite(lng))) {
    return fail("Those coordinates are not valid.", 422);
  }

  try {
    expireStaleRequests();
    const viewer = await getCurrentUser();
    const radius = Number(params.get("radius") ?? "");
    const requests = listBloodRequests(
      {
        lat,
        lng,
        radius: Number.isFinite(radius) && radius > 0 ? radius : undefined,
        bloodGroup: BLOOD_GROUPS.includes((params.get("group") ?? "") as never) ? params.get("group") : null,
        component: COMPONENTS.some((entry) => entry.value === params.get("component")) ? params.get("component") : null,
        urgency: URGENCIES.some((entry) => entry.value === params.get("urgency")) ? params.get("urgency") : null,
        status: params.get("status") ?? "open",
        requesterId: viewer && params.get("mine") === "1" ? viewer.id : null,
        limit: Number(params.get("limit") ?? "40"),
      },
      viewer,
    );
    return Response.json(
      {
        requests,
        stats: bloodStats(),
        radiusKm: bloodRadiusKm(),
        viewer: viewer ? { id: viewer.id, role: viewer.role } : null,
        safety: BLOOD_SAFETY_NOTICE,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof BloodError) return fail(error.message, error.status);
    return fail("Blood Connect is temporarily unavailable. Please retry.", 503);
  }
}

const createSchema = z.object({
  patientName: z.string().trim().min(1).max(120),
  bloodGroup: z.enum(BLOOD_GROUPS),
  component: z.enum(["whole_blood", "red_cells", "platelets", "plasma", "other"]),
  componentNote: z.string().trim().max(160).optional().nullable(),
  unitsRequired: z.number().int().min(1).max(20),
  hospitalName: z.string().trim().min(1).max(160),
  hospitalAddress: z.string().trim().max(300).optional().nullable(),
  district: z.string().trim().max(80).optional().nullable(),
  city: z.string().trim().max(80).optional().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  requiredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  requiredTime: z.string().regex(/^\d{2}:\d{2}$/),
  urgency: z.enum(["critical", "urgent", "high", "planned"]),
  contactName: z.string().trim().min(1).max(120),
  contactPhone: z.string().trim().min(7).max(20),
  contactMethod: z.enum(["in_app", "phone"]).optional(),
  notes: z.string().trim().max(800).optional().nullable(),
  proofUrl: z.string().trim().max(500).optional().nullable(),
});

export async function POST(request: Request) {
  const auth = await authorize();
  if (!auth.ok) return fail(auth.message, auth.status);

  const limit = rateLimit(clientKey(request, "blood-create"), 6, 10 * 60_000);
  if (!limit.allowed) return tooMany(limit.retryAfterMs);

  const parsed = createSchema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(issue?.message ?? "Check the request details and try again.", 422);
  }

  try {
    const created = createBloodRequest(auth.user, parsed.data);
    return Response.json(
      {
        ...created,
        message:
          "Your request is stored and now waits for moderator verification. Donors are only alerted after verification, and the public feed shows it as pending until then.",
        safety: BLOOD_SAFETY_NOTICE,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof BloodError) return fail(error.message, error.status);
    return fail("The blood request could not be saved. Please retry.", 500);
  }
}

import { HOSPITAL_DISCLAIMER } from "@/lib/hospitals/constants";
import { publicAvailabilityFor } from "@/lib/hospitals/repo";
import { clientKey, fail, rateLimit, tooMany } from "@/lib/http";

export const runtime = "nodejs";

/** Public, read-only availability reports. No authentication is required, but
 * only approved health organisations' latest published versions are exposed. */
export async function GET(request: Request) {
  const limit = rateLimit(clientKey(request, "hospital-availability"), 120, 60_000);
  if (!limit.allowed) return tooMany(limit.retryAfterMs);
  const params = new URL(request.url).searchParams;
  const raw = params.get("ids");
  if (!raw) return fail("Add one or more facility ids to request availability.", 400);
  const ids = [...new Set(raw.split(",").map((id) => id.trim()).filter(Boolean))];
  if (!ids.length || ids.length > 120) return fail("Request between 1 and 120 facilities at a time.", 400);
  if (ids.some((id) => id.length > 120)) return fail("One of the facility ids is invalid.", 422);

  return Response.json(
    {
      availability: publicAvailabilityFor(ids),
      disclaimer: HOSPITAL_DISCLAIMER,
      asOf: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

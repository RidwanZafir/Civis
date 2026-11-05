import { authorize } from "@/lib/auth";
import { clientKey, fail, rateLimit, tooMany } from "@/lib/http";
import { HospitalAvailabilityError, requireHealthOrganisation, searchHospitalCandidates } from "@/lib/hospitals/repo";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await authorize(["authority"]);
  if (!auth.ok) return fail(auth.message, auth.status);
  try {
    requireHealthOrganisation(auth.user.department_id);
  } catch (problem) {
    return fail(problem instanceof Error ? problem.message : "Health organisation required.", 403);
  }
  const limit = rateLimit(clientKey(request, "hospital-candidate-search"), 30, 60_000);
  if (!limit.allowed) return tooMany(limit.retryAfterMs);
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return fail("Enter at least two characters of the hospital name or city.", 422);
  if (query.length > 120) return fail("Keep the search under 120 characters.", 422);

  try {
    const result = await searchHospitalCandidates(query, auth.user.department_id!);
    return Response.json(result);
  } catch (problem) {
    if (problem instanceof HospitalAvailabilityError) return fail(problem.message, problem.status);
    return fail("The hospital directory is unavailable right now. Try again shortly.", 502);
  }
}

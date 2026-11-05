import { z } from "zod";
import { authorize } from "@/lib/auth";
import { fail, readJson } from "@/lib/http";
import {
  departmentHospitalLinks,
  HospitalAvailabilityError,
  requestHospitalLink,
  requireHealthOrganisation,
} from "@/lib/hospitals/repo";

export const runtime = "nodejs";

const claimSchema = z.object({ facilityId: z.string().trim().min(3).max(120) });

export async function GET() {
  const auth = await authorize(["authority"]);
  if (!auth.ok) return fail(auth.message, auth.status);
  try {
    requireHealthOrganisation(auth.user.department_id);
    return Response.json({ links: departmentHospitalLinks(auth.user.department_id!) });
  } catch (problem) {
    return fail(problem instanceof Error ? problem.message : "Health organisation required.", 403);
  }
}

export async function POST(request: Request) {
  const auth = await authorize(["authority"]);
  if (!auth.ok) return fail(auth.message, auth.status);
  const parsed = claimSchema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) return fail("Choose a hospital from the directory results.", 422);
  try {
    const result = requestHospitalLink(auth.user.id, auth.user.department_id!, parsed.data.facilityId);
    return Response.json(result, { status: result.already ? 200 : 201 });
  } catch (problem) {
    if (problem instanceof HospitalAvailabilityError) return fail(problem.message, problem.status);
    return fail("The hospital link request could not be saved. Try again shortly.", 500);
  }
}

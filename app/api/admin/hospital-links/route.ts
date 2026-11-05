import { z } from "zod";
import { authorize } from "@/lib/auth";
import { fail, readJson } from "@/lib/http";
import {
  allHospitalLinks,
  HospitalAvailabilityError,
  reviewHospitalLink,
} from "@/lib/hospitals/repo";

export const runtime = "nodejs";

const reviewSchema = z.object({
  id: z.string().trim().min(1).max(120),
  action: z.enum(["approve", "reject", "revoke"]),
  note: z.string().trim().max(1000).optional(),
});

export async function GET(request: Request) {
  const auth = await authorize(["admin"]);
  if (!auth.ok) return fail(auth.message, auth.status);
  const status = new URL(request.url).searchParams.get("status") ?? undefined;
  return Response.json({ links: allHospitalLinks(status) });
}

export async function PATCH(request: Request) {
  const auth = await authorize(["admin"]);
  if (!auth.ok) return fail(auth.message, auth.status);
  const parsed = reviewSchema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) return fail("Invalid hospital link decision.", 422);
  try {
    const result = reviewHospitalLink(
      parsed.data.id,
      parsed.data.action,
      parsed.data.note?.trim() || null,
      { id: auth.user.id, name: auth.user.name },
    );
    return Response.json(result);
  } catch (problem) {
    if (problem instanceof HospitalAvailabilityError) return fail(problem.message, problem.status);
    return fail("The hospital link decision could not be saved.", 500);
  }
}

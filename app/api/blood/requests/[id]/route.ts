import { z } from "zod";
import { authorize, getCurrentUser } from "@/lib/auth";
import { fail, readJson } from "@/lib/http";
import { BLOOD_SAFETY_NOTICE } from "@/lib/blood/compat";
import {
  BloodError,
  getBloodRequest,
  interestsForRequest,
  updateRequestStatus,
} from "@/lib/blood/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const viewer = await getCurrentUser();
    const { row, shape } = getBloodRequest(id, viewer);
    const canManage = viewer
      ? row.requester_id === viewer.id || viewer.role === "admin" || viewer.role === "moderator"
      : false;
    return Response.json(
      {
        request: shape,
        interests: viewer && canManage ? interestsForRequest(row.id, viewer) : [],
        canManage,
        safety: BLOOD_SAFETY_NOTICE,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof BloodError) return fail(error.message, error.status);
    return fail("That blood request could not be loaded.", 500);
  }
}

const patchSchema = z.object({
  status: z.enum(["active", "partially_fulfilled", "fulfilled", "cancelled", "expired"]),
  unitsFulfilled: z.number().int().min(0).max(20).optional(),
  notes: z.string().trim().max(400).optional().nullable(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize();
  if (!auth.ok) return fail(auth.message, auth.status);
  const { id } = await params;
  const parsed = patchSchema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid status update.", 422);
  }
  try {
    const result = updateRequestStatus(auth.user, id, parsed.data);
    return Response.json({ ...result, ok: true });
  } catch (error) {
    if (error instanceof BloodError) return fail(error.message, error.status);
    return fail("The request status could not be updated.", 500);
  }
}

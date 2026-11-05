import { z } from "zod";
import { authorize } from "@/lib/auth";
import { clientKey, fail, rateLimit, readJson, tooMany } from "@/lib/http";
import {
  BloodError,
  expressInterest,
  interestsForRequest,
  setInterestStatus,
} from "@/lib/blood/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize();
  if (!auth.ok) return fail(auth.message, auth.status);
  const { id } = await params;
  try {
    return Response.json({ interests: interestsForRequest(id, auth.user) });
  } catch (error) {
    if (error instanceof BloodError) return fail(error.message, error.status);
    return fail("Donor responses could not be loaded.", 500);
  }
}

const offerSchema = z.object({
  message: z.string().trim().max(500).optional().nullable(),
});

/** A donor offering to donate. Contact details stay hidden until accepted. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize();
  if (!auth.ok) return fail(auth.message, auth.status);
  const { id } = await params;
  const limit = rateLimit(clientKey(request, "blood-interest"), 20, 60_000);
  if (!limit.allowed) return tooMany(limit.retryAfterMs);

  const body = (await readJson<unknown>(request)) ?? {};
  const parsed = offerSchema.safeParse(body);
  if (!parsed.success) return fail("The message is too long.", 422);

  try {
    const result = expressInterest(auth.user, id, parsed.data.message ?? null);
    return Response.json({
      ...result,
      message: result.alreadyOffered
        ? "You have already offered to donate for this request."
        : "Your offer is recorded and the requester has been notified. A click is an offer to help, not a confirmed donation.",
    });
  } catch (error) {
    if (error instanceof BloodError) return fail(error.message, error.status);
    return fail("Your offer could not be recorded.", 500);
  }
}

const responseSchema = z.object({
  interestId: z.string().min(1),
  status: z.enum(["accepted", "declined", "donated", "withdrawn"]),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize();
  if (!auth.ok) return fail(auth.message, auth.status);
  const { id } = await params;
  const parsed = responseSchema.safeParse(await readJson<unknown>(request));
  if (!parsed.success) return fail("Invalid donor response update.", 422);

  try {
    const result = setInterestStatus(auth.user, id, parsed.data.interestId, parsed.data.status);
    return Response.json({ ...result, ok: true });
  } catch (error) {
    if (error instanceof BloodError) return fail(error.message, error.status);
    return fail("The donor response could not be updated.", 500);
  }
}

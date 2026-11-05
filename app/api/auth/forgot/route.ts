import { z } from "zod";
import { get, run } from "@/lib/db";
import { randomToken } from "@/lib/crypto";
import { clientKey, fail, rateLimit, readJson, tooMany } from "@/lib/http";
import { DEMO_MODE } from "@/lib/constants";

const schema = z.object({ email: z.string().trim().email() });

export async function POST(req: Request) {
  const limit = rateLimit(clientKey(req, "forgot"), 6, 60_000);
  if (!limit.allowed) return tooMany(limit.retryAfterMs);

  const parsed = schema.safeParse(await readJson<unknown>(req));
  if (!parsed.success) return fail("Enter a valid email address.", 422);

  const user = get<{ id: string }>("SELECT id FROM users WHERE email = ? AND deleted_at IS NULL", [
    parsed.data.email.toLowerCase(),
  ]);

  if (!user) {
    // Same response either way so the endpoint cannot be used to enumerate accounts.
    return Response.json({
      ok: true,
      message: "If an account exists for that address, a reset link has been issued.",
    });
  }

  const token = randomToken(24);
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  run("UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?", [token, expires, user.id]);

  return Response.json({
    ok: true,
    message: "If an account exists for that address, a reset link has been issued.",
    delivery: DEMO_MODE.emailDelivery ? "email" : "not-configured",
    note: DEMO_MODE.emailDelivery
      ? undefined
      : "Email delivery is not configured here, so the reset link is returned directly for this demonstration deployment.",
    url: DEMO_MODE.emailDelivery ? undefined : `/auth/reset?token=${token}`,
  });
}

import { z } from "zod";
import { get, run } from "@/lib/db";
import { verifyPassword } from "@/lib/crypto";
import { createSession, setSessionCookie, userById, userByEmail, audit } from "@/lib/auth";
import { clientKey, fail, rateLimit, readJson, tooMany } from "@/lib/http";
import { RATE_LIMITS } from "@/lib/constants";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(req: Request) {
  const limit = rateLimit(clientKey(req, "signin"), RATE_LIMITS.signIn.max, RATE_LIMITS.signIn.windowMs);
  if (!limit.allowed) return tooMany(limit.retryAfterMs);

  const parsed = schema.safeParse(await readJson<unknown>(req));
  if (!parsed.success) return fail("Enter your email and password.", 422);

  const record = userByEmail(parsed.data.email);
  if (!record) return fail("Email or password is incorrect.", 401);

  const suspended = get<{ suspended: number }>("SELECT suspended FROM users WHERE id = ?", [record.id]);
  if (suspended?.suspended) {
    return fail("This account is suspended. Contact the platform administrators.", 403);
  }

  if (!verifyPassword(parsed.data.password, record.password_hash)) {
    return fail("Email or password is incorrect.", 401);
  }

  const session = createSession(record.id);
  await setSessionCookie(session.token, session.expiresAt);
  audit({ id: record.id, role: record.role, name: record.name }, "user.sign_in", {
    type: "user",
    id: record.id,
  });

  const user = userById(record.id);
  return Response.json({ user });
}

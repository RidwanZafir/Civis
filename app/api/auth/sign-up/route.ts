import { z } from "zod";
import { get, run } from "@/lib/db";
import { hashPassword, newId, nowIso, randomToken } from "@/lib/crypto";
import { createSession, setSessionCookie, audit, notify } from "@/lib/auth";
import { clientKey, fail, rateLimit, readJson, tooMany } from "@/lib/http";
import { RATE_LIMITS } from "@/lib/constants";

const schema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(60),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(10, "Use at least 10 characters").max(200),
  anonymousDefault: z.boolean().optional(),
});

export async function POST(req: Request) {
  const limit = rateLimit(clientKey(req, "signup"), 8, 60_000);
  if (!limit.allowed) return tooMany(limit.retryAfterMs);

  const body = await readJson<unknown>(req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid details", 422);
  }
  const { name, email, password, anonymousDefault } = parsed.data;
  const normalized = email.toLowerCase();

  const existing = get<{ id: string }>("SELECT id FROM users WHERE email = ?", [normalized]);
  if (existing) return fail("An account with that email already exists.", 409);

  const id = newId("usr");
  const verifyToken = randomToken(24);
  run(
    `INSERT INTO users (id, email, password_hash, name, role, department_id, email_verified,
       verify_token, notify_email, notify_inapp, public_name, anonymous_default, suspended,
       is_demo, created_at)
     VALUES (?,?,?,?, 'citizen', NULL, 0, ?, 1, 1, 1, ?, 0, 0, ?)`,
    [id, normalized, hashPassword(password), name, verifyToken, anonymousDefault ? 1 : 0, nowIso()],
  );

  const session = createSession(id);
  await setSessionCookie(session.token, session.expiresAt);

  audit({ id, role: "citizen", name }, "user.sign_up", { type: "user", id });
  notify(id, {
    type: "account",
    title: "Welcome to CIVIS",
    body: "Confirm your email address to unlock follow-up notifications.",
  });

  return Response.json({
    user: { id, name, email: normalized, role: "citizen" },
    verification: {
      delivery: "not-configured",
      note: "No email provider is connected in this deployment, so the confirmation link is returned here instead of being emailed.",
      url: `/auth/verify?token=${verifyToken}`,
    },
  });
}

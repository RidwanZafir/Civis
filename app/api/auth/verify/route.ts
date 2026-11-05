import { z } from "zod";
import { get, run } from "@/lib/db";
import { nowIso } from "@/lib/crypto";
import { audit, notify } from "@/lib/auth";
import { fail, readJson } from "@/lib/http";

const schema = z.object({ token: z.string().min(10) });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await readJson<unknown>(req));
  if (!parsed.success) return fail("Verification token missing.", 422);

  const user = get<{ id: string; name: string; role: string; email_verified: number }>(
    "SELECT id, name, role, email_verified FROM users WHERE verify_token = ?",
    [parsed.data.token],
  );
  if (!user) return fail("This verification link is invalid or has already been used.", 400);

  run("UPDATE users SET email_verified = 1, verify_token = NULL WHERE id = ?", [user.id]);
  audit({ id: user.id, role: user.role, name: user.name }, "user.email_verified", {
    type: "user",
    id: user.id,
  });
  notify(user.id, {
    type: "account",
    title: "Email confirmed",
    body: "Your address is confirmed. You will now receive updates on reports you follow.",
  });
  run("UPDATE meta SET value = ? WHERE key = 'last_verify'", [nowIso()]);

  return Response.json({ ok: true, emailVerified: true });
}

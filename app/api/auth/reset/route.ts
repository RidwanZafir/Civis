import { z } from "zod";
import { get, run } from "@/lib/db";
import { hashPassword } from "@/lib/crypto";
import { audit } from "@/lib/auth";
import { fail, readJson } from "@/lib/http";

const schema = z.object({
  token: z.string().min(10),
  password: z.string().min(10, "Use at least 10 characters").max(200),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await readJson<unknown>(req));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid request", 422);

  const user = get<{ id: string; name: string; role: string; reset_expires: string | null }>(
    "SELECT id, name, role, reset_expires FROM users WHERE reset_token = ?",
    [parsed.data.token],
  );
  if (!user) return fail("This reset link is invalid or has already been used.", 400);
  if (!user.reset_expires || new Date(user.reset_expires).getTime() < Date.now()) {
    return fail("This reset link has expired. Request a new one.", 400);
  }

  run("UPDATE users SET password_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?", [
    hashPassword(parsed.data.password),
    user.id,
  ]);
  run("DELETE FROM sessions WHERE user_id = ?", [user.id]);
  audit({ id: user.id, role: user.role, name: user.name }, "user.password_reset", {
    type: "user",
    id: user.id,
  });

  return Response.json({ ok: true });
}

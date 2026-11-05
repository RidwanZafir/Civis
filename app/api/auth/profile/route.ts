import { z } from "zod";
import { get, run } from "@/lib/db";
import { hashPassword, nowIso, verifyPassword } from "@/lib/crypto";
import { audit, authorize, clearSessionCookie } from "@/lib/auth";
import { fail, readJson } from "@/lib/http";

const patchSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  notify_email: z.boolean().optional(),
  notify_inapp: z.boolean().optional(),
  public_name: z.boolean().optional(),
  anonymous_default: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  const auth = await authorize();
  if (!auth.ok) return fail(auth.message, auth.status);
  const parsed = patchSchema.safeParse(await readJson<unknown>(req));
  if (!parsed.success) return fail("Invalid settings payload.", 422);

  const { name, notify_email, notify_inapp, public_name, anonymous_default } = parsed.data;
  const fields: string[] = [];
  const params: unknown[] = [];
  const assign = (col: string, value: unknown) => {
    fields.push(`${col} = ?`);
    params.push(value);
  };
  if (name !== undefined) assign("name", name);
  if (notify_email !== undefined) assign("notify_email", notify_email ? 1 : 0);
  if (notify_inapp !== undefined) assign("notify_inapp", notify_inapp ? 1 : 0);
  if (public_name !== undefined) assign("public_name", public_name ? 1 : 0);
  if (anonymous_default !== undefined) assign("anonymous_default", anonymous_default ? 1 : 0);
  if (!fields.length) return fail("Nothing to update.", 400);

  params.push(auth.user.id);
  run(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, params);
  audit({ id: auth.user.id, role: auth.user.role, name: auth.user.name }, "user.settings_updated", {
    type: "user",
    id: auth.user.id,
  });

  return Response.json({ ok: true });
}

const deleteSchema = z.object({ password: z.string().min(1) });

export async function DELETE(req: Request) {
  const auth = await authorize();
  if (!auth.ok) return fail(auth.message, auth.status);
  const parsed = deleteSchema.safeParse(await readJson<unknown>(req));
  if (!parsed.success) return fail("Confirm your password to delete the account.", 422);

  const record = get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", [
    auth.user.id,
  ]);
  if (!record || !verifyPassword(parsed.data.password, record.password_hash)) {
    return fail("Password is incorrect.", 401);
  }

  run("UPDATE users SET deleted_at = ?, email = ? WHERE id = ?", [
    nowIso(),
    `deleted+${auth.user.id}@civis.invalid`,
    auth.user.id,
  ]);
  run("DELETE FROM sessions WHERE user_id = ?", [auth.user.id]);
  audit({ id: auth.user.id, role: auth.user.role, name: auth.user.name }, "user.account_deleted", {
    type: "user",
    id: auth.user.id,
  });
  await clearSessionCookie();

  return Response.json({ ok: true });
}

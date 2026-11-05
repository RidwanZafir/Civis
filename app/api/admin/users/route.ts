import { z } from "zod";
import { get, run } from "@/lib/db";
import { audit, authorize } from "@/lib/auth";
import { fail, readJson } from "@/lib/http";
import { adminUsers } from "@/lib/repo";
import { ROLES } from "@/lib/constants";

export async function GET() {
  const auth = await authorize(["admin"]);
  if (!auth.ok) return fail(auth.message, auth.status);
  return Response.json({ users: adminUsers() });
}

const schema = z.object({
  userId: z.string().min(1),
  role: z.enum(ROLES).optional(),
  departmentId: z.string().nullable().optional(),
  suspended: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  const auth = await authorize(["admin"]);
  if (!auth.ok) return fail(auth.message, auth.status);

  const parsed = schema.safeParse(await readJson<unknown>(req));
  if (!parsed.success) return fail("Invalid request.", 422);
  const { userId, role, departmentId, suspended } = parsed.data;

  const target = get<{ id: string; role: string; name: string }>(
    "SELECT id, role, name FROM users WHERE id = ? AND deleted_at IS NULL",
    [userId],
  );
  if (!target) return fail("User not found.", 404);
  if (userId === auth.user.id && role && role !== "admin") {
    return fail("You cannot remove your own administrator role.", 409);
  }
  if (role === "authority" && !departmentId) {
    const dept = get<{ department_id: string | null }>("SELECT department_id FROM users WHERE id = ?", [userId]);
    if (!dept?.department_id) return fail("Authority accounts need a department.", 422);
  }

  const fields: string[] = [];
  const params: unknown[] = [];
  if (role) {
    fields.push("role = ?");
    params.push(role);
    if (role !== "authority") {
      fields.push("department_id = NULL");
    }
  }
  if (departmentId !== undefined) {
    fields.push("department_id = ?");
    params.push(departmentId);
  }
  if (suspended !== undefined) {
    fields.push("suspended = ?");
    params.push(suspended ? 1 : 0);
    if (suspended) run("DELETE FROM sessions WHERE user_id = ?", [userId]);
  }
  if (!fields.length) return fail("Nothing to update.", 400);

  params.push(userId);
  run(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, params);
  audit(
    { id: auth.user.id, role: auth.user.role, name: auth.user.name },
    "user.admin_updated",
    { type: "user", id: userId },
    JSON.stringify({ role, departmentId, suspended }),
  );

  return Response.json({ ok: true, users: adminUsers() });
}

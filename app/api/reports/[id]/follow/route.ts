import { get, run } from "@/lib/db";
import { nowIso } from "@/lib/crypto";
import { audit, authorize } from "@/lib/auth";
import { fail } from "@/lib/http";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize();
  if (!auth.ok) return fail(auth.message, auth.status);
  const exists = get("SELECT 1 AS x FROM reports WHERE id = ?", [id]);
  if (!exists) return fail("Report not found.", 404);

  run("INSERT OR IGNORE INTO user_follows (user_id, report_id, created_at) VALUES (?,?,?)", [
    auth.user.id,
    id,
    nowIso(),
  ]);
  audit({ id: auth.user.id, role: auth.user.role, name: auth.user.name }, "report.followed", {
    type: "report",
    id,
  });
  return Response.json({ following: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize();
  if (!auth.ok) return fail(auth.message, auth.status);
  run("DELETE FROM user_follows WHERE user_id = ? AND report_id = ?", [auth.user.id, id]);
  return Response.json({ following: false });
}

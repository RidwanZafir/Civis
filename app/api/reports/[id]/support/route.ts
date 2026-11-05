import { get, run } from "@/lib/db";
import { nowIso } from "@/lib/crypto";
import { audit, authorize, notify } from "@/lib/auth";
import { fail } from "@/lib/http";

function supportersOf(reportId: string) {
  return get<{ n: number }>("SELECT COUNT(*) AS n FROM report_support WHERE report_id = ?", [reportId])?.n ?? 0;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize();
  if (!auth.ok) return fail(auth.message, auth.status);

  const report = get<{ user_id: string | null; title: string; status: string }>(
    "SELECT user_id, title, status FROM reports WHERE id = ?",
    [id],
  );
  if (!report) return fail("Report not found.", 404);

  const already = get("SELECT 1 AS x FROM report_support WHERE report_id = ? AND user_id = ?", [id, auth.user.id]);
  if (!already) {
    run("INSERT INTO report_support (report_id, user_id, created_at) VALUES (?,?,?)", [id, auth.user.id, nowIso()]);
    audit({ id: auth.user.id, role: auth.user.role, name: auth.user.name }, "report.supported", {
      type: "report",
      id,
    });
  }

  const total = supportersOf(id);
  // Milestone notification for the reporter, not the supporter.
  if (!already && total > 0 && total % 25 === 0 && report.user_id !== auth.user.id) {
    notify(report.user_id, {
      type: "support_milestone",
      title: `${total} neighbours support your report`,
      body: report.title,
      reportId: id,
    });
  }

  return Response.json({ supported: true, supporters: total });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize();
  if (!auth.ok) return fail(auth.message, auth.status);

  run("DELETE FROM report_support WHERE report_id = ? AND user_id = ?", [id, auth.user.id]);
  audit({ id: auth.user.id, role: auth.user.role, name: auth.user.name }, "report.support_removed", {
    type: "report",
    id,
  });
  return Response.json({ supported: false, supporters: supportersOf(id) });
}

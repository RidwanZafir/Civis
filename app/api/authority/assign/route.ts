import { z } from "zod";
import { get, run } from "@/lib/db";
import { newId, nowIso } from "@/lib/crypto";
import { audit, authorize, notify } from "@/lib/auth";
import { fail, readJson } from "@/lib/http";
import { orgRole } from "@/lib/portal";
import { organisationAdmins } from "@/lib/notifications";

const schema = z.object({
  reportId: z.string().min(1),
  officerId: z.string().min(1).nullable().optional(),
  departmentId: z.string().min(1).optional(),
  note: z.string().trim().max(400).optional(),
});

export async function POST(req: Request) {
  const auth = await authorize(["authority", "admin"]);
  if (!auth.ok) return fail(auth.message, auth.status);

  const parsed = schema.safeParse(await readJson<unknown>(req));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid assignment", 422);
  const { reportId, officerId, departmentId, note } = parsed.data;

  const report = get<{ id: string; title: string; department_id: string | null; user_id: string | null }>(
    "SELECT id, title, department_id, user_id FROM reports WHERE id = ?",
    [reportId],
  );
  if (!report) return fail("Report not found.", 404);

  const isAdmin = auth.user.role === "admin";
  if (!isAdmin) {
    if (!auth.user.department_id || report.department_id !== auth.user.department_id) {
      return fail("This report is not assigned to your organisation.", 403);
    }
    const role = orgRole(auth.user.id, auth.user.department_id);
    if (role !== "org_admin" && role !== "reviewer") {
      return fail("Only an organisation administrator or reviewer can allocate reports.", 403);
    }
  }

  if (departmentId && departmentId !== report.department_id) {
    if (!isAdmin) return fail("Only platform administrators can move a report to another organisation.", 403);
    run(
      `INSERT INTO authority_assignments (id, report_id, department_id, assigned_by, created_at)
       VALUES (?,?,?,?,?)
       ON CONFLICT(report_id) DO UPDATE SET department_id = excluded.department_id, assigned_by = excluded.assigned_by`,
      [newId("asg"), reportId, departmentId, auth.user.name, nowIso()],
    );
    run("UPDATE reports SET department_id = ?, routing_state = 'delivered', updated_at = ? WHERE id = ?", [
      departmentId,
      nowIso(),
      reportId,
    ]);
  }

  if (officerId !== undefined) {
    if (officerId) {
      const member = get<{ user_id: string }>(
        "SELECT user_id FROM department_members WHERE user_id = ? AND department_id = ? AND status = 'active'",
        [officerId, departmentId ?? report.department_id],
      );
      if (!member) return fail("That account is not an active member of this organisation.", 422);
    }
    run("UPDATE reports SET assignee_id = ?, updated_at = ? WHERE id = ?", [officerId, nowIso(), reportId]);
    run(
      `INSERT INTO report_status_history
        (id, report_id, from_status, to_status, note, actor_id, actor_role, actor_label, created_at)
       SELECT ?,?, r.status, r.status, ?, ?, ?, ?, ? FROM reports r WHERE r.id = ?`,
      [
        newId("hist"),
        reportId,
        officerId ? "Assigned to an officer." : "Officer allocation cleared.",
        auth.user.id,
        auth.user.role,
        auth.user.name,
        nowIso(),
        reportId,
      ],
    );
    if (officerId) {
      notify(officerId, {
        type: "report_assigned_to_you",
        title: "A report was assigned to you",
        body: `${reportId} — ${report.title}${note ? ` · ${note}` : ""}`,
        reportId,
        category: "authority",
        priority: "high",
        actionUrl: `/incidents/${reportId}`,
        organisationId: auth.user.department_id,
        recipientRole: "officer",
        dedupeKey: `officer_assigned:${reportId}:${officerId}:${note ?? ""}`,
      });
      if (auth.user.department_id) {
        for (const adminId of organisationAdmins(auth.user.department_id)) {
          if (adminId === officerId) continue;
          notify(adminId, {
            type: "officer_assigned",
            title: "Officer assignment updated",
            body: `${reportId} was assigned to a field officer within your organisation.`,
            reportId,
            category: "authority",
            actionUrl: `/incidents/${reportId}`,
            organisationId: auth.user.department_id,
            dedupeKey: `org_officer_assigned:${reportId}:${officerId}:${adminId}`,
          });
        }
      }
    }
  }

  audit({ id: auth.user.id, role: auth.user.role, name: auth.user.name }, "report.assigned", {
    type: "report",
    id: reportId,
  }, officerId ? `Officer ${officerId}` : "Organisation-level allocation");

  return Response.json({ ok: true });
}

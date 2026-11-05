import { z } from "zod";
import { get, run, transaction } from "@/lib/db";
import { newId, nowIso } from "@/lib/crypto";
import { audit, authorize, isAssignedOfficial, notify, notifyFollowers } from "@/lib/auth";
import { fail, readJson } from "@/lib/http";
import { STATUS_FLOW } from "@/lib/constants";

const schema = z.object({
  action: z.enum(["verify", "assign", "accept", "respond", "status", "resolve", "evidence"]),
  decision: z.enum(["approve", "reject"]).optional(),
  note: z.string().trim().max(1200).optional(),
  body: z.string().trim().max(2000).optional(),
  progress: z.number().min(0).max(100).optional(),
  eta: z.string().trim().max(80).optional(),
  departmentId: z.string().optional(),
  status: z.string().optional(),
  images: z.array(z.string().startsWith("/api/media/")).max(6).optional(),
});

const ALLOWED_STATUSES = STATUS_FLOW.map((s) => s.value);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize(["moderator", "authority", "admin"]);
  if (!auth.ok) return fail(auth.message, auth.status);

  const parsed = schema.safeParse(await readJson<unknown>(req));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid action", 422);
  const data = parsed.data;

  const report = get<{
    id: string;
    title: string;
    user_id: string | null;
    status: string;
    verification: string;
    department_id: string | null;
  }>("SELECT id, title, user_id, status, verification, department_id FROM reports WHERE id = ?", [id]);
  if (!report) return fail("Report not found.", 404);

  const currentStatus = report.status;
  const reportTitle = report.title;
  const actor = { id: auth.user.id, role: auth.user.role, name: auth.user.name };

  function recordHistory(toStatus: string, note: string) {
    run(
      `INSERT INTO report_status_history
       (id, report_id, from_status, to_status, note, actor_id, actor_role, actor_label, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [newId("hist"), id, currentStatus, toStatus, note, actor.id, actor.role, actor.name, nowIso()],
    );
  }

  function setStatus(next: string, note: string, extra?: { resolved?: boolean }) {
    run(
      `UPDATE reports SET status = ?, updated_at = ?, resolved_at = ? WHERE id = ?`,
      [next, nowIso(), extra?.resolved ? nowIso() : null, id],
    );
    recordHistory(next, note);
    notifyFollowers(id, {
      type: "status_change",
      title: `Status changed: ${next.replace(/_/g, " ")}`,
      body: reportTitle,
    });
  }

  switch (data.action) {
    case "verify": {
      if (auth.user.role === "authority") return fail("Authority accounts cannot verify community reports.", 403);
      const approve = data.decision !== "reject";
      const nextVerification = approve ? "community_verified" : "rejected";
      const nextStatus = approve ? "community_verified" : "rejected";
      transaction(() => {
        run("UPDATE reports SET verification = ?, status = ?, updated_at = ? WHERE id = ?", [
          nextVerification,
          nextStatus,
          nowIso(),
          id,
        ]);
        run(
          `INSERT INTO report_verifications (id, report_id, stage, decision, note, actor_id, created_at)
           VALUES (?,?,?,?,?,?,?)`,
          [
            newId("ver"),
            id,
            "moderator_review",
            approve ? "approve" : "reject",
            data.note ?? null,
            actor.id,
            nowIso(),
          ],
        );
        recordHistory(nextStatus, data.note ?? (approve ? "Evidence reviewed and confirmed." : "Report rejected after review."));
      });
      notify(report.user_id, {
        type: "verification",
        title: approve ? "Your report was verified" : "Your report was not confirmed",
        body: data.note ?? report.title,
        reportId: id,
      });
      audit(actor, approve ? "report.verified" : "report.rejected", { type: "report", id }, data.note);
      return Response.json({ ok: true, verification: nextVerification, status: nextStatus });
    }

    case "assign": {
      if (auth.user.role === "moderator") return fail("Moderators cannot assign departments.", 403);
      const departmentId = data.departmentId ?? auth.user.department_id;
      if (!departmentId) return fail("Select a department to assign.", 422);
      const dept = get<{ name: string }>("SELECT name FROM departments WHERE id = ?", [departmentId]);
      if (!dept) return fail("Department not found.", 404);
      if (auth.user.role === "authority" && departmentId !== auth.user.department_id) {
        return fail("You can only assign incidents to your own department.", 403);
      }
      transaction(() => {
        run("DELETE FROM authority_assignments WHERE report_id = ?", [id]);
        run(
          "INSERT INTO authority_assignments (id, report_id, department_id, assigned_by, created_at) VALUES (?,?,?,?,?)",
          [newId("asg"), id, departmentId, actor.id, nowIso()],
        );
        run("UPDATE reports SET department_id = ?, status = 'authority_notified', updated_at = ? WHERE id = ?", [
          departmentId,
          nowIso(),
          id,
        ]);
        recordHistory("authority_notified", `Assigned to ${dept.name}.`);
      });
      notify(report.user_id, {
        type: "authority_response",
        title: `${dept.name} was assigned`,
        body: report.title,
        reportId: id,
      });
      audit(actor, "report.assigned", { type: "report", id }, dept.name);
      return Response.json({ ok: true, status: "authority_notified", department: dept.name });
    }

    case "accept": {
      if (!isAssignedOfficial(auth.user, id) && auth.user.role !== "admin") {
        return fail("Only the assigned department can accept this incident.", 403);
      }
      transaction(() => {
        run("UPDATE reports SET verification = 'officially_confirmed', status = 'authority_notified', updated_at = ? WHERE id = ?", [
          nowIso(),
          id,
        ]);
        run(
          `INSERT INTO report_verifications (id, report_id, stage, decision, note, actor_id, created_at)
           VALUES (?,?,?,?,?,?,?)`,
          [newId("ver"), id, "authority_acceptance", "approve", data.note ?? null, actor.id, nowIso()],
        );
        recordHistory("authority_notified", data.note ?? "Incident accepted by the responsible department.");
      });
      notify(report.user_id, {
        type: "authority_response",
        title: "Your incident was accepted by an authority",
        body: report.title,
        reportId: id,
      });
      audit(actor, "report.accepted", { type: "report", id });
      return Response.json({ ok: true, verification: "officially_confirmed", status: "authority_notified" });
    }

    case "respond": {
      if (auth.user.role === "moderator") return fail("Moderators cannot publish official responses.", 403);
      if (!isAssignedOfficial(auth.user, id)) {
        return fail("Only the department assigned to this incident can publish an official response.", 403);
      }
      const departmentId = report.department_id ?? auth.user.department_id;
      if (!departmentId) return fail("Assign the incident to a department first.", 409);
      if (!data.body || data.body.length < 20) return fail("Write at least 20 characters.", 422);

      const progress = Math.round(data.progress ?? 0);
      const nextStatus = progress >= 100 ? "resolved" : "in_progress";
      transaction(() => {
        run(
          `INSERT INTO authority_responses (id, report_id, department_id, user_id, body, progress, eta, created_at)
           VALUES (?,?,?,?,?,?,?,?)`,
          [newId("rsp"), id, departmentId, actor.id, data.body, progress, data.eta ?? null, nowIso()],
        );
        run(
          "UPDATE reports SET status = ?, verification = 'officially_confirmed', updated_at = ?, resolved_at = ? WHERE id = ?",
          [nextStatus, nowIso(), nextStatus === "resolved" ? nowIso() : null, id],
        );
        recordHistory(nextStatus, data.body!);
      });
      notify(report.user_id, {
        type: "authority_response",
        title: nextStatus === "resolved" ? "Your incident was resolved" : "Official response published",
        body: data.body.slice(0, 140),
        reportId: id,
      });
      audit(actor, "report.authority_response", { type: "report", id }, `${progress}% complete`);
      return Response.json({ ok: true, status: nextStatus });
    }

    case "status": {
      const next = data.status;
      if (!next || !ALLOWED_STATUSES.includes(next as never)) return fail("Unknown status.", 422);
      if (auth.user.role === "authority") {
        if (!isAssignedOfficial(auth.user, id)) return fail("Not your department's incident.", 403);
        if (!["in_progress", "resolved", "authority_notified"].includes(next)) {
          return fail("Authority accounts can only set field-work statuses.", 403);
        }
      }
      if (next === "resolved" && auth.user.role === "authority" && !isAssignedOfficial(auth.user, id)) {
        return fail("Not your department's incident.", 403);
      }
      setStatus(next, data.note ?? "Status updated by staff.", { resolved: next === "resolved" });
      notify(report.user_id, {
        type: "status_change",
        title: `Status updated: ${next.replace(/_/g, " ")}`,
        body: report.title,
        reportId: id,
      });
      audit(actor, "report.status_changed", { type: "report", id }, `${currentStatus} → ${next}`);
      return Response.json({ ok: true, status: next });
    }

    case "resolve": {
      if (!isAssignedOfficial(auth.user, id) && auth.user.role !== "admin") {
        return fail("Only the assigned department can mark this resolved.", 403);
      }
      if (!data.note || data.note.length < 10) return fail("Describe the completed work.", 422);
      transaction(() => {
        (data.images ?? []).forEach((url) => {
          run(
            "INSERT INTO report_images (id, report_id, url, kind, caption, created_at) VALUES (?,?,?,?,?,?)",
            [newId("img"), id, url, "resolution", "Resolution evidence", nowIso()],
          );
        });
        run("UPDATE reports SET status = 'resolved', resolved_at = ?, updated_at = ? WHERE id = ?", [
          nowIso(),
          nowIso(),
          id,
        ]);
        recordHistory("resolved", data.note!);
      });
      notify(report.user_id, {
        type: "resolution",
        title: "Your incident is marked resolved",
        body: data.note.slice(0, 140),
        reportId: id,
      });
      notifyFollowers(id, { type: "resolution", title: "Incident resolved", body: report.title });
      audit(actor, "report.resolved", { type: "report", id }, data.note);
      return Response.json({ ok: true, status: "resolved" });
    }

    case "evidence": {
      const isOwner = report.user_id === auth.user.id;
      if (!isOwner && auth.user.role === "citizen") return fail("You can only add evidence to your own report.", 403);
      if (!data.images?.length) return fail("No images supplied.", 422);
      data.images.forEach((url) => {
        run(
          "INSERT INTO report_images (id, report_id, url, kind, caption, created_at) VALUES (?,?,?,?,?,?)",
          [newId("img"), id, url, "evidence", "Additional evidence", nowIso()],
        );
      });
      recordHistory(report.status, "Additional evidence attached.");
      audit(actor, "report.evidence_added", { type: "report", id }, `${data.images.length} image(s)`);
      return Response.json({ ok: true, images: data.images });
    }

    default:
      return fail("Unsupported action.", 400);
  }
}

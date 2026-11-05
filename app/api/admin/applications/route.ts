import { z } from "zod";
import { all, get, run, transaction } from "@/lib/db";
import { newId, nowIso } from "@/lib/crypto";
import { audit, authorize, notify } from "@/lib/auth";
import { fail, readJson } from "@/lib/http";
import { applicationQueue } from "@/lib/portal";

export async function GET(req: Request) {
  const auth = await authorize(["admin"]);
  if (!auth.ok) return fail(auth.message, auth.status);
  const status = new URL(req.url).searchParams.get("status") ?? undefined;
  return Response.json({ applications: applicationQueue(status ?? undefined) });
}

const reviewSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["under_review", "info_required", "approve", "reject", "suspend"]),
  notes: z.string().trim().max(1000).optional(),
  radiusKm: z.number().min(1).max(500).optional(),
  categories: z.string().trim().max(200).optional(),
});

const ORG_STATUS: Record<string, string> = {
  under_review: "under_review",
  info_required: "info_required",
  approve: "approved",
  reject: "rejected",
  suspend: "suspended",
};

export async function PATCH(req: Request) {
  const auth = await authorize(["admin"]);
  if (!auth.ok) return fail(auth.message, auth.status);

  const parsed = reviewSchema.safeParse(await readJson<unknown>(req));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid review", 422);
  const { id, action, notes, radiusKm, categories } = parsed.data;

  const application = get<{
    id: string;
    department_id: string;
    applicant_user_id: string | null;
    rep_email: string;
    organisation_name: string;
  }>(
    `SELECT a.id, a.department_id, a.applicant_user_id, a.rep_email, d.name AS organisation_name
     FROM department_applications a JOIN departments d ON d.id = a.department_id WHERE a.id = ?`,
    [id],
  );
  if (!application) return fail("Application not found.", 404);

  const appStatus = action === "approve" ? "approved" : action;
  const orgStatus = ORG_STATUS[action];
  const stamp = nowIso();

  transaction(() => {
    run(
      `UPDATE department_applications
       SET status = ?, review_notes = COALESCE(?, review_notes), reviewed_by = ?, reviewed_at = ?
       WHERE id = ?`,
      [appStatus, notes ?? null, auth.user.id, stamp, id],
    );
    run(
      `UPDATE departments SET verification_status = ?,
         radius_km = COALESCE(?, radius_km),
         categories = COALESCE(?, categories)
       WHERE id = ?`,
      [orgStatus, radiusKm ?? null, categories ?? null, application.department_id],
    );
    run(
      `INSERT INTO audit_logs (id, actor_id, actor_role, actor_label, action, target_type, target_id, detail, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        newId("audit"),
        auth.user.id,
        auth.user.role,
        auth.user.name,
        `authority.${action}`,
        "organisation",
        application.department_id,
        `${application.organisation_name}${notes ? ` — ${notes}` : ""}`,
        stamp,
      ],
    );
  });

  const recipients = all<{ user_id: string }>(
    "SELECT user_id FROM department_members WHERE department_id = ?",
    [application.department_id],
  );
  if (application.applicant_user_id) recipients.push({ user_id: application.applicant_user_id });
  const seen = new Set<string>();
  for (const recipient of recipients) {
    if (seen.has(recipient.user_id)) continue;
    seen.add(recipient.user_id);
    notify(recipient.user_id, {
      type: `authority_${action}`,
      title:
        action === "approve"
          ? "Your organisation is verified"
          : action === "reject"
            ? "Authority application rejected"
            : action === "suspend"
              ? "Organisation suspended"
              : action === "info_required"
                ? "Additional information required"
                : "Application under review",
      body: notes ?? `${application.organisation_name}: status is now ${orgStatus.replace("_", " ")}.`,
    });
  }

  return Response.json({ id, applicationStatus: appStatus, organisationStatus: orgStatus });
}

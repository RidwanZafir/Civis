import { z } from "zod";
import { all, get, run, transaction } from "@/lib/db";
import { hashPassword, newId, nowIso } from "@/lib/crypto";
import { clientKey, fail, rateLimit, readJson, tooMany } from "@/lib/http";
import { audit, notify } from "@/lib/auth";

const ORG_TYPES = [
  "police",
  "fire",
  "ambulance",
  "municipal",
  "roads",
  "disaster",
  "environment",
  "utility",
  "health",
  "other",
] as const;

const schema = z.object({
  organisationName: z.string().trim().min(3).max(120),
  organisationType: z.enum(ORG_TYPES),
  department: z.string().trim().max(120).optional(),
  country: z.string().trim().min(2).max(80),
  division: z.string().trim().max(80).optional(),
  district: z.string().trim().max(80).optional(),
  officeAddress: z.string().trim().min(5).max(240),
  website: z.string().trim().max(160).optional(),
  contactNumber: z.string().trim().min(6).max(40),
  officialEmail: z.string().trim().email(),
  repName: z.string().trim().min(2).max(120),
  repDesignation: z.string().trim().max(120).optional(),
  repEmail: z.string().trim().email(),
  repPhone: z.string().trim().max(40).optional(),
  repRole: z.string().trim().max(120).optional(),
  documents: z.string().trim().max(2000).optional(),
  password: z.string().min(10, "Use at least 10 characters"),
});

/**
 * Public authority registration. This deliberately does NOT create an active
 * authority: the organisation is stored as `pending`, an application is opened
 * for administrator review, and the account cannot reach authority features
 * until that application is approved.
 */
export async function POST(req: Request) {
  const limit = rateLimit(clientKey(req, "authority-register"), 5, 60_000);
  if (!limit.allowed) return tooMany(limit.retryAfterMs);

  const parsed = schema.safeParse(await readJson<unknown>(req));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid application", 422);
  const data = parsed.data;
  const email = data.repEmail.toLowerCase();

  const existing = get<{ id: string }>("SELECT id FROM users WHERE email = ?", [email]);
  if (existing) return fail("An account already exists for that representative email.", 409);

  const departmentId = newId("org");
  const userId = newId("usr");
  const applicationId = newId("app");
  const stamp = nowIso();

  transaction(() => {
    run(
      `INSERT INTO departments
        (id, name, jurisdiction, email, created_at, type, verification_status, country, division, district,
         address, website, phone, official_email, lat, lng, radius_km, categories)
       VALUES (?,?,?,?,?,?, 'pending', ?,?,?,?,?,?,?, NULL, NULL, 15, NULL)`,
      [
        departmentId,
        data.organisationName,
        data.department ?? data.division ?? null,
        data.officialEmail,
        stamp,
        data.organisationType,
        data.country,
        data.division ?? null,
        data.district ?? null,
        data.officeAddress,
        data.website ?? null,
        data.contactNumber,
        data.officialEmail,
      ],
    );

    run(
      `INSERT INTO users (id, email, password_hash, name, role, department_id, email_verified,
        verify_token, reset_token, reset_expires, notify_email, notify_inapp, public_name,
        anonymous_default, suspended, is_demo, created_at, deleted_at)
       VALUES (?,?,?,?, 'authority', ?, 0, NULL, NULL, NULL, 1, 1, 1, 0, 0, 0, ?, NULL)`,
      [userId, email, hashPassword(data.password), data.repName, departmentId, stamp],
    );

    run(
      `INSERT INTO department_members (id, department_id, user_id, member_role, status, created_at)
       VALUES (?,?,?, 'org_admin', 'active', ?)`,
      [newId("mem"), departmentId, userId, stamp],
    );

    run(
      `INSERT INTO department_applications
        (id, department_id, applicant_user_id, rep_name, rep_designation, rep_email, rep_phone, rep_role,
         documents, status, review_notes, reviewed_by, submitted_at, reviewed_at)
       VALUES (?,?,?,?,?,?,?,?,?, 'pending', NULL, NULL, ?, NULL)`,
      [
        applicationId,
        departmentId,
        userId,
        data.repName,
        data.repDesignation ?? null,
        email,
        data.repPhone ?? null,
        data.repRole ?? null,
        data.documents ?? null,
        stamp,
      ],
    );
  });

  const admins = all<{ id: string }>(
    "SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL AND suspended = 0",
  );
  audit({ id: userId, role: "authority", name: data.repName }, "authority.application_submitted", {
    type: "organisation",
    id: departmentId,
  }, `${data.organisationName} (${data.organisationType})`);
  for (const admin of admins) {
    notify(admin.id, {
      type: "authority_application",
      title: "New authority verification request",
      body: `${data.organisationName} (${data.organisationType}) submitted an application for review.`,
      category: "authority",
      priority: "high",
      actionUrl: "/admin/authorities",
      organisationId: departmentId,
      dedupeKey: `authority_application:${applicationId}:${admin.id}`,
    });
  }

  return Response.json(
    {
      status: "pending",
      applicationId,
      message:
        "Your authority registration is pending verification. You will receive access after CIVIS administrators approve your organisation.",
      administratorsNotified: admins.length,
    },
    { status: 201 },
  );
}

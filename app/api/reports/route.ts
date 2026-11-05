import { z } from "zod";
import { all, get, run, transaction } from "@/lib/db";
import { newId, nowIso, reportRef } from "@/lib/crypto";
import { audit, authorize, notify, notifyFollowers } from "@/lib/auth";
import { clientKey, fail, rateLimit, readJson, tooMany } from "@/lib/http";
import { CATEGORIES, RATE_LIMITS, SEVERITIES } from "@/lib/constants";
import { listReports, mapPoints } from "@/lib/repo";
import { haversineKm } from "@/lib/format";
import { isVideoEvidence } from "@/lib/report-evidence";
import { ownsUploads } from "@/lib/upload-server";
import { routeReport } from "@/lib/routing";

const createSchema = z.object({
  title: z.string().trim().min(8, "Give the report a clear title").max(140),
  description: z.string().trim().min(30, "Describe the problem in at least 30 characters").max(2000),
  category: z.enum(CATEGORIES.map((c) => c.slug) as [string, ...string[]]),
  severity: z.enum(SEVERITIES.map((s) => s.value) as [string, ...string[]]),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().trim().max(200).optional(),
  neighborhood: z.string().trim().max(80).optional(),
  extraInfo: z.string().trim().max(600).optional(),
  anonymous: z.boolean().optional(),
  images: z.array(z.string().startsWith("/api/media/")).max(6).optional(),
  confirmDistinct: z.boolean().optional(),
});

/** `bbox=minLng,minLat,maxLng,maxLat`; ignored unless all four numbers are valid. */
function parseBbox(raw: string | null) {
  if (!raw) return undefined;
  const parts = raw.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return undefined;
  const [minLng, minLat, maxLng, maxLat] = parts;
  if (minLat < -90 || maxLat > 90 || minLng < -180 || maxLng > 180) return undefined;
  if (minLat > maxLat || minLng > maxLng) return undefined;
  return { minLat, maxLat, minLng, maxLng };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const p = url.searchParams;
  const near = p.get("near");
  const filters = {
    q: p.get("q") ?? undefined,
    category: p.get("category") ?? undefined,
    severity: p.get("severity") ?? undefined,
    status: p.get("status") ?? undefined,
    verification: p.get("verification") ?? undefined,
    neighborhood: p.get("neighborhood") ?? undefined,
    from: p.get("from") ?? undefined,
    to: p.get("to") ?? undefined,
    sort: p.get("sort") ?? undefined,
    page: Number(p.get("page") ?? 1),
    pageSize: Number(p.get("pageSize") ?? 12),
    near: near
      ? {
          lat: Number(near.split(",")[0]),
          lng: Number(near.split(",")[1]),
        }
      : undefined,
    bbox: parseBbox(p.get("bbox")),
  };

  if (p.get("mode") === "map") {
    return Response.json({ points: mapPoints(filters) });
  }

  const result = listReports(filters);
  return Response.json({
    items: result.items,
    total: result.total,
    page: filters.page,
    pageSize: filters.pageSize,
    hasMore: filters.page * filters.pageSize < result.total,
  });
}

export async function POST(req: Request) {
  const auth = await authorize(["citizen", "moderator", "authority", "admin"]);
  if (!auth.ok) return fail(auth.message, auth.status);

  const limit = rateLimit(clientKey(req, "report"), 12, 60_000);
  if (!limit.allowed) return tooMany(limit.retryAfterMs);

  const parsed = createSchema.safeParse(await readJson<unknown>(req));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid report", 422);
  const data = parsed.data;
  if (!(await ownsUploads(auth.user.id, data.images ?? []))) {
    return fail("One or more attachments are missing or were not uploaded by this account. Please upload them again.", 422);
  }

  // Duplicate detection: same category, verified, within 120m in the last 30 days.
  const candidates = all<{
    id: string;
    title: string;
    lat: number;
    lng: number;
    created_at: string;
    verification: string;
  }>(
    `SELECT id, title, lat, lng, created_at, verification FROM reports
     WHERE category_slug = ? AND created_at >= ? AND verification IN ('community_verified','officially_confirmed')`,
    [data.category, new Date(Date.now() - 30 * 86_400_000).toISOString()],
  );
  const duplicate = candidates.find(
    (c) => haversineKm({ lat: data.lat, lng: data.lng }, { lat: c.lat, lng: c.lng }) < 0.12,
  );

  if (duplicate && !data.confirmDistinct) {
    return Response.json(
      {
        error: "A verified report already exists at this location for the same category.",
        duplicate: {
          id: duplicate.id,
          title: duplicate.title,
          distanceMeters: Math.round(
            haversineKm({ lat: data.lat, lng: data.lng }, { lat: duplicate.lat, lng: duplicate.lng }) * 1000,
          ),
        },
        hint: "Open the existing report to support it, or resend with confirmDistinct: true if this is a different problem.",
      },
      { status: 409 },
    );
  }

  const id = reportRef();
  const createdAt = nowIso();

  transaction(() => {
    run(
      `INSERT INTO reports (id, title, description, category_slug, severity, status, verification,
        lat, lng, address, neighborhood, extra_info, user_id, anonymous, department_id,
        duplicate_of, credibility, is_demo, created_at, updated_at, resolved_at)
       VALUES (?,?,?,?,?, 'submitted', 'unverified', ?,?,?,?,?,?,?, NULL, ?, ?, 0, ?, ?, NULL)`,
      [
        id,
        data.title,
        data.description,
        data.category,
        data.severity,
        data.lat,
        data.lng,
        data.address ?? null,
        data.neighborhood ?? null,
        data.extraInfo ?? null,
        auth.user.id,
        data.anonymous ? 1 : 0,
        duplicate?.id ?? null,
        duplicate ? 25 : 45,
        createdAt,
        createdAt,
      ],
    );

    (data.images ?? []).forEach((url) => {
      run(
        "INSERT INTO report_images (id, report_id, url, kind, caption, created_at) VALUES (?,?,?,?,?,?)",
        [newId("img"), id, url, "evidence", isVideoEvidence(url) ? "Reporter video" : "Reporter photograph", createdAt],
      );
    });

    run(
      `INSERT INTO report_status_history
       (id, report_id, from_status, to_status, note, actor_id, actor_role, actor_label, created_at)
       VALUES (?,?,NULL,'submitted',?,?,?,?,?)`,
      [
        newId("hist"),
        id,
        "Report submitted and queued for automated checks.",
        auth.user.id,
        auth.user.role,
        auth.user.name,
        createdAt,
      ],
    );

    notify(auth.user.id, {
      type: "report_submitted",
      title: "Report received",
      body: `${id} is queued for automated checks and moderator review.`,
      reportId: id,
    });
  });

  audit(
    { id: auth.user.id, role: auth.user.role, name: auth.user.name },
    "report.created",
    { type: "report", id },
    data.title,
  );
  // Route to a verified organisation by category + geography. A report is only
  // ever described as delivered when an assignment row actually exists.
  const routing = routeReport(id);
  if (routing.routed) {
    run("UPDATE reports SET status = 'authority_notified', updated_at = ? WHERE id = ?", [nowIso(), id]);
    run(
      `INSERT INTO report_status_history
        (id, report_id, from_status, to_status, note, actor_id, actor_role, actor_label, created_at)
       VALUES (?,?, 'submitted', 'authority_notified', ?, NULL, 'system', 'CIVIS routing', ?)`,
      [newId("hist"), id, routing.reason, nowIso()],
    );
    notify(auth.user.id, {
      type: "report_routed",
      title: "Delivered to a verified authority",
      body: `${id} was routed to ${routing.organisationName}.`,
      reportId: id,
    });
  } else {
    notify(auth.user.id, {
      type: "report_awaiting_authority",
      title: "Awaiting authority assignment",
      body: `${id} is stored in the CIVIS central queue. No verified authority covers this location yet, so no organisation has received it.`,
      reportId: id,
    });
  }

  notifyFollowers(id, {
    type: "report_nearby",
    title: "New report in a neighbourhood you follow",
    body: data.title,
  });

  return Response.json(
    {
      id,
      url: `/incidents/${id}`,
      duplicate: duplicate ? duplicate.id : null,
      routing: {
        routed: routing.routed,
        organisation: routing.organisationName,
        message: routing.reason,
      },
    },
    { status: 201 },
  );
}

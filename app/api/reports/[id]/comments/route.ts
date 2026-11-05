import { z } from "zod";
import { all, get, run } from "@/lib/db";
import { newId, nowIso } from "@/lib/crypto";
import { audit, authorize, notify } from "@/lib/auth";
import { clientKey, fail, rateLimit, readJson, tooMany } from "@/lib/http";

const schema = z.object({ body: z.string().trim().min(2, "Comment is too short").max(1200) });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const comments = all(
    `SELECT c.id, c.body, c.created_at, u.name AS author, u.role
     FROM report_comments c LEFT JOIN users u ON u.id = c.user_id
     WHERE c.report_id = ? AND c.hidden = 0 ORDER BY c.created_at ASC`,
    [id],
  );
  return Response.json({ comments });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await authorize();
  if (!auth.ok) return fail(auth.message, auth.status);

  const limit = rateLimit(clientKey(req, `comment:${auth.user.id}`), 12, 60_000);
  if (!limit.allowed) return tooMany(limit.retryAfterMs);

  const parsed = schema.safeParse(await readJson<unknown>(req));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid comment", 422);

  const report = get<{ user_id: string | null; title: string }>(
    "SELECT user_id, title FROM reports WHERE id = ?",
    [id],
  );
  if (!report) return fail("Report not found.", 404);

  const commentId = newId("cmt");
  run(
    "INSERT INTO report_comments (id, report_id, user_id, body, hidden, created_at) VALUES (?,?,?,?,0,?)",
    [commentId, id, auth.user.id, parsed.data.body, nowIso()],
  );

  if (report.user_id && report.user_id !== auth.user.id) {
    notify(report.user_id, {
      type: "comment",
      title: "New comment on your report",
      body: parsed.data.body.slice(0, 140),
      reportId: id,
    });
  }
  audit({ id: auth.user.id, role: auth.user.role, name: auth.user.name }, "comment.created", {
    type: "report",
    id,
  });

  return Response.json(
    {
      comment: {
        id: commentId,
        body: parsed.data.body,
        author: auth.user.name,
        role: auth.user.role,
        created_at: nowIso(),
      },
    },
    { status: 201 },
  );
}

import { z } from "zod";
import { authorize } from "@/lib/auth";
import { fail, readJson } from "@/lib/http";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationsRead,
  NOTIFICATION_CATEGORIES,
  unreadCountsByCategory,
  unreadNotificationCount,
  type NotificationFilter,
} from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseFilter(value: string | null): NotificationFilter {
  if (!value || value === "all") return "all";
  if (value === "unread") return "unread";
  return (NOTIFICATION_CATEGORIES as string[]).includes(value)
    ? (value as NotificationFilter)
    : "all";
}

export async function GET(request: Request) {
  const auth = await authorize();
  if (!auth.ok) return fail(auth.message, auth.status);

  const params = new URL(request.url).searchParams;
  const filter = parseFilter(params.get("filter"));
  const query = params.get("q") ?? undefined;
  const limit = Number(params.get("limit") ?? "60");

  const notifications = listNotifications(auth.user.id, {
    filter,
    query,
    limit: Number.isFinite(limit) ? limit : 60,
  });

  return Response.json(
    {
      notifications,
      unread: unreadNotificationCount(auth.user.id),
      byCategory: unreadCountsByCategory(auth.user.id),
      filter,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

const schema = z.object({
  ids: z.array(z.string()).max(200).optional(),
  all: z.boolean().optional(),
});

export async function POST(req: Request) {
  const auth = await authorize();
  if (!auth.ok) return fail(auth.message, auth.status);

  const parsed = schema.safeParse(await readJson<unknown>(req));
  if (!parsed.success) return fail("Invalid request.", 422);

  if (parsed.data.all) {
    markAllNotificationsRead(auth.user.id);
  } else if (parsed.data.ids?.length) {
    markNotificationsRead(auth.user.id, parsed.data.ids);
  } else {
    return fail("Nothing to mark.", 400);
  }

  // History is never deleted by marking as read; only read_at changes.
  return Response.json({
    ok: true,
    unread: unreadNotificationCount(auth.user.id),
    byCategory: unreadCountsByCategory(auth.user.id),
  });
}

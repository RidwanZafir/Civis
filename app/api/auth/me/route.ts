import { getCurrentUser, unreadNotificationCount } from "@/lib/auth";
import { json } from "@/lib/http";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return json({ user: null, unread: 0 });
  return json({ user, unread: unreadNotificationCount(user.id) });
}

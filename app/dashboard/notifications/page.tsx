import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Footer } from "@/components/footer";
import { NotificationsList } from "@/components/notifications-list";
import { getCurrentUser } from "@/lib/auth";
import {
  listNotifications,
  unreadCountsByCategory,
  unreadNotificationCount,
} from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Notification centre" };

const SCOPE: Record<string, string> = {
  admin: "Applications awaiting verification, reports with no authority, routing failures, Blood Connect moderation and platform alerts.",
  authority: "Reports routed to your organisation, officer assignments, hospital updates and blood requests in your area.",
  moderator: "Reports awaiting moderation, flagged content and Blood Connect requests that need verification.",
  citizen: "Updates on the incidents you submit or follow, and blood requests near you.",
};

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in?next=/dashboard/notifications");

  const items = listNotifications(user.id, { limit: 100 });
  const unread = unreadNotificationCount(user.id);
  const byCategory = unreadCountsByCategory(user.id);

  return (
    <>
      <div className="relative pt-28 sm:pt-32">
        <div className="mx-auto max-w-[860px] px-5">
          <p className="eyebrow mb-2">Notification centre</p>
          <h1 className="text-[clamp(1.6rem,3.4vw,2.2rem)] font-semibold">What needs your attention</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
            {SCOPE[user.role] ?? SCOPE.citizen} Alerts are stored against your account, so they survive a
            sign-out and never disappear just because you opened the dashboard.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[860px] px-5 py-8">
        <NotificationsList items={items} unread={unread} initialByCategory={byCategory} />
      </div>

      <Footer />
    </>
  );
}

import type { Metadata } from "next";
import { Feed } from "@/components/feed";
import { Footer } from "@/components/footer";
import { ButtonLink, DemoNote } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { listReports } from "@/lib/repo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Community reports",
  description: "Browse, support and follow public infrastructure reports submitted by the community.",
};

export default async function CommunityPage() {
  const user = await getCurrentUser();
  const { items, total } = listReports({ pageSize: 9, sort: "latest" });
  const supported = user
    ? all<{ report_id: string }>("SELECT report_id FROM report_support WHERE user_id = ?", [user.id]).map(
        (r) => r.report_id,
      )
    : [];

  return (
    <>
      <div className="relative pt-28 sm:pt-32">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_30%_0%,rgba(67,214,160,0.10),transparent)]" />
        <div className="relative mx-auto max-w-[1240px] px-5">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <p className="eyebrow mb-3">Community</p>
              <h1 className="text-[clamp(1.9rem,4.4vw,2.9rem)] font-semibold leading-[1.08]">
                Reports from people who live there.
              </h1>
              <p className="mt-3 text-[14px] leading-relaxed text-muted">
                Every submission is shown with its verification state. Support the reports that
                affect your street, follow the ones you care about, and add context only if you
                have seen it yourself.
              </p>
            </div>
            <ButtonLink href="/report" size="md" className="shrink-0">
              Report an issue
            </ButtonLink>
          </div>
          <div className="mt-6 max-w-2xl">
            <DemoNote />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1240px] px-5 py-10">
        <Feed
          initialItems={items}
          initialTotal={total}
          supportedIds={supported}
          viewerId={user?.id ?? null}
        />
      </div>

      <Footer />
    </>
  );
}

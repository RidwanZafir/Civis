import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Footer } from "@/components/footer";
import { ModerationBoard } from "@/components/staff/moderation-board";
import { Panel, Stat } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { moderationQueue } from "@/lib/repo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Moderation" };

export default async function ModerationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in?next=/moderation");

  if (user.role !== "moderator" && user.role !== "admin") {
    return (
      <>
        <div className="mx-auto max-w-xl px-5 pb-24 pt-40">
          <Panel className="p-7 text-center">
            <h1 className="text-lg font-semibold">Restricted workspace</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Moderation tools are limited to moderator and administrator accounts. Permission checks
              run on the server for every verification action.
            </p>
            <Link
              href="/dashboard"
              className="mt-5 inline-block rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-ink"
            >
              Back to my dashboard
            </Link>
          </Panel>
        </div>
        <Footer />
      </>
    );
  }

  const { pending, flagged, duplicateCandidates } = moderationQueue();

  return (
    <>
      <div className="relative pt-28 sm:pt-32">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(60%_100%_at_30%_0%,rgba(67,214,160,0.10),transparent)]" />
        <div className="relative mx-auto max-w-[1100px] px-5">
          <p className="eyebrow mb-2">Moderation</p>
          <h1 className="text-[clamp(1.7rem,3.6vw,2.4rem)] font-semibold">Evidence and trust</h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">
            Approving a report marks it community verified and includes it in public safety
            statistics. It never claims an authority has confirmed or fixed anything.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] px-5 py-8">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Awaiting review" value={pending.length} accent="#36D9FF" />
          <Stat label="Critical in queue" value={pending.filter((p) => p.severity === "critical").length} accent="#F16D78" />
          <Stat label="Duplicate signals" value={duplicateCandidates.length} accent="#F5B94B" />
          <Stat label="Reported content" value={flagged.length} />
        </div>

        <div className="mt-8">
          <ModerationBoard
            pending={pending}
            flags={flagged}
            duplicates={duplicateCandidates}
          />
        </div>
      </div>

      <Footer />
    </>
  );
}

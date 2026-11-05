import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Footer } from "@/components/footer";
import { BloodModeration } from "@/components/staff/blood-moderation";
import { getCurrentUser } from "@/lib/auth";
import { bloodStats, moderationBloodQueue } from "@/lib/blood/repo";
import { BLOOD_SAFETY_NOTICE } from "@/lib/blood/compat";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Blood Connect management" };

export default async function BloodModerationPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in?next=/moderation/blood");
  if (user.role !== "moderator" && user.role !== "admin") redirect("/dashboard");

  const queue = moderationBloodQueue();
  const stats = bloodStats();

  return (
    <>
      <div className="mx-auto max-w-[980px] px-5 pt-28 sm:pt-32">
        <p className="eyebrow mb-2">Blood Connect management</p>
        <h1 className="text-[clamp(1.5rem,3.4vw,2rem)] font-semibold">Verify requests before donors are alerted</h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted">
          A request is never labelled verified automatically. Checking the contact number and hospital before
          verification prevents fake requests from mobilising donors.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-muted">
          {[
            ["Pending", stats.pending],
            ["Active", stats.open],
            ["Critical", stats.critical],
            ["Fulfilled", stats.fulfilled],
            ["Donors", stats.donors],
          ].map(([label, value]) => (
            <span key={String(label)} className="rounded-full border border-white/10 px-2.5 py-1">
              {label}: <span className="tabular-nums text-fg">{value}</span>
            </span>
          ))}
          <Link href="/moderation" className="ml-auto text-accent underline underline-offset-4">Back to moderation</Link>
        </div>
      </div>

      <div className="mx-auto max-w-[980px] px-5 py-8">
        <BloodModeration pending={queue.pending} recent={queue.recent} />
        <p className="mt-8 text-[10.5px] leading-relaxed text-muted">{BLOOD_SAFETY_NOTICE}</p>
      </div>

      <Footer />
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Droplets, HeartPulse, ShieldCheck } from "lucide-react";
import { Footer } from "@/components/footer";
import { BloodFeed } from "@/components/blood/blood-feed";
import { ButtonLink } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { bloodStats, expireStaleRequests } from "@/lib/blood/repo";
import { BLOOD_SAFETY_NOTICE } from "@/lib/blood/compat";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Blood Connect",
  description: "CIVIS Blood Connect — a community that gives life. Request blood, register as a donor, and respond to needs near you.",
};

export default async function BloodPage() {
  const user = await getCurrentUser();
  expireStaleRequests();
  const stats = bloodStats();

  return (
    <>
      <div className="relative overflow-hidden pt-28 sm:pt-32">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[320px] bg-[radial-gradient(90%_120%_at_50%_0%,rgba(241,109,120,0.14),transparent_65%)]" />
        <div className="relative mx-auto max-w-[1120px] px-5">
          <p className="eyebrow mb-3 flex items-center gap-2 text-crit"><Droplets size={14} aria-hidden /> Blood Connect</p>
          <h1 className="max-w-2xl text-[clamp(1.9rem,4.4vw,2.8rem)] font-semibold leading-[1.08]">A community that gives life.</h1>
          <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-muted">
            Publish a real blood requirement, register as a voluntary donor, and let compatible people nearby know.
            Every request is moderated, every contact detail stays protected, and donations always happen through a
            hospital or licensed blood bank.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <ButtonLink href="/blood/new">
              <Droplets size={14} aria-hidden /> Request blood
            </ButtonLink>
            <ButtonLink href="/blood/donor" variant="secondary">
              <HeartPulse size={14} aria-hidden /> Become a donor
            </ButtonLink>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-muted">
              <ShieldCheck size={13} aria-hidden /> {stats.open} active · {stats.donors} donors registered
            </span>
          </div>

          {!user && (
            <p className="mt-3 text-[11.5px] text-muted">
              Browsing is open. <Link href="/auth/sign-in?next=/blood" className="text-accent underline underline-offset-4">Sign in</Link> to request, donate or receive alerts.
            </p>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-[1120px] px-5 py-8">
        <BloodFeed initialViewer={user ? { id: user.id, role: user.role } : null} />
        <p className="mt-8 text-[11px] leading-relaxed text-muted">{BLOOD_SAFETY_NOTICE}</p>
      </div>

      <Footer />
    </>
  );
}

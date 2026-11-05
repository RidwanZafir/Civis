import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Footer } from "@/components/footer";
import { HospitalLinkReview } from "@/components/staff/hospital-link-review";
import { Panel, Stat } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { allHospitalLinks, hospitalLinkStats } from "@/lib/hospitals/repo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Hospital availability links" };

export default async function AdminHospitalsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in?next=/admin/hospitals");

  if (user.role !== "admin") {
    return (
      <>
        <div className="mx-auto max-w-xl px-5 pb-24 pt-40">
          <Panel className="p-7 text-center">
            <h1 className="text-lg font-semibold">Administrator access required</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Hospital availability links can only be reviewed by CIVIS platform administrators. Your role is{" "}
              <strong className="text-fg">{user.role}</strong>.
            </p>
            <Link href="/dashboard" className="mt-5 inline-block rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-ink">
              Back to my dashboard
            </Link>
          </Panel>
        </div>
        <Footer />
      </>
    );
  }

  const links = allHospitalLinks();
  const stats = hospitalLinkStats();

  return (
    <>
      <div className="relative pt-28 sm:pt-32">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(60%_100%_at_30%_0%,rgba(67,214,160,0.10),transparent)]" />
        <div className="relative mx-auto max-w-[1100px] px-5">
          <p className="eyebrow mb-2">Super admin · health data provenance</p>
          <h1 className="text-[clamp(1.7rem,3.6vw,2.4rem)] font-semibold">Hospital availability links</h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">
            Approve which verified health organisations may publish availability for which hospitals. A link is
            required before any ward, bed or service report can be shown publicly. Revoking a link immediately
            withdraws its report from the facility finder.
          </p>
          <div className="mt-3">
            <Link href="/admin" className="text-[11.5px] text-accent hover:underline">← Back to platform control</Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] px-5 py-8">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Link records" value={stats.total} />
          <Stat label="Pending" value={stats.pending} accent="#F5B94B" />
          <Stat label="Approved" value={stats.approved} accent="#43D6A0" />
          <Stat label="Rejected / revoked" value={stats.rejected} accent="#F16D78" />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          Only approved links can publish availability. The public finder labels reports as organisation-reported
          and withholds bed counts once a report is older than one hour.
        </p>

        <div className="mt-8">
          <HospitalLinkReview links={links} />
        </div>
      </div>

      <Footer />
    </>
  );
}

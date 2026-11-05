import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Footer } from "@/components/footer";
import { HospitalAvailabilityWorkspace } from "@/components/staff/hospital-availability-workspace";
import { Panel, Stat } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { departmentHospitalLinks, healthOrganisation } from "@/lib/hospitals/repo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Hospital availability" };

export default async function AuthorityHospitalsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in?next=/authority/hospitals");

  if (user.role !== "authority") {
    return (
      <>
        <div className="mx-auto max-w-xl px-5 pb-24 pt-40">
          <Panel className="p-7 text-center">
            <h1 className="text-lg font-semibold">Health organisation access required</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Hospital availability reporting is restricted to verified health organisations. Your account role is{" "}
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

  if (user.org_status !== "approved") {
    return (
      <>
        <div className="mx-auto max-w-xl px-5 pb-24 pt-40">
          <Panel className="p-7 text-center">
            <h1 className="text-lg font-semibold">Organisation pending verification</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              {user.department_name ?? "Your organisation"} must be approved before it can report hospital
              availability. This is enforced on the server for every request.
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

  const organisation = healthOrganisation(user.department_id);
  if (!organisation || organisation.type !== "health") {
    return (
      <>
        <div className="mx-auto max-w-xl px-5 pb-24 pt-40">
          <Panel className="p-7 text-center">
            <h1 className="text-lg font-semibold">Health organisation access required</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              {organisation?.name ?? user.department_name ?? "Your organisation"} is registered as a{" "}
              <strong className="text-fg">{organisation?.type ?? "non-health"}</strong> organisation. Hospital
              availability can only be reported by a health provider, so this workspace stays locked.
            </p>
            <Link href="/authority" className="mt-5 inline-block rounded-full border border-white/12 bg-white/[0.04] px-5 py-2.5 text-[13px] font-semibold">
              Back to the response centre
            </Link>
          </Panel>
        </div>
        <Footer />
      </>
    );
  }

  const links = departmentHospitalLinks(organisation.id);
  const approved = links.filter((link) => link.linkStatus === "approved");
  const pending = links.filter((link) => link.linkStatus === "pending");
  const reported = approved.filter((link) => link.availabilityVersion !== null);
  const latest = reported
    .map((link) => link.availabilityUpdatedAt)
    .filter((value): value is string => !!value)
    .sort()
    .at(-1) ?? null;

  return (
    <>
      <div className="relative pt-28 sm:pt-32">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(60%_100%_at_30%_0%,rgba(67,214,160,0.10),transparent)]" />
        <div className="relative mx-auto max-w-[1100px] px-5">
          <p className="eyebrow mb-2">Authority centre · health organisation</p>
          <h1 className="text-[clamp(1.7rem,3.6vw,2.4rem)] font-semibold">Hospital availability desk</h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">
            Publish ward, bed and service availability for hospitals your organisation is authorised to represent.
            Every version is stored with your account, timestamp and source. Public pages never present this as live
            monitoring.
          </p>
          <div className="mt-3 flex flex-wrap gap-4">
            <Link href="/authority" className="text-[11.5px] text-accent hover:underline">← Response centre</Link>
            <Link href="/emergency#nearby-hospitals" className="text-[11.5px] text-accent hover:underline">
              View the public facility finder
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] px-5 py-8">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Approved hospitals" value={approved.length} accent="#43D6A0" />
          <Stat label="Reporting availability" value={reported.length} accent="#36D9FF" />
          <Stat label="Pending links" value={pending.length} accent="#F5B94B" />
          <Stat label="Latest report" value={latest ? dateTime(latest) : "None"} />
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          Latest report shows when the most recently published availability version was saved. A report older than
          one hour is treated as stale and its bed counts are withheld from public view until refreshed.
        </p>

        <div className="mt-8">
          <HospitalAvailabilityWorkspace departmentName={organisation.name} initialLinks={links} />
        </div>
      </div>

      <Footer />
    </>
  );
}

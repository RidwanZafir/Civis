import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Footer } from "@/components/footer";
import { ApplicationReview } from "@/components/staff/application-review";
import { Panel, Stat } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { applicationQueue } from "@/lib/portal";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Authority verification" };

export default async function AdminAuthoritiesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in?next=/admin/authorities");

  if (user.role !== "admin") {
    return (
      <>
        <div className="mx-auto max-w-xl px-5 pb-24 pt-40">
          <Panel className="p-7 text-center">
            <h1 className="text-lg font-semibold">Super administrator access required</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Authorisation review is restricted to CIVIS platform administrators. Your role is{" "}
              <strong className="text-fg">{user.role}</strong>.
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

  const applications = applicationQueue();
  const pending = applications.filter((a) => a.status === "pending").length;
  const approved = applications.filter((a) => a.status === "approved").length;
  const rejected = applications.filter((a) => a.status === "rejected" || a.status === "suspended").length;

  return (
    <>
      <div className="relative pt-28 sm:pt-32">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(60%_100%_at_30%_0%,rgba(67,214,160,0.10),transparent)]" />
        <div className="relative mx-auto max-w-[1100px] px-5">
          <p className="eyebrow mb-2">Super admin · authority management</p>
          <h1 className="text-[clamp(1.7rem,3.6vw,2.4rem)] font-semibold">Verification queue</h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">
            Approving an organisation activates its authority portal access. Rejecting or suspending it
            blocks that access immediately, and every decision is written to the audit log with your
            account and the shared note.
          </p>
          <div className="mt-3">
            <Link href="/admin" className="text-[11.5px] text-accent hover:underline">
              ← Back to platform control
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] px-5 py-8">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Applications" value={applications.length} />
          <Stat label="Pending" value={pending} accent="#F5B94B" />
          <Stat label="Approved" value={approved} accent="#43D6A0" />
          <Stat label="Rejected / suspended" value={rejected} accent="#F16D78" />
        </div>

        <div className="mt-8">
          <ApplicationReview applications={applications} />
        </div>
      </div>

      <Footer />
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Footer } from "@/components/footer";
import { AuthorityBoard } from "@/components/staff/authority-board";
import { Panel, Stat } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { authorityQueue, departments as listDepartments } from "@/lib/repo";
import { authoritySummary } from "@/lib/portal";
import { departmentHospitalLinks, healthOrganisation } from "@/lib/hospitals/repo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Authority response centre" };

export default async function AuthorityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in?next=/authority");

  if (user.role !== "authority" && user.role !== "admin") {
    return (
      <>
        <div className="mx-auto max-w-xl px-5 pt-40 pb-24">
          <Panel className="p-7 text-center">
            <h1 className="text-lg font-semibold">Restricted workspace</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              The authority response centre is available to verified authority accounts and platform
              administrators. Your account role is <strong className="text-fg">{user.role}</strong>.
            </p>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              Role checks are enforced on the server for every action, not only in this interface.
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

  if (user.role === "authority" && user.org_status !== "approved") {
    return (
      <>
        <div className="mx-auto max-w-xl px-5 pt-40 pb-24">
          <Panel className="p-7 text-center">
            <h1 className="text-lg font-semibold">Organisation pending verification</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              {user.department_name ?? "Your organisation"} is still being reviewed by CIVIS
              administrators. Authority features unlock automatically once the application is
              approved — no action is needed from you.
            </p>
            <p className="mt-3 text-[11px] leading-relaxed text-muted">
              This is enforced on the server: authority API calls return 403 until verification
              completes.
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

  const isAdmin = user.role === "admin";
  const summary = authoritySummary(user.department_id, isAdmin);
  const queue = authorityQueue(user.department_id, isAdmin);
  const depts = listDepartments();
  const health = user.role === "authority" ? healthOrganisation(user.department_id) : null;
  const hospitalLinks = health?.type === "health" ? departmentHospitalLinks(health.id) : [];
  const approvedHospitals = hospitalLinks.filter((link) => link.linkStatus === "approved").length;
  const pendingHospitals = hospitalLinks.filter((link) => link.linkStatus === "pending").length;
  const overdue = queue.rows.filter(
    (r) =>
      r.response_count === 0 &&
      r.status !== "resolved" &&
      Date.now() - new Date(r.created_at).getTime() > 7 * 86_400_000,
  ).length;

  return (
    <>
      <div className="relative pt-28 sm:pt-32">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(60%_100%_at_30%_0%,rgba(54,217,255,0.10),transparent)]" />
        <div className="relative mx-auto max-w-[1100px] px-5">
          <p className="eyebrow mb-2">Authority response centre</p>
          <h1 className="text-[clamp(1.7rem,3.6vw,2.4rem)] font-semibold">
            {isAdmin ? "All departments" : user.department_name ?? "Your department"}
          </h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">
            Every action you take here is timestamped, attributed to your account and written to the
            public status history plus the platform audit log.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] px-5 py-8">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Total received" value={summary.total} />
          <Stat label="New" value={summary.newReports} accent="#36D9FF" />
          <Stat label="Pending review" value={summary.pendingReview} accent="#F5B94B" />
          <Stat label="Under investigation" value={summary.investigating} accent="#36D9FF" />
          <Stat label="In progress" value={summary.inProgress} accent="#F5B94B" />
          <Stat label="Resolved" value={summary.resolved} accent="#43D6A0" />
          <Stat label="Urgent" value={summary.urgent} accent="#F16D78" />
          <Stat label="Awaiting assignment" value={summary.awaitingAssignment} accent="#929FB2" />
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Every figure above is counted from the reports assigned to this organisation. Overdue
          (7+ days, no response): {overdue}.
        </p>

        {health?.type === "health" && (
          <div className="mt-6 flex flex-col justify-between gap-3 rounded-2xl border border-mint/20 bg-mint/[0.04] p-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-[13px] font-semibold">Hospital availability desk</p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
                {approvedHospitals > 0
                  ? `Publish ward, bed and service availability for ${approvedHospitals} approved hospital${approvedHospitals === 1 ? "" : "s"}.`
                  : "Request a hospital link before publishing ward, bed and service availability."}
                {pendingHospitals > 0 ? ` ${pendingHospitals} link request${pendingHospitals === 1 ? "" : "s"} awaiting administrator review.` : ""}
              </p>
            </div>
            <Link
              href="/authority/hospitals"
              className="inline-flex shrink-0 items-center justify-center rounded-full border border-mint/30 bg-mint/10 px-4 py-2 text-[12px] font-medium text-mint transition-colors hover:bg-mint/15"
            >
              Open availability desk
            </Link>
          </div>
        )}

        <div className="mt-8">
          <AuthorityBoard
            rows={queue.rows}
            departments={depts}
            isAdmin={isAdmin}
            departmentName={user.department_name}
          />
        </div>
      </div>

      <Footer />
    </>
  );
}

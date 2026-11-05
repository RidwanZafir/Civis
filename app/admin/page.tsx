import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Footer } from "@/components/footer";
import { AdminConsole } from "@/components/staff/admin-console";
import { DemoNote, Panel, Stat } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { adminUsers, auditLogs, departments as listDepartments, overview } from "@/lib/repo";
import { applicationQueue } from "@/lib/portal";
import { pendingHospitalLinkCount } from "@/lib/hospitals/repo";
import { dateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin console" };

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in?next=/admin");

  if (user.role !== "admin") {
    return (
      <>
        <div className="mx-auto max-w-xl px-5 pb-24 pt-40">
          <Panel className="p-7 text-center">
            <h1 className="text-lg font-semibold">Administrator access required</h1>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Only administrator accounts can manage users, departments and permissions. Your role is{" "}
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

  const users = adminUsers();
  const depts = listDepartments();
  const logs = auditLogs(40);
  const stats = overview();
  const pendingApplications = applicationQueue().filter((application) => application.status === "pending").length;
  const pendingHospitalLinks = pendingHospitalLinkCount();

  return (
    <>
      <div className="relative pt-28 sm:pt-32">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(60%_100%_at_30%_0%,rgba(241,109,120,0.08),transparent)]" />
        <div className="relative mx-auto max-w-[1100px] px-5">
          <p className="eyebrow mb-2">Administration</p>
          <h1 className="text-[clamp(1.7rem,3.6vw,2.4rem)] font-semibold">Platform control</h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-muted">
            Manage roles, departments and suspensions. Every change is written to the audit log with
            the acting account and timestamp.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] px-5 py-8">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Accounts" value={users.length} />
          <Stat label="Reports stored" value={stats.submitted} accent="#36D9FF" />
          <Stat label="Verified incidents" value={stats.verified} accent="#43D6A0" />
          <Stat label="Demonstration rows" value={stats.demoRows} accent="#F5B94B" />
        </div>

        <div className="mt-4 flex flex-col justify-between gap-3 rounded-2xl border border-accent/20 bg-accent/[0.04] p-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-[13px] font-semibold">Hospital availability links</p>
            <p className="mt-0.5 text-[11.5px] text-muted">
              {pendingHospitalLinks > 0
                ? `${pendingHospitalLinks} hospital link request${pendingHospitalLinks === 1 ? "" : "s"} awaiting review.`
                : "No health organisation is waiting to link a hospital."}
            </p>
          </div>
          <Link
            href="/admin/hospitals"
            className="inline-flex shrink-0 items-center justify-center rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-[12px] font-medium text-accent transition-colors hover:bg-accent/15"
          >
            Review hospital links
          </Link>
        </div>

        <div className="mt-4 flex flex-col justify-between gap-3 rounded-2xl border border-warn/20 bg-warn/[0.04] p-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-[13px] font-semibold">Authority verification queue</p>
            <p className="mt-0.5 text-[11.5px] text-muted">
              {pendingApplications > 0
                ? `${pendingApplications} application${pendingApplications === 1 ? "" : "s"} awaiting administrator review.`
                : "No applications are waiting for review."}
            </p>
          </div>
          <Link
            href="/admin/authorities"
            className="inline-flex shrink-0 items-center justify-center rounded-full border border-warn/30 bg-warn/10 px-4 py-2 text-[12px] font-medium text-warn transition-colors hover:bg-warn/15"
          >
            Open verification queue
          </Link>
        </div>

        <div className="mt-8">
          <AdminConsole initialUsers={users} departments={depts} currentUserId={user.id} />
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <Panel className="p-5">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">
              Departments
            </h2>
            <ul className="mt-3 space-y-2">
              {depts.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 text-[12px]">
                  <span>{d.name}</span>
                  <span className="text-[10.5px] text-muted">{d.jurisdiction ?? "City-wide"}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <DemoNote />
            </div>
          </Panel>

          <Panel className="p-5">
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">
              Audit log
            </h2>
            <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {logs.length === 0 && <p className="text-[12px] text-muted">No actions recorded yet.</p>}
              {logs.map((l) => (
                <div key={l.id} className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10.5px] text-accent">{l.action}</span>
                    <span className="text-[10px] text-muted">{dateTime(l.created_at)}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {l.actor_label ?? "system"} · {l.actor_role ?? "—"}
                    {l.target_type ? ` · ${l.target_type} ${l.target_id ?? ""}` : ""}
                  </p>
                  {l.detail && <p className="mt-0.5 text-[10.5px] text-muted/80">{l.detail}</p>}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <Footer />
    </>
  );
}

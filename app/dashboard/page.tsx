import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Footer } from "@/components/footer";
import { Badge, ButtonLink, EmptyState, Panel, Stat } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { myDashboard, notificationsFor } from "@/lib/repo";
import { category, severityMeta, statusMeta, verificationMeta } from "@/lib/constants";
import { timeAgo } from "@/lib/format";
import { bloodStats, donorProfile, listBloodRequests } from "@/lib/blood/repo";
import { urgencyMeta } from "@/lib/blood/compat";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My reports" };

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/sign-in?next=/dashboard");

  const { rows, totals } = myDashboard(user.id);
  const notifications = notificationsFor(user.id).slice(0, 4);
  const donor = donorProfile(user.id);
  const nearbyBlood = listBloodRequests(
    {
      lat: donor?.latitude ?? null,
      lng: donor?.longitude ?? null,
      radius: 25,
      limit: 3,
    },
    user,
  );
  const blood = bloodStats();
  const staffLink =
    user.role === "authority"
      ? { href: "/authority", label: "Authority centre" }
      : user.role === "moderator"
        ? { href: "/moderation", label: "Moderation queue" }
        : user.role === "admin"
          ? { href: "/admin", label: "Admin console" }
          : null;

  return (
    <>
      <div className="relative pt-28 sm:pt-32">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(60%_100%_at_40%_0%,rgba(54,217,255,0.10),transparent)]" />
        <div className="relative mx-auto max-w-[1100px] px-5">
          <p className="eyebrow mb-2">Your account</p>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-[clamp(1.7rem,3.6vw,2.4rem)] font-semibold">
                {user.name.split(" ")[0]}&rsquo;s reports
              </h1>
              <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-muted">
                Everything you have submitted, with its current recorded state. Status changes appear
                here as soon as a moderator or authority records them.
              </p>
            </div>
            <div className="flex gap-2">
              {staffLink && (
                <ButtonLink href={staffLink.href} variant="secondary" size="sm">
                  {staffLink.label}
                </ButtonLink>
              )}
              <ButtonLink href="/report" size="sm">
                New report
              </ButtonLink>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1100px] px-5 py-8">
        <Panel className="mb-6 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[15px] font-semibold">Welcome to CIVIS</h2>
              <p className="mt-1 text-[12.5px] text-muted">Your community. Your safety. Your voice.</p>
            </div>
            <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
              {[
                { href: "/report", label: "Report an incident" },
                { href: "/emergency", label: "Emergency centre" },
                { href: "/emergency#nearby-hospitals", label: "Nearby hospitals" },
                { href: "/blood", label: "Blood Connect" },
                { href: "/explore", label: "Explore the map" },
              ].map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-2.5 text-[12px] transition-colors hover:border-accent/35 hover:text-accent"
                >
                  {action.label}
                </Link>
              ))}
            </div>
          </div>
        </Panel>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Stat label="Submitted" value={totals.total} />
          <Stat label="In review" value={totals.underReview} accent="#36D9FF" />
          <Stat label="Awaiting authority" value={totals.awaitingAuthority} accent="#F5B94B" />
          <Stat label="In progress" value={totals.inProgress} accent="#F5B94B" />
          <Stat label="Resolved" value={totals.resolved} accent="#43D6A0" />
        </div>

        <Panel className="mt-6 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold">Blood needed near you</h2>
              <p className="mt-1 text-[12px] text-muted">
                {donor?.latitude !== null && donor?.latitude !== undefined
                  ? "Active requests within 25 km of your donor area."
                  : "Active requests across CIVIS. Add your area in your donor profile to see distance."}{" "}
                {blood.donors > 0 ? `${blood.donors} voluntary donors are registered.` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <ButtonLink href="/blood" size="sm" variant="secondary">All requests</ButtonLink>
              <ButtonLink href={donor ? "/blood/donor" : "/blood/new"} size="sm">
                {donor ? "Donor profile" : "Request blood"}
              </ButtonLink>
            </div>
          </div>
          {nearbyBlood.length === 0 ? (
            <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-[11.5px] leading-relaxed text-muted">
              No open requests right now. Register as a volunteer donor so compatible requests can reach you.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {nearbyBlood.map((request) => {
                const urgency = urgencyMeta(request.urgency);
                return (
                  <li key={request.id}>
                    <Link href={`/blood/${request.id}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 p-3 transition-colors hover:border-accent/30">
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg text-[11px] font-bold" style={{ color: urgency.color, background: `${urgency.color}14` }}>
                        {request.bloodGroup}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12px]">{request.hospitalName}</span>
                      <span className="text-[10.5px] text-muted">{request.distanceKm !== null ? `${request.distanceKm.toFixed(1)} km · ` : ""}{urgency.label.split(" —")[0]}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">
                Your report history
              </h2>
              <span className="text-[11px] text-muted">{rows.length} total</span>
            </div>

            {rows.length === 0 ? (
              <EmptyState
                title="You have not reported anything yet"
                description="Found a broken streetlight, a dangerous pothole or exposed wiring? It takes about two minutes to file a report."
                action={<ButtonLink href="/report" size="sm">Report an issue</ButtonLink>}
              />
            ) : (
              <div className="space-y-2.5">
                {rows.map((r) => {
                  const stat = statusMeta(r.status);
                  const sev = severityMeta(r.severity);
                  const ver = verificationMeta(r.verification);
                  return (
                    <Link
                      key={r.id}
                      href={`/incidents/${r.id}`}
                      className="panel panel-hover flex items-start gap-3.5 p-3.5"
                    >
                      {r.cover_image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={r.cover_image}
                          alt=""
                          className="size-14 shrink-0 rounded-lg border border-white/10 object-cover"
                        />
                      ) : (
                        <div className="grid size-14 shrink-0 place-items-center rounded-lg border border-white/10 text-[10px] text-muted">
                          No image
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge color={sev.color} dot={false}>
                            {sev.label}
                          </Badge>
                          <span className="text-[10.5px]" style={{ color: stat.color }}>
                            {stat.label}
                          </span>
                          <span className="text-[10.5px] text-muted">· {ver.label}</span>
                        </div>
                        <p className="mt-1 truncate text-[13.5px] font-medium">{r.title}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted">
                          <span>{category(r.category_slug).label}</span>
                          <span>·</span>
                          <span>{r.neighborhood ?? "Unmapped"}</span>
                          <span>·</span>
                          <span>{timeAgo(r.created_at)}</span>
                          {r.response_count > 0 && (
                            <>
                              <span>·</span>
                              <span className="text-mint">official reply</span>
                            </>
                          )}
                        </p>
                      </div>
                      <span className="hidden shrink-0 font-mono text-[10.5px] text-muted sm:block">
                        {r.id}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <Panel className="p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-[12.5px] font-semibold uppercase tracking-wider text-muted">
                  Recent activity
                </h2>
                <Link href="/dashboard/notifications" className="text-[11px] text-accent hover:underline">
                  All
                </Link>
              </div>
              <div className="mt-3 space-y-3">
                {notifications.length === 0 && (
                  <p className="text-[11.5px] text-muted">Nothing yet.</p>
                )}
                {notifications.map((n) => (
                  <div key={n.id} className="flex gap-2.5">
                    <span
                      className={`mt-1.5 size-1.5 shrink-0 rounded-full ${n.read_at ? "bg-white/20" : "bg-accent"}`}
                    />
                    <div className="min-w-0">
                      <p className="text-[12px] leading-snug">{n.title}</p>
                      <p className="mt-0.5 text-[10.5px] text-muted">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel className="p-5">
              <h2 className="text-[12.5px] font-semibold uppercase tracking-wider text-muted">
                Account
              </h2>
              <div className="mt-3 space-y-2 text-[11.5px]">
                <div className="flex justify-between gap-3">
                  <span className="text-muted">Email</span>
                  <span className="truncate">{user.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Confirmed</span>
                  <span className={user.email_verified ? "text-mint" : "text-warn"}>
                    {user.email_verified ? "Yes" : "No"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Role</span>
                  <span className="capitalize">{user.role}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Member since</span>
                  <span>{new Date(user.created_at).getFullYear()}</span>
                </div>
              </div>
              <ButtonLink href="/dashboard/settings" size="sm" variant="secondary" className="mt-4 w-full">
                Manage settings
              </ButtonLink>
            </Panel>
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BeforeAfter } from "@/components/incident/before-after";
import { EvidenceMedia } from "@/components/incident/evidence-media";
import { IncidentInteractions } from "@/components/incident/actions";
import { Footer } from "@/components/footer";
import { Badge, DemoNote, Panel } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { reportDetail, supportState } from "@/lib/repo";
import { category, severityMeta, statusMeta, verificationMeta } from "@/lib/constants";
import { coords, dateTime, timeAgo } from "@/lib/format";
import { isVideoEvidence } from "@/lib/report-evidence";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const detail = reportDetail(id);
  return {
    title: detail?.report.title ?? "Incident",
    description: detail?.report.description.slice(0, 150),
  };
}

export default async function IncidentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = reportDetail(id);
  if (!detail) notFound();

  const user = await getCurrentUser();
  const state = supportState(user?.id ?? null, id);

  const { report, images, comments, history, verifications, responses, assignment, follow_count } = detail;
  const cat = category(report.category_slug);
  const sev = severityMeta(report.severity);
  const stat = statusMeta(report.status);
  const ver = verificationMeta(report.verification);

  const evidence = images.filter((i) => i.kind === "evidence");
  const resolution = images.filter((i) => i.kind === "resolution");
  const isOwner = !!user && user.id === report.user_id;
  const latestResponse = responses[responses.length - 1];

  return (
    <>
      <div className="relative pt-24 sm:pt-28">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-60"
          style={{
            background: `radial-gradient(60% 100% at 30% 0%, ${sev.color}18, transparent)`,
          }}
        />
        <div className="relative mx-auto max-w-[1240px] px-5">
          <nav className="flex items-center gap-2 text-[11px] text-muted" aria-label="Breadcrumb">
            <Link href="/community" className="hover:text-fg">
              Community
            </Link>
            <span>/</span>
            <Link href={`/community?category=${report.category_slug}`} className="hover:text-fg">
              {cat.label}
            </Link>
            <span>/</span>
            <span className="truncate text-fg/70">{report.id}</span>
          </nav>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Badge color={sev.color}>{sev.label} severity</Badge>
            <Badge color={stat.color} dot={false}>
              {stat.label}
            </Badge>
            <Badge color={ver.color} dot={false}>
              {ver.label}
            </Badge>
            {report.is_demo === 1 && (
              <span className="rounded-full border border-warn/35 bg-warn/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-warn">
                Demonstration record
              </span>
            )}
          </div>

          <h1 className="mt-3 max-w-3xl text-[clamp(1.7rem,3.8vw,2.5rem)] font-semibold leading-[1.1]">
            {report.title}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-muted">
            <span>{report.address ?? report.neighborhood ?? "Unmapped location"}</span>
            <span className="flex items-center gap-1.5">
              <span className="size-1 rounded-full bg-muted" />
              {coords(report.lat, report.lng)}
            </span>
            <span>Reported {timeAgo(report.created_at)}</span>
            <span className="font-mono text-[11px]">{report.id}</span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1240px] px-5 py-9">
        <div className="grid gap-7 lg:grid-cols-[1.55fr_1fr]">
          {/* main column */}
          <div className="space-y-6">
            {evidence[0] && (
              <div className="overflow-hidden rounded-[20px] border border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <EvidenceMedia src={evidence[0].url} alt={report.title} className="aspect-[16/9] w-full object-cover" />
              </div>
            )}

            {evidence.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {evidence.slice(1).map((img) => (
                  <div key={img.id} className="overflow-hidden rounded-xl border border-white/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <EvidenceMedia src={img.url} alt={img.caption ?? "Additional report evidence"} className="aspect-square w-full object-cover" />
                  </div>
                ))}
              </div>
            )}

            <Panel className="p-5 sm:p-6">
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">
                What was reported
              </h2>
              <p className="mt-3 whitespace-pre-line text-[14px] leading-relaxed text-fg/90">
                {report.description}
              </p>
              {report.extra_info && (
                <p className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-[12px] text-muted">
                  {report.extra_info}
                </p>
              )}
              <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-white/[0.07] pt-4 text-[12px] sm:grid-cols-4">
                {[
                  ["Category", cat.label],
                  ["Severity", sev.label],
                  ["Neighbourhood", report.neighborhood ?? "—"],
                  ["Credibility", `${report.credibility}/100`],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[10px] uppercase tracking-wider text-muted">{k}</dt>
                    <dd className="mt-0.5 font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </Panel>

            {/* resolution timeline */}
            <Panel className="p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">
                  Resolution timeline
                </h2>
                <span className="text-[11px] text-muted">{history.length} recorded step{history.length === 1 ? "" : "s"}</span>
              </div>
              <ol className="mt-5 space-y-0">
                {history.map((h, i) => {
                  const meta = statusMeta(h.to_status);
                  const last = i === history.length - 1;
                  return (
                    <li key={h.id} className="relative flex gap-3.5 pb-5 last:pb-0">
                      {!last && (
                        <span className="absolute left-[7px] top-4 h-full w-px bg-white/10" aria-hidden />
                      )}
                      <span
                        className="relative z-10 mt-1 size-3.5 shrink-0 rounded-full border-2"
                        style={{
                          borderColor: meta.color,
                          background: last ? meta.color : "#0b1320",
                        }}
                      />
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-medium" style={{ color: meta.color }}>
                          {meta.label}
                        </p>
                        <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{h.note}</p>
                        <p className="mt-1 text-[10.5px] text-muted/70">
                          {dateTime(h.created_at)}
                          {h.actor_label ? ` · ${h.actor_label}` : ""}
                          {h.actor_role ? ` (${h.actor_role})` : ""}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-4 border-t border-white/[0.07] pt-3 text-[10.5px] leading-relaxed text-muted">
                Only stages that were actually recorded appear here. Nothing is inferred or
                backfilled.
              </p>
            </Panel>

            {/* authority response */}
            <Panel className="p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">
                  Authority response
                </h2>
                {assignment && (
                  <Badge color="#36D9FF" dot={false}>
                    {assignment.department}
                  </Badge>
                )}
              </div>

              {responses.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-white/10 p-4">
                  <p className="text-[12px] text-muted">
                    No official response has been published for this incident.
                  </p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted/80">
                    CIVIS never simulates an authority reply. A response appears here only when a
                    verified authority account assigned to this incident publishes one, and every
                    entry carries the responsible department and account.
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {responses.map((r) => (
                    <div key={r.id} className="rounded-xl border border-mint/22 bg-mint/[0.05] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold text-mint">{r.department}</p>
                        <p className="text-[10.5px] text-muted">{dateTime(r.created_at)}</p>
                      </div>
                      <p className="mt-2 text-[13px] leading-relaxed text-fg/90">{r.body}</p>
                      <div className="mt-3 flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full bg-mint" style={{ width: `${r.progress}%` }} />
                        </div>
                        <span className="text-[10.5px] tabular-nums text-muted">{r.progress}%</span>
                      </div>
                      <p className="mt-2 text-[10.5px] text-muted">
                        Published by {r.official}
                        {r.eta ? ` · estimated completion ${r.eta}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {verifications.length > 0 && (
                <div className="mt-5 border-t border-white/[0.07] pt-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                    Verification history
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {verifications.map((v) => (
                      <li key={v.id} className="text-[11.5px] text-muted">
                        <span className="text-fg/80">{v.stage.replace(/_/g, " ")}</span> ·{" "}
                        {v.decision} {v.actor ? `by ${v.actor}` : ""} · {timeAgo(v.created_at)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>

            {report.status === "resolved" && evidence[0] && resolution[0] && (
              <Panel className="p-5 sm:p-6">
                <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">
                  Before &amp; after
                </h2>
                <p className="mt-1 text-[11.5px] text-muted">
                  Drag the handle to compare the reported condition with the recorded resolution.
                </p>
                <div className="mt-4">
                  {isVideoEvidence(evidence[0].url) || isVideoEvidence(resolution[0].url) ? (
                    <div className="grid gap-3 sm:grid-cols-2"><EvidenceMedia src={evidence[0].url} alt="Reported evidence" className="aspect-video w-full rounded-xl object-cover" /><EvidenceMedia src={resolution[0].url} alt="Resolution evidence" className="aspect-video w-full rounded-xl object-cover" /></div>
                  ) : <BeforeAfter before={evidence[0].url} after={resolution[0].url} />}
                </div>
              </Panel>
            )}

            {resolution.length > 0 && report.status !== "resolved" && (
              <Panel className="p-5">
                <p className="text-[12px] text-muted">
                  {resolution.length} resolution photograph{resolution.length === 1 ? "" : "s"} recorded.
                </p>
              </Panel>
            )}

            <Panel className="p-5 sm:p-6">
              <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">
                Verification model
              </h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {[
                  ["Community submitted", "Anyone can submit. Shown immediately with an unverified label."],
                  ["Under review", "A moderator checks evidence, location and possible duplicates."],
                  ["Community verified", "Independent neighbours confirmed it on site."],
                  ["Officially confirmed", "A responsible authority account accepted the incident."],
                ].map(([title, body]) => (
                  <div key={title} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                    <p className="text-[11.5px] font-semibold">{title}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted">{body}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10.5px] leading-relaxed text-muted">
                Community confirmation and official confirmation are tracked separately and are never
                merged into one score.
              </p>
            </Panel>
          </div>

          {/* sidebar */}
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            <Panel className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted">Current status</p>
                  <p className="mt-1 text-[15px] font-semibold" style={{ color: stat.color }}>
                    {stat.label}
                  </p>
                </div>
                <span
                  className="grid size-10 place-items-center rounded-full border"
                  style={{ borderColor: `${sev.color}44`, background: `${sev.color}12` }}
                >
                  <span className="size-2.5 rounded-full" style={{ background: sev.color }} />
                </span>
              </div>

              <div className="mt-4 space-y-2 border-t border-white/[0.07] pt-4 text-[11.5px]">
                <div className="flex justify-between">
                  <span className="text-muted">Supporters</span>
                  <span className="tabular-nums">{report.supporters}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Followers</span>
                  <span className="tabular-nums">{follow_count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Comments</span>
                  <span className="tabular-nums">{report.comment_count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Assigned to</span>
                  <span className="text-right">{assignment?.department ?? "Not assigned"}</span>
                </div>
              </div>

              {latestResponse && (
                <div className="mt-4 rounded-lg border border-white/[0.08] p-2.5">
                  <p className="text-[10px] uppercase tracking-wider text-muted">Work progress</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full bg-mint" style={{ width: `${latestResponse.progress}%` }} />
                    </div>
                    <span className="text-[10px] tabular-nums text-muted">{latestResponse.progress}%</span>
                  </div>
                </div>
              )}

              <div className="mt-5">
                <IncidentInteractions
                  reportId={report.id}
                  initialSupported={state.supported}
                  initialFollowing={state.following}
                  initialSupporters={report.supporters}
                  initialComments={comments.map((c) => ({
                    id: c.id,
                    body: c.body,
                    author: c.author,
                    role: c.role,
                    created_at: c.created_at,
                  }))}
                  viewer={user ? { id: user.id, name: user.name, role: user.role } : null}
                  isOwner={isOwner}
                />
              </div>
            </Panel>

            <Panel className="p-5">
              <p className="text-[10px] uppercase tracking-wider text-muted">Reported by</p>
              <p className="mt-1.5 text-[13px] font-medium">
                {report.anonymous === 1 ? "Anonymous reporter" : report.reporter_name ?? "Community member"}
              </p>
              <p className="mt-1 text-[11px] text-muted">
                {report.anonymous === 1
                  ? "This reporter chose to hide their identity publicly."
                  : "Name shown with the reporter's privacy settings applied."}
              </p>
              <div className="my-4 h-px bg-white/[0.07]" />
              <p className="text-[10px] uppercase tracking-wider text-muted">Location</p>
              <p className="mt-1 text-[12px]">{report.address ?? report.neighborhood ?? "Not specified"}</p>
              <p className="mt-1 font-mono text-[11px] text-muted">{coords(report.lat, report.lng)}</p>
              <Link
                href="/explore"
                className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-accent underline-offset-4 hover:underline"
              >
                View on the city map
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </Panel>

            <DemoNote />
          </aside>
        </div>
      </div>

      <Footer />
    </>
  );
}

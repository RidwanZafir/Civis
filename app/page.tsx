import Link from "next/link";
import { CityHero } from "@/components/city/CityHero";
import { Counter } from "@/components/counter";
import { Footer } from "@/components/footer";
import { ReportCard } from "@/components/report-card";
import { Badge, ButtonLink, DemoNote, Panel, SectionHeading } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { byCategory, overview, recentReports } from "@/lib/repo";
import { CATEGORIES, category } from "@/lib/constants";
import { percent } from "@/lib/format";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    title: "Discover a problem",
    body: "Walk your neighbourhood, open CIVIS and see what neighbours have already reported. Every problem has a place on the map.",
    accent: "#36D9FF",
    art: (
      <g stroke="#36D9FF" strokeWidth="1.6" fill="none" strokeLinecap="round">
        <circle cx="34" cy="34" r="17" />
        <path d="M46 46l12 12" strokeWidth="2.6" />
        <circle cx="34" cy="34" r="4.5" fill="#36D9FF" stroke="none" />
        <path d="M6 70h18M6 76h10" strokeOpacity="0.35" />
      </g>
    ),
  },
  {
    title: "Report and verify",
    body: "Photograph the issue, drop a pin and describe the risk. Neighbours independently confirm it before it reaches an authority.",
    accent: "#43D6A0",
    art: (
      <g stroke="#43D6A0" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 12h28l8 8v44H20z" />
        <path d="M30 30h16M30 40h16M30 50h9" strokeOpacity="0.55" />
        <circle cx="52" cy="54" r="12" fill="#080D17" />
        <path d="M47 54l4 4 7-8" strokeWidth="2.2" />
      </g>
    ),
  },
  {
    title: "Track real change",
    body: "Follow the incident from review to official response. Every status change is timestamped and attributable.",
    accent: "#F5B94B",
    art: (
      <g stroke="#F5B94B" strokeWidth="1.6" fill="none" strokeLinecap="round">
        <path d="M14 60l14-14 10 8 20-26" />
        <path d="M14 70h52" strokeOpacity="0.3" />
        <circle cx="14" cy="60" r="3.4" fill="#F5B94B" stroke="none" />
        <circle cx="28" cy="46" r="3.4" fill="#F5B94B" stroke="none" />
        <circle cx="38" cy="54" r="3.4" fill="#F5B94B" stroke="none" />
        <circle cx="58" cy="28" r="3.4" fill="#F5B94B" stroke="none" />
      </g>
    ),
  },
];

export default async function HomePage() {
  const stats = overview();
  const recent = recentReports(6);
  const cityIncidents = recentReports(9).map((r) => ({
    id: r.id,
    title: r.title,
    lat: r.lat,
    lng: r.lng,
    severity: r.severity,
    status: r.status,
    category: r.category_slug,
    neighborhood: r.neighborhood,
    address: r.address,
  }));
  const cats = byCategory();
  const maxCat = Math.max(1, ...cats.map((c) => c.total));
  const user = await getCurrentUser();
  const supported = user
    ? new Set(
        all<{ report_id: string }>("SELECT report_id FROM report_support WHERE user_id = ?", [user.id]).map(
          (r) => r.report_id,
        ),
      )
    : new Set<string>();

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative min-h-[min(100dvh,900px)] w-full overflow-hidden">
        <div className="absolute inset-0">
          <CityHero incidents={cityIncidents} />
        </div>

        <div className="pointer-events-none relative z-10 mx-auto flex min-h-[min(100dvh,900px)] w-full max-w-[1240px] flex-col justify-center px-5 pb-24 pt-32">
          <div className="max-w-[660px]">
            <Badge className="pointer-events-auto mb-5" color="#43D6A0" dot={false}>
              <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-mint" />
              Community-powered civic intelligence
            </Badge>
            <h1 className="text-[clamp(2.6rem,6.2vw,4.6rem)] font-semibold leading-[0.98] tracking-[-0.03em]">
              Your City
              <br />
              Deserves{" "}
              <span className="bg-gradient-to-r from-accent via-[#7ef0d4] to-mint bg-clip-text text-transparent">
                Better.
              </span>
            </h1>
            <p className="mt-5 max-w-[480px] text-[15px] leading-relaxed text-muted sm:text-[16px]">
              Discover problems around you. Report unsafe infrastructure. Help build safer
              communities through collective action.
            </p>
            <div className="pointer-events-auto mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="/explore" size="lg">
                Explore your city
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M2 8h12M9 3l5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </ButtonLink>
              <ButtonLink href="/report" size="lg" variant="secondary">
                Report an issue
              </ButtonLink>
            </div>

            <div className="pointer-events-auto mt-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-accent" /> Live 3D city model
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-warn" /> {stats.submitted} reports stored
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-mint" /> {stats.communities} neighbourhoods
              </span>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-[88px] left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-2 sm:flex">
          <span className="text-[10px] uppercase tracking-[0.22em] text-muted">Scroll</span>
          <span className="grid h-9 w-5 place-items-start justify-center rounded-full border border-white/20 pt-1.5">
            <span className="block size-1.5 rounded-full bg-accent [animation:scroll-dot_1.8s_ease-in-out_infinite]" />
          </span>
        </div>
      </section>

      {/* ── Headline statistics ───────────────────────────────── */}
      <section className="relative border-y border-white/[0.06] bg-ink-soft/40">
        <div className="mx-auto grid max-w-[1240px] grid-cols-2 gap-px px-0 md:grid-cols-4">
          {[
            { label: "Community reports", value: stats.submitted, hint: "All submissions" },
            { label: "Issues resolved", value: stats.resolved, hint: "Verified and closed" },
            { label: "Active safety concerns", value: stats.unresolved, hint: "Verified, still open" },
            { label: "Neighbourhoods", value: stats.communities, hint: "Participating areas" },
          ].map((s) => (
            <div key={s.label} className="px-6 py-7">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                {s.label}
              </p>
              <p className="mt-2 text-[clamp(1.8rem,3.4vw,2.5rem)] font-semibold leading-none">
                <Counter value={s.value} />
              </p>
              <p className="mt-1.5 text-[11px] text-muted">{s.hint}</p>
            </div>
          ))}
        </div>
        <div className="mx-auto max-w-[1240px] px-5 pb-5">
          <DemoNote />
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section className="mx-auto max-w-[1240px] px-5 py-20 sm:py-24">
        <SectionHeading
          eyebrow="How CIVIS works"
          title="Three steps from a broken streetlight to a real repair."
          description="CIVIS is built around evidence and accountability. Nothing is marked resolved without a recorded, attributable action."
          action={
            <ButtonLink href="/about" variant="secondary" size="sm">
              Read the model
            </ButtonLink>
          }
        />
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <Panel key={step.title} hover className="group relative overflow-hidden p-6">
              <div className="flex items-start justify-between">
                <div
                  className="grid size-[76px] place-items-center rounded-2xl border"
                  style={{
                    borderColor: `${step.accent}33`,
                    background: `radial-gradient(120% 120% at 30% 20%, ${step.accent}18, transparent 70%)`,
                  }}
                >
                  <svg width="68" height="80" viewBox="0 0 80 84" aria-hidden>
                    {step.art}
                  </svg>
                </div>
                <span className="text-[11px] font-semibold tabular-nums text-muted/60">
                  0{i + 1}
                </span>
              </div>
              <h3 className="mt-5 text-[15px] font-semibold">{step.title}</h3>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">{step.body}</p>
              <span
                className="absolute inset-x-6 bottom-0 h-px opacity-0 transition-opacity group-hover:opacity-100"
                style={{ background: `linear-gradient(90deg, transparent, ${step.accent}88, transparent)` }}
              />
            </Panel>
          ))}
        </div>
      </section>

      {/* ── Recently reported ────────────────────────────────── */}
      <section className="mx-auto max-w-[1240px] px-5 pb-20 sm:pb-24">
        <SectionHeading
          eyebrow="Recently reported"
          title="What neighbours are finding right now."
          description="Community submissions appear immediately, clearly marked as unverified until independent confirmation is recorded."
          action={
            <ButtonLink href="/community" variant="secondary" size="sm">
              Open the feed
            </ButtonLink>
          }
        />
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {recent.map((report, i) => (
            <ReportCard
              key={report.id}
              report={report}
              viewerId={user?.id ?? null}
              initialSupported={supported.has(report.id)}
              index={i}
            />
          ))}
        </div>
      </section>

      {/* ── Community impact ─────────────────────────────────── */}
      <section className="border-y border-white/[0.06] bg-ink-soft/30">
        <div className="mx-auto grid max-w-[1240px] gap-12 px-5 py-20 lg:grid-cols-[1fr_1.05fr] sm:py-24">
          <div>
            <SectionHeading
              eyebrow="Community impact"
              title="Where the reports are, and what happened next."
              description="These figures are computed directly from verified records in the CIVIS database. Unverified submissions are excluded from every resolution metric."
            />
            <div className="mt-8 grid grid-cols-2 gap-4">
              <Panel className="p-5">
                <p className="text-[11px] uppercase tracking-wider text-muted">Resolution rate</p>
                <p className="mt-1.5 text-3xl font-semibold text-mint">{stats.resolutionRate}%</p>
                <p className="mt-1 text-[11px] text-muted">Resolved ÷ verified incidents</p>
              </Panel>
              <Panel className="p-5">
                <p className="text-[11px] uppercase tracking-wider text-muted">First response</p>
                <p className="mt-1.5 text-3xl font-semibold">
                  {stats.avgResponseDays === null ? "—" : `${stats.avgResponseDays}d`}
                </p>
                <p className="mt-1 text-[11px] text-muted">Average, submission to reply</p>
              </Panel>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge color="#43D6A0">{stats.verified} verified</Badge>
              <Badge color="#F5B94B">{stats.unresolved} open</Badge>
              <Badge color="#F16D78">{stats.rejected} rejected</Badge>
            </div>
            <div className="mt-6">
              <ButtonLink href="/insights" size="sm">
                Explore safety intelligence
              </ButtonLink>
            </div>
          </div>

          <Panel className="p-6">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold">Reports by category</p>
              <span className="text-[10px] uppercase tracking-wider text-muted">All submissions</span>
            </div>
            <div className="mt-5 space-y-3.5">
              {cats.slice(0, 8).map((c) => {
                const meta = category(c.category_slug);
                const width = percent(c.total, maxCat);
                return (
                  <div key={c.category_slug} className="group">
                    <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[11px]">
                      <span className="flex items-center gap-2 text-muted">
                        <span className="size-1.5 rounded-full" style={{ background: meta.color }} />
                        {meta.label}
                      </span>
                      <span className="tabular-nums text-muted">
                        <span className="font-semibold text-fg">{c.total}</span>
                        <span className="ml-1.5 text-[10px]">· {c.resolved} resolved</span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                      <div
                        className="h-full rounded-full transition-all duration-500 group-hover:brightness-125"
                        style={{
                          width: `${width}%`,
                          background: `linear-gradient(90deg, ${meta.color}55, ${meta.color})`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-6 border-t border-white/[0.06] pt-4 text-[11px] leading-relaxed text-muted">
              {CATEGORIES.length} categories are tracked. Resolved counts include only records whose
              status history contains a recorded resolution.
            </p>
          </Panel>
        </div>
      </section>

      {/* ── Call to action ───────────────────────────────────── */}
      <section className="mx-auto max-w-[1240px] px-5 py-20 sm:py-28">
        <div className="relative overflow-hidden rounded-[28px] border border-white/[0.08] bg-[radial-gradient(120%_140%_at_15%_0%,rgba(54,217,255,0.16),transparent_55%),radial-gradient(100%_120%_at_85%_20%,rgba(67,214,160,0.12),transparent_60%)] px-6 py-14 text-center sm:px-16 sm:py-20">
          <div className="pointer-events-none absolute inset-0 grid-noise opacity-40" />
          <div className="relative">
            <p className="eyebrow mb-4">Start somewhere small</p>
            <h2 className="mx-auto max-w-2xl text-[clamp(1.9rem,4.2vw,3rem)] font-semibold leading-[1.06]">
              A better city starts with one report.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-muted">
              It takes about two minutes. One photograph, one pin, one description — and your
              neighbourhood has a record that cannot be ignored.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <ButtonLink href="/report" size="lg">
                Start reporting
              </ButtonLink>
              <ButtonLink href="/community" size="lg" variant="secondary">
                See community reports
              </ButtonLink>
            </div>
            <p className="mt-6 text-[11px] text-muted">
              Prefer to look first?{" "}
              <Link href="/explore" className="text-accent underline-offset-4 hover:underline">
                Open the interactive map
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}

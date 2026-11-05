import type { Metadata } from "next";
import Link from "next/link";
import { PrintClientButton } from "@/components/print-button";
import {
  byCategory,
  byNeighborhood,
  bySeverity,
  monthlyTrend,
  overview,
} from "@/lib/repo";
import { category, severityMeta } from "@/lib/constants";
import { shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Transparency report" };

export default async function TransparencyReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const filters = {
    category: sp.category,
    severity: sp.severity,
    neighborhood: sp.neighborhood,
    from: sp.from,
    to: sp.to,
    status: sp.status,
  };
  const o = overview(filters);
  const cats = byCategory(filters);
  const sevs = bySeverity(filters);
  const hoods = byNeighborhood(filters);
  const months = monthlyTrend(filters);
  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-[820px] px-6 py-28 print:max-w-none print:px-0 print:py-0">
      <div className="mb-8 flex items-center justify-between print:hidden">
        <Link href="/insights" className="text-[12px] text-muted hover:text-fg">
          ← Back to safety intelligence
        </Link>
        <PrintClientButton />
      </div>

      <header className="border-b border-white/10 pb-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
          CIVIS · Public transparency report
        </p>
        <h1 className="mt-2 text-2xl font-semibold">Public infrastructure safety statistics</h1>
        <p className="mt-2 text-[12px] text-muted">
          Generated {stamp} · Filtered by{" "}
          {Object.entries(filters)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ") || "no filters (whole dataset)"}
        </p>
      </header>

      <section className="mt-6">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">Summary</h2>
        <table className="mt-3 w-full text-left text-[12px]">
          <tbody>
            {[
              ["Reports submitted", o.submitted, "All submissions, including unverified reports"],
              ["Verified incidents", o.verified, "Community verified or officially confirmed"],
              ["Resolved incidents", o.resolved, `Resolution rate ${o.resolutionRate}%`],
              ["Unresolved verified incidents", o.unresolved, "Verified, not resolved or rejected"],
              ["Rejected reports", o.rejected, "Not accepted after review"],
              ["Average first response", o.avgResponseDays === null ? "—" : `${o.avgResponseDays} days`, "Submission to first official response"],
              ["Neighbourhoods represented", o.communities, "Distinct neighbourhoods with reports"],
              ["Demonstration records", o.demoRows, "Seeded sample data, not real incidents"],
            ].map(([label, value, note]) => (
              <tr key={String(label)} className="border-b border-white/[0.07]">
                <td className="py-2 pr-4 align-top font-medium">{label}</td>
                <td className="py-2 pr-4 align-top tabular-nums">{value}</td>
                <td className="py-2 align-top text-muted">{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-7">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">By category</h2>
        <table className="mt-3 w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-muted">
              <th className="py-1.5 font-semibold">Category</th>
              <th className="py-1.5 font-semibold">Submitted</th>
              <th className="py-1.5 font-semibold">Verified</th>
              <th className="py-1.5 font-semibold">Resolved</th>
            </tr>
          </thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c.category_slug} className="border-b border-white/[0.05]">
                <td className="py-1.5">{category(c.category_slug).label}</td>
                <td className="py-1.5 tabular-nums">{c.total}</td>
                <td className="py-1.5 tabular-nums">{c.verified}</td>
                <td className="py-1.5 tabular-nums">{c.resolved}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-7">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">By severity</h2>
        <table className="mt-3 w-full text-left text-[12px]">
          <tbody>
            {sevs.map((s) => (
              <tr key={s.severity} className="border-b border-white/[0.05]">
                <td className="py-1.5">{severityMeta(s.severity).label}</td>
                <td className="py-1.5 tabular-nums">{s.total} reports</td>
                <td className="py-1.5 tabular-nums text-muted">{s.resolved} resolved</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-7">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">
          By neighbourhood
        </h2>
        <table className="mt-3 w-full text-left text-[12px]">
          <tbody>
            {hoods.map((h) => (
              <tr key={h.neighborhood} className="border-b border-white/[0.05]">
                <td className="py-1.5">{h.neighborhood}</td>
                <td className="py-1.5 tabular-nums">{h.total} submitted</td>
                <td className="py-1.5 tabular-nums">{h.verified} verified</td>
                <td className="py-1.5 tabular-nums text-muted">{h.resolved} resolved</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-7">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">
          Monthly trend
        </h2>
        <table className="mt-3 w-full text-left text-[12px]">
          <tbody>
            {months.map((m) => (
              <tr key={m.month} className="border-b border-white/[0.05]">
                <td className="py-1.5">{m.month}</td>
                <td className="py-1.5 tabular-nums">{m.submitted} submitted</td>
                <td className="py-1.5 tabular-nums">{m.verified} verified</td>
                <td className="py-1.5 tabular-nums text-muted">{m.resolved} resolved</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mt-8 border-t border-white/10 pt-5 text-[11px] leading-relaxed text-muted">
        <p className="font-semibold text-fg">Method and limitations</p>
        <p className="mt-1.5">
          Verified incidents include community-verified reports and incidents confirmed by an
          authority account. A community-verified incident is corroborated by independent
          contributors; it is not a statement by any department. Official responses appear only when a
          verified authority account assigned to the incident publishes one, and every response is
          attributed and timestamped.
        </p>
        <p className="mt-1.5">
          This report contains aggregate counts only. No reporter names, email addresses, comments or
          precise personal locations are included.
        </p>
        <p className="mt-1.5">
          Data generated on {stamp} from the CIVIS demonstration deployment. Seeded records are marked
          as demonstration data in the platform and are not real incidents.
        </p>
      </section>
    </div>
  );
}

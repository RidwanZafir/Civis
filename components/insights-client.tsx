"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CategoryChart, NeighborhoodChart, SeverityChart, TrendChart } from "@/components/charts";
import { Badge, Button, Input, Panel, Select, Spinner, cx } from "@/components/ui";
import { CATEGORIES, NEIGHBORHOODS, SEVERITIES, STATUS_FLOW } from "@/lib/constants";
import type { Overview } from "@/lib/repo";

export type StatsPayload = {
  overview: Overview;
  categories: { category_slug: string; total: number; verified: number; resolved: number }[];
  neighborhoods: { neighborhood: string; total: number; verified: number; resolved: number; critical: number }[];
  severities: { severity: string; total: number; resolved: number }[];
  monthly: { month: string; submitted: number; verified: number; resolved: number }[];
  statuses: { status: string; n: number }[];
  performance: { department: string; assigned: number; responded: number; avg_days: number | null; resolved: number }[];
};

const EMPTY_FILTERS = { category: "", severity: "", neighborhood: "", from: "", to: "", status: "" };

export function InsightsClient({ initial }: { initial: StatsPayload }) {
  const [data, setData] = useState(initial);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    return params.toString();
  }, [filters]);

  const load = useCallback(async (qs: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stats${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Could not load statistics");
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load statistics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!query) {
      setData(initial);
      return;
    }
    const timer = setTimeout(() => void load(query), 250);
    return () => clearTimeout(timer);
  }, [query, load, initial]);

  const activeFilters = Object.values(filters).filter(Boolean).length;
  const o = data.overview;

  return (
    <div>
      {/* filter bar */}
      <div className="glass sticky top-[84px] z-30 flex flex-wrap items-center gap-2 rounded-2xl p-2.5">
        <Select
          value={filters.category}
          onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
          aria-label="Filter by category"
          className="w-[142px] py-2 text-[12px]"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </Select>
        <Select
          value={filters.severity}
          onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value }))}
          aria-label="Filter by severity"
          className="w-[128px] py-2 text-[12px]"
        >
          <option value="">Any severity</option>
          {SEVERITIES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select
          value={filters.neighborhood}
          onChange={(e) => setFilters((f) => ({ ...f, neighborhood: e.target.value }))}
          aria-label="Filter by neighbourhood"
          className="w-[152px] py-2 text-[12px]"
        >
          <option value="">All neighbourhoods</option>
          {NEIGHBORHOODS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
        <Select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          aria-label="Filter by status"
          className="w-[138px] py-2 text-[12px]"
        >
          <option value="">Any status</option>
          {STATUS_FLOW.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          value={filters.from}
          onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
          aria-label="From date"
          className="w-[136px] py-2 text-[12px]"
        />
        <Input
          type="date"
          value={filters.to}
          onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
          aria-label="To date"
          className="w-[136px] py-2 text-[12px]"
        />

        <div className="ml-auto flex items-center gap-1.5">
          {loading && <Spinner className="size-3.5 text-accent" />}
          {activeFilters > 0 && (
            <button
              onClick={() => setFilters(EMPTY_FILTERS)}
              className="rounded-full px-2.5 py-1.5 text-[11.5px] text-muted transition-colors hover:text-fg"
            >
              Clear
            </button>
          )}
          <a
            href={`/api/stats/export${query ? `?${query}` : ""}`}
            className="rounded-full border border-white/12 px-3 py-1.5 text-[11.5px] font-medium text-fg transition-colors hover:border-accent/40 hover:text-accent"
          >
            Export CSV
          </a>
          <Link
            href={`/insights/report${query ? `?${query}` : ""}`}
            className="rounded-full border border-white/12 px-3 py-1.5 text-[11.5px] font-medium text-fg transition-colors hover:border-accent/40 hover:text-accent"
          >
            Printable report
          </Link>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-crit/30 bg-crit/10 px-3 py-2 text-[12px] text-crit">
          {error}
        </p>
      )}

      {/* KPIs */}
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Reports submitted", value: o.submitted, hint: "All submissions, verified or not", color: undefined },
          { label: "Verified incidents", value: o.verified, hint: "Community verified or officially confirmed", color: "#43D6A0" },
          { label: "Resolved", value: o.resolved, hint: `Resolution rate ${o.resolutionRate}%`, color: "#F5B94B" },
          { label: "Avg first response", value: o.avgResponseDays === null ? "—" : `${o.avgResponseDays}d`, hint: "Submission to first official reply", color: undefined },
        ].map((k) => (
          <Panel key={k.label} className="p-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">{k.label}</p>
            <p className="mt-2 text-[26px] font-semibold leading-none tabular-nums" style={k.color ? { color: k.color } : undefined}>
              {k.value}
            </p>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">{k.hint}</p>
          </Panel>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Panel className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold">Reporting trend</h2>
            <Badge color="#929FB2" dot={false}>
              by month
            </Badge>
          </div>
          <p className="mt-1 text-[11px] text-muted">
            Submissions, verified incidents and resolutions per month.
          </p>
          <div className="mt-3">
            {data.monthly.length === 0 ? (
              <p className="py-12 text-center text-[12px] text-muted">No data for this filter.</p>
            ) : (
              <TrendChart data={data.monthly} />
            )}
          </div>
        </Panel>

        <Panel className="p-5">
          <h2 className="text-[13px] font-semibold">Severity mix</h2>
          <p className="mt-1 text-[11px] text-muted">Distribution of reported severity levels.</p>
          <div className="mt-2">
            {data.severities.length === 0 ? (
              <p className="py-12 text-center text-[12px] text-muted">No data for this filter.</p>
            ) : (
              <SeverityChart data={data.severities} />
            )}
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel className="p-5">
          <h2 className="text-[13px] font-semibold">Categories</h2>
          <p className="mt-1 text-[11px] text-muted">
            Faded bars are all submissions; bright bars are verified incidents.
          </p>
          <div className="mt-3">
            <CategoryChart data={data.categories} />
          </div>
        </Panel>

        <Panel className="p-5">
          <h2 className="text-[13px] font-semibold">Neighbourhood comparison</h2>
          <p className="mt-1 text-[11px] text-muted">
            Volume, verification and resolution by neighbourhood.
          </p>
          <div className="mt-3">
            <NeighborhoodChart data={data.neighborhoods} />
          </div>
        </Panel>
      </div>

      <Panel className="mt-4 overflow-hidden">
        <div className="border-b border-white/[0.07] p-5">
          <h2 className="text-[13px] font-semibold">Authority response performance</h2>
          <p className="mt-1 text-[11px] text-muted">
            Derived only from responses published by authority accounts on assigned incidents.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-[12px]">
            <thead>
              <tr className="border-b border-white/[0.07] text-[10px] uppercase tracking-wider text-muted">
                <th className="px-5 py-2.5 font-semibold">Department</th>
                <th className="px-3 py-2.5 font-semibold">Assigned</th>
                <th className="px-3 py-2.5 font-semibold">Responded</th>
                <th className="px-3 py-2.5 font-semibold">Avg days</th>
                <th className="px-3 py-2.5 font-semibold">Resolved</th>
                <th className="px-5 py-2.5 font-semibold">Response rate</th>
              </tr>
            </thead>
            <tbody>
              {data.performance.map((p) => {
                const rate = p.assigned ? Math.round((p.responded / p.assigned) * 100) : 0;
                return (
                  <tr key={p.department} className="border-b border-white/[0.04] last:border-b-0">
                    <td className="px-5 py-2.5">{p.department}</td>
                    <td className="px-3 py-2.5 tabular-nums text-muted">{p.assigned}</td>
                    <td className="px-3 py-2.5 tabular-nums text-muted">{p.responded}</td>
                    <td className="px-3 py-2.5 tabular-nums text-muted">
                      {p.avg_days === null ? "—" : p.avg_days.toFixed(1)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-muted">{p.resolved}</td>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
                          <div
                            className={cx("h-full rounded-full", rate >= 60 ? "bg-mint" : rate >= 30 ? "bg-warn" : "bg-crit")}
                            style={{ width: `${rate}%` }}
                          />
                        </div>
                        <span className="text-[10.5px] tabular-nums text-muted">{rate}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel className="mt-4 p-5">
        <h2 className="text-[12px] font-semibold uppercase tracking-wider text-muted">
          How these numbers are calculated
        </h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {[
            ["Reports submitted", "Every report stored in the database, including unverified submissions and rejected duplicates."],
            ["Verified incidents", "Only reports whose verification state is community verified or officially confirmed. Unverified submissions never enter public safety statistics."],
            ["Resolved", "Verified incidents whose latest recorded status is resolved, with a recorded resolution action."],
            ["Average first response", "Mean time between submission and the first response published by an authority account assigned to the incident."],
            ["Resolution rate", "Resolved verified incidents divided by all verified incidents for the current filter."],
            ["Demonstration data", "Seeded sample records used to demonstrate the platform. They are labelled 'Demo' and are not real incidents or official statements."],
          ].map(([term, def]) => (
            <div key={term}>
              <dt className="text-[11.5px] font-medium">{term}</dt>
              <dd className="mt-0.5 text-[11px] leading-relaxed text-muted">{def}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[10.5px] leading-relaxed text-muted">
          {o.demoRows} of {o.submitted} stored reports in this dataset are demonstration records. No
          personal information is included in exports; aggregated exports contain counts only.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setFilters(EMPTY_FILTERS)}>
            Reset all filters
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void load(query)}>
            Refresh data
          </Button>
        </div>
      </Panel>
    </div>
  );
}

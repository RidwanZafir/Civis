"use client";

import { useCallback, useEffect, useState } from "react";
import { ReportCard } from "@/components/report-card";
import { Button, EmptyState, Input, Spinner, cx } from "@/components/ui";
import { CATEGORIES, FEED_SORTS } from "@/lib/constants";
import type { ReportListItem } from "@/lib/repo";

type Sort = "latest" | "supported" | "critical" | "unresolved" | "resolved" | "near";

export function Feed({
  initialItems,
  initialTotal,
  supportedIds,
  viewerId,
}: {
  initialItems: ReportListItem[];
  initialTotal: number;
  supportedIds: string[];
  viewerId: string | null;
}) {
  const [sort, setSort] = useState<Sort>("latest");
  const [categoryValue, setCategoryValue] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState<Set<string>>(new Set(supportedIds));
  const [near, setNear] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);

  const load = useCallback(
    async (nextPage: number, replace: boolean, overrideSort?: Sort, nearParam?: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          page: String(nextPage),
          pageSize: "9",
          sort: overrideSort ?? sort,
        });
        if (categoryValue) params.set("category", categoryValue);
        if (query.trim()) params.set("q", query.trim());
        const nearValue = nearParam !== undefined ? nearParam : near;
        if (nearValue) params.set("near", nearValue);

        const res = await fetch(`/api/reports?${params}`);
        if (!res.ok) throw new Error("Could not load reports");
        const data = await res.json();
        setItems((prev) => (replace ? data.items : [...prev, ...data.items]));
        setTotal(data.total);
        setPage(nextPage);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load reports");
      } finally {
        setLoading(false);
      }
    },
    [sort, categoryValue, query, near],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void load(1, true);
    }, 280);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, categoryValue, query]);

  function requestNear() {
    if (!navigator.geolocation) {
      setGeoError("This browser does not expose a location API.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const value = `${pos.coords.latitude.toFixed(5)},${pos.coords.longitude.toFixed(5)}`;
        setNear(value);
        setSort("near");
        void load(1, true, "near", value);
        setGeoError(null);
      },
      () => setGeoError("Location permission denied. Allow it and try again."),
      { timeout: 9000 },
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {FEED_SORTS.map((s) => (
            <button
              key={s.value}
              onClick={() => {
                if (s.value === "near" && !near) {
                  requestNear();
                  return;
                }
                setSort(s.value as Sort);
              }}
              className={cx(
                "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-all",
                sort === s.value
                  ? "border-accent/45 bg-accent/12 text-accent"
                  : "border-white/10 text-muted hover:border-white/20 hover:text-fg",
              )}
            >
              {s.label}
              {s.value === "near" && loading && sort === "near" && <Spinner className="ml-1.5 size-3" />}
            </button>
          ))}
          <div className="ml-auto w-full sm:w-64">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search reports…"
              aria-label="Search reports"
              className="h-9 py-1.5 text-[12px]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setCategoryValue("")}
            className={cx(
              "rounded-full px-2.5 py-1 text-[11px] transition-colors",
              !categoryValue ? "bg-white/[0.08] text-fg" : "text-muted hover:text-fg",
            )}
          >
            All
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.slug}
              onClick={() => setCategoryValue(categoryValue === c.slug ? "" : c.slug)}
              className={cx(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] transition-colors",
                categoryValue === c.slug ? "bg-white/[0.08] text-fg" : "text-muted hover:text-fg",
              )}
            >
              <span className="size-1.5 rounded-full" style={{ background: c.color }} />
              {c.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 text-[11px] text-muted">
          <span>{total} report{total === 1 ? "" : "s"}</span>
          {near && <span className="text-accent">Sorted by distance from your location</span>}
          {geoError && <span className="text-crit">{geoError}</span>}
        </div>
      </div>

      <div className="mt-7">
        {items.length === 0 && !loading ? (
          <EmptyState
            title="Nothing here yet"
            description="No reports match these filters. Try a different category, or be the first to report a problem in this area."
            action={
              <Button variant="secondary" size="sm" onClick={() => { setCategoryValue(""); setQuery(""); setSort("latest"); }}>
                Reset filters
              </Button>
            }
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((report, i) => (
              <ReportCard
                key={`${report.id}-${i}`}
                report={report}
                viewerId={viewerId}
                initialSupported={supported.has(report.id)}
                index={i % 9}
              />
            ))}
            {loading &&
              Array.from({ length: 3 }).map((_, i) => (
                <div key={`sk-${i}`} className="panel overflow-hidden">
                  <div className="skeleton aspect-[16/10] w-full" />
                  <div className="space-y-2 p-4">
                    <div className="skeleton h-3 w-20 rounded" />
                    <div className="skeleton h-3.5 w-full rounded" />
                    <div className="skeleton h-3 w-2/3 rounded" />
                  </div>
                </div>
              ))}
          </div>
        )}

        {error && <p className="mt-4 text-center text-xs text-crit">{error}</p>}

        {items.length > 0 && items.length < total && (
          <div className="mt-8 flex justify-center">
            <Button
              variant="secondary"
              onClick={() => void load(page + 1, false)}
              disabled={loading}
            >
              {loading ? <Spinner className="size-3.5" /> : null}
              {loading ? "Loading…" : `Load more (${total - items.length} remaining)`}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

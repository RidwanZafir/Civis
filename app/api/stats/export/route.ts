import { byCategory, byNeighborhood, bySeverity, monthlyTrend, overview } from "@/lib/repo";
import { toCsv } from "@/lib/format";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const filters = {
    category: p.get("category") ?? undefined,
    severity: p.get("severity") ?? undefined,
    neighborhood: p.get("neighborhood") ?? undefined,
    from: p.get("from") ?? undefined,
    to: p.get("to") ?? undefined,
    status: p.get("status") ?? undefined,
  };

  const o = overview(filters);
  const rows: Record<string, unknown>[] = [
    { section: "summary", label: "Reports submitted", value: o.submitted, definition: "All submissions, verified or not" },
    { section: "summary", label: "Verified incidents", value: o.verified, definition: "Community verified or officially confirmed" },
    { section: "summary", label: "Resolved incidents", value: o.resolved, definition: "Verified incidents marked resolved" },
    { section: "summary", label: "Unresolved verified", value: o.unresolved, definition: "Verified incidents not resolved or rejected" },
    { section: "summary", label: "Resolution rate (%)", value: o.resolutionRate, definition: "Resolved ÷ verified" },
    { section: "summary", label: "Average first response (days)", value: o.avgResponseDays ?? "", definition: "Submission to first official response" },
    { section: "summary", label: "Neighbourhoods represented", value: o.communities, definition: "Distinct neighbourhoods with reports" },
    { section: "summary", label: "Demonstration rows", value: o.demoRows, definition: "Seeded sample records (not real incidents)" },
  ];

  byCategory(filters).forEach((c) =>
    rows.push({ section: "category", label: c.category_slug, value: c.total, definition: `${c.verified} verified · ${c.resolved} resolved` }),
  );
  bySeverity(filters).forEach((s) =>
    rows.push({ section: "severity", label: s.severity, value: s.total, definition: `${s.resolved} resolved` }),
  );
  byNeighborhood(filters).forEach((n) =>
    rows.push({ section: "neighbourhood", label: n.neighborhood, value: n.total, definition: `${n.verified} verified · ${n.resolved} resolved · ${n.critical} critical` }),
  );
  monthlyTrend(filters).forEach((m) =>
    rows.push({ section: "monthly", label: m.month, value: m.submitted, definition: `${m.verified} verified · ${m.resolved} resolved` }),
  );

  const csv = toCsv(rows, ["section", "label", "value", "definition"]);
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="civis-safety-statistics-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

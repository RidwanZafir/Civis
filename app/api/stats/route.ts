import {
  byCategory,
  byNeighborhood,
  bySeverity,
  monthlyTrend,
  overview,
  responsePerformance,
  statusBreakdown,
} from "@/lib/repo";

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

  return Response.json({
    filters,
    definitions: {
      submitted: "All reports submitted through CIVIS, including unverified submissions.",
      verified:
        "Reports confirmed either by independent community members or by an authority account. Unverified submissions are excluded.",
      resolved: "Verified incidents whose latest recorded status is resolved.",
      avgResponseDays:
        "Mean time between report submission and the first official authority response.",
      resolutionRate: "Resolved verified incidents divided by verified incidents.",
    },
    overview: overview(filters),
    categories: byCategory(filters),
    neighborhoods: byNeighborhood(filters),
    severities: bySeverity(filters),
    monthly: monthlyTrend(filters),
    statuses: statusBreakdown(filters),
    performance: responsePerformance(),
  });
}

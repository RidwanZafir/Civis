import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import { InsightsClient } from "@/components/insights-client";
import { DemoNote } from "@/components/ui";
import {
  byCategory,
  byNeighborhood,
  bySeverity,
  monthlyTrend,
  overview,
  responsePerformance,
  statusBreakdown,
} from "@/lib/repo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Safety intelligence",
  description:
    "Public infrastructure safety statistics derived from verified community reports, with transparent metric definitions.",
};

export default function InsightsPage() {
  const initial = {
    overview: overview(),
    categories: byCategory(),
    neighborhoods: byNeighborhood(),
    severities: bySeverity(),
    monthly: monthlyTrend(),
    statuses: statusBreakdown(),
    performance: responsePerformance(),
  };

  return (
    <>
      <div className="relative pt-28 sm:pt-32">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_40%_0%,rgba(54,217,255,0.10),transparent)]" />
        <div className="relative mx-auto max-w-[1180px] px-5">
          <p className="eyebrow mb-2">Safety intelligence</p>
          <h1 className="max-w-3xl text-[clamp(1.8rem,4vw,2.7rem)] font-semibold leading-[1.08]">
            What the city reports, and what actually gets fixed.
          </h1>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-muted">
            Every figure below is computed from the CIVIS database. Submissions and independently
            verified incidents are reported separately, and nothing unverified is ever counted as a
            confirmed safety statistic.
          </p>
          <div className="mt-5 max-w-2xl">
            <DemoNote />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1180px] px-5 pb-16 pt-7">
        <InsightsClient initial={initial} />
      </div>

      <Footer />
    </>
  );
}

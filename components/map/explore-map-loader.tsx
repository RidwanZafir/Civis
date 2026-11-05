"use client";

import dynamic from "next/dynamic";
import { Spinner } from "@/components/ui";
import type { ExplorePoint } from "./explore-map";

/**
 * The map library is ~800 kB of WebGL code. Loading it through `next/dynamic`
 * keeps it out of the initial JavaScript for this route, so the page shell,
 * the search bar and the list view paint before the map engine arrives.
 */
const ExploreMap = dynamic(() => import("./explore-map").then((mod) => mod.ExploreMap), {
  ssr: false,
  loading: () => (
    <div className="grid h-[100dvh] w-full place-items-center bg-ink">
      <div className="flex flex-col items-center gap-3 text-muted">
        <Spinner />
        <p className="text-xs">Starting the map engine…</p>
      </div>
    </div>
  ),
});

export function ExploreMapLoader({
  initialPoints,
  viewerId,
}: {
  initialPoints: ExplorePoint[];
  viewerId: string | null;
}) {
  return <ExploreMap initialPoints={initialPoints} viewerId={viewerId} />;
}

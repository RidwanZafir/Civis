import type { Metadata } from "next";
import { ExploreMapLoader } from "@/components/map/explore-map-loader";
import { getCurrentUser } from "@/lib/auth";
import { mapPoints } from "@/lib/repo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Explore the city map",
  description:
    "Explore reported public infrastructure problems, hospitals and blood requests on an interactive map.",
};

export default async function ExplorePage() {
  const user = await getCurrentUser();
  const points = mapPoints().map((point) => ({
    ...point,
    verification: point.verification,
    neighborhood: point.neighborhood ?? null,
  }));

  return (
    <div>
      <ExploreMapLoader initialPoints={points} viewerId={user?.id ?? null} />
    </div>
  );
}

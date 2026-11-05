"use client";

import { useEffect, useState } from "react";
import { MapPin, Navigation, TriangleAlert } from "lucide-react";
import { Spinner, cx } from "@/components/ui";
import { formatDistance } from "@/lib/map/geo";

type Reverse = {
  ok: boolean;
  source: string;
  degraded: boolean;
  place: {
    country: string | null;
    division: string | null;
    district: string | null;
    upazila: string | null;
    locality: string | null;
    road: string | null;
    label: string | null;
  };
  coordinates: { lat: number; lng: number };
  note?: string;
};

/**
 * The location card. A coordinate alone is not an answer to "where am I?", so
 * this resolves the fix to an administrative place name before it is shown as
 * complete.
 */
export function LocationCard({
  fix,
  following,
  onStopFollow,
  onRetry,
  className,
}: {
  fix: { lat: number; lng: number; accuracy: number | null };
  following: boolean;
  onStopFollow: () => void;
  onRetry: () => void;
  className?: string;
}) {
  const [data, setData] = useState<Reverse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setFailed(false);

    fetch(`/api/location/reverse?lat=${fix.lat}&lng=${fix.lng}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("lookup failed"))))
      .then((payload: Reverse) => {
        if (active) setData(payload);
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError" && active) setFailed(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [fix.lat, fix.lng]);

  const place = data?.place;
  const hierarchy = place
    ? [place.upazila, place.district, place.division, place.country].filter(
        (part, index, list): part is string => Boolean(part) && list.indexOf(part) === index,
      )
    : [];

  return (
    <div
      className={cx(
        "rounded-2xl border border-white/12 bg-[#0c131f]/96 p-3.5 text-[12px] backdrop-blur-xl",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.16em] text-accent">
        <MapPin size={12} aria-hidden />
        Your current location
      </p>

      {loading ? (
        <p className="mt-2 flex items-center gap-2 text-muted">
          <Spinner className="size-3.5" /> Identifying place name…
        </p>
      ) : data?.ok && place?.label ? (
        <>
          <p className="mt-2 text-[13.5px] font-medium leading-snug text-fg">{place.label}</p>
          {hierarchy.length > 0 && (
            <p className="mt-1 text-[11px] leading-relaxed text-muted">{hierarchy.join(" · ")}</p>
          )}
          {place.road && <p className="mt-0.5 text-[11px] text-muted">Near {place.road}</p>}
        </>
      ) : (
        <>
          <p className="mt-2 flex items-start gap-1.5 text-warn">
            <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden />
            Location detected — detailed place name unavailable.
          </p>
          {hierarchy.length > 0 && <p className="mt-1 text-[11px] text-muted">{hierarchy.join(" · ")}</p>}
        </>
      )}

      {data?.degraded && (
        <p className="mt-1.5 text-[10.5px] leading-relaxed text-warn">
          {data.note ?? "Approximate administrative area. Boundaries are not available locally."}
        </p>
      )}
      {failed && (
        <p className="mt-1.5 text-[10.5px] text-warn">
          Place-name lookup is unavailable. Coordinates are still accurate.
        </p>
      )}

      <dl className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/[0.07] pt-2 text-[10.5px] text-muted">
        <div>
          <dt className="inline">Coordinates: </dt>
          <dd className="inline font-mono text-fg/90">
            {fix.lat.toFixed(5)}, {fix.lng.toFixed(5)}
          </dd>
        </div>
        <div>
          <dt className="inline">GPS accuracy: </dt>
          <dd className="inline text-fg/90">{formatDistance(fix.accuracy)}</dd>
        </div>
      </dl>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {following ? (
          <button
            type="button"
            onClick={onStopFollow}
            className="flex items-center gap-1.5 rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-muted hover:text-fg"
          >
            <Navigation size={11} aria-hidden /> Stop following
          </button>
        ) : (
          <span className="text-[10.5px] text-muted">Position from your device’s GPS.</span>
        )}
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-muted hover:text-fg"
        >
          Refresh location
        </button>
        {data?.source && data.source !== "none" && (
          <span className="text-[10px] text-muted/80">Names: {data.source}</span>
        )}
      </div>
    </div>
  );
}

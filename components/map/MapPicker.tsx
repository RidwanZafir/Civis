"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as MlMap, Marker } from "maplibre-gl";
import { loadMaplibre, type MapLibreModule } from "@/lib/maplibre";
import { BASEMAP_STYLE_URL, attachBasemapFallback } from "@/lib/basemap";
import { CITY } from "@/lib/constants";
import { Input, Spinner, cx } from "@/components/ui";

export type PickedLocation = { lat: number; lng: number; address?: string };

export function MapPicker({
  value,
  onChange,
  className,
}: {
  value: PickedLocation | null;
  onChange: (value: PickedLocation) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const maplibreRef = useRef<MapLibreModule | null>(null);
  const [ready, setReady] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ label: string; lat: number; lng: number }[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const place = useCallback((lat: number, lng: number, address?: string) => {
    const mod = maplibreRef.current;
    if (!mod || !mapRef.current) return;
    if (!markerRef.current) {
      markerRef.current = new mod.Marker({ color: "#36D9FF", draggable: true })
        .setLngLat([lng, lat])
        .addTo(mapRef.current);
      markerRef.current.on("dragend", () => {
        const pos = markerRef.current!.getLngLat();
        onChangeRef.current({ lat: pos.lat, lng: pos.lng });
      });
    } else {
      markerRef.current.setLngLat([lng, lat]);
    }
    onChangeRef.current({ lat, lng, address });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let map: MlMap | null = null;

    (async () => {
      const mod = await loadMaplibre();
      maplibreRef.current = mod;
      if (cancelled || !containerRef.current) return;
      const instance = new mod.Map({
        container: containerRef.current,
        style: BASEMAP_STYLE_URL,
        center: [value?.lng ?? CITY.center.lng, value?.lat ?? CITY.center.lat],
        zoom: value ? 15 : 11.6,
        attributionControl: { compact: true },
      });
      map = instance;
      mapRef.current = instance;
      attachBasemapFallback(instance);
      instance.addControl(new mod.NavigationControl({ showCompass: false }), "bottom-right");

      instance.on("load", () => {
        setReady(true);
        if (value) place(value.lat, value.lng, value.address);
      });

      instance.on("click", (e) => {
        place(e.lngLat.lat, e.lngLat.lng);
      });
    })();

    return () => {
      cancelled = true;
      markerRef.current = null;
      map?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim().length < 3) return;
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lookup failed");
      setResults(data.results ?? []);
      if (!data.results?.length) setError("No matching place found. Try a landmark or street name.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setSearching(false);
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("This browser does not expose a location API.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 16, duration: 800 });
        place(latitude, longitude, "Current location");
        setLocating(false);
      },
      () => {
        setError("Location permission denied. Drop the pin manually.");
        setLocating(false);
      },
      { timeout: 9000 },
    );
  }

  return (
    <div className={cx("relative", className)}>
      <div className="relative overflow-hidden rounded-[16px] border border-white/10">
        <div ref={containerRef} className="h-[280px] w-full sm:h-[340px]" />

        {!ready && (
          <div className="absolute inset-0 grid place-items-center bg-ink/70">
            <Spinner />
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-2 top-2 z-10">
          <form onSubmit={search} className="pointer-events-auto flex gap-1.5">
            <div className="relative flex-1">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search an address or landmark"
                aria-label="Search an address"
                className="h-9 border-white/12 bg-[#0b1220]/95 py-1.5 pl-3 text-[12px] backdrop-blur"
              />
            </div>
            <button
              type="submit"
              className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/12 bg-[#0b1220]/95 text-muted backdrop-blur transition-colors hover:text-fg"
              aria-label="Search"
            >
              {searching ? <Spinner className="size-3.5" /> : (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              )}
            </button>
            <button
              type="button"
              onClick={useMyLocation}
              className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/12 bg-[#0b1220]/95 text-muted backdrop-blur transition-colors hover:text-accent"
              aria-label="Use my current location"
              title="Use my current location"
            >
              {locating ? <Spinner className="size-3.5" /> : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <circle cx="8" cy="8" r="2.6" stroke="currentColor" strokeWidth="1.4" />
                  <path d="M8 1v2.4M8 12.6V15M1 8h2.4M12.6 8H15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              )}
            </button>
          </form>

          {results.length > 0 && (
            <div className="pointer-events-auto mt-1.5 max-h-40 overflow-y-auto rounded-xl border border-white/12 bg-[#0b1220]/97 p-1 backdrop-blur">
              {results.map((r, i) => (
                <button
                  key={i}
                  onClick={() => {
                    mapRef.current?.flyTo({ center: [r.lng, r.lat], zoom: 16, duration: 700 });
                    place(r.lat, r.lng, r.label);
                    setResults([]);
                  }}
                  className="block w-full rounded-lg px-2.5 py-2 text-left text-[11px] leading-snug text-muted transition-colors hover:bg-white/[0.07] hover:text-fg"
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
          {error && (
            <p className="pointer-events-auto mt-1.5 rounded-lg bg-crit/15 px-2.5 py-1.5 text-[11px] text-crit">
              {error}
            </p>
          )}
        </div>

        <div className="pointer-events-none absolute bottom-2 left-2 z-10 rounded-full bg-black/55 px-2.5 py-1 text-[10px] text-white/70 backdrop-blur">
          Click the map or drag the pin
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <span className="font-mono">
          {value ? `${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}` : "No location selected"}
        </span>
        {value?.address && <span className="max-w-[60%] truncate">{value.address}</span>}
      </div>
    </div>
  );
}

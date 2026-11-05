"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { loadMaplibre } from "@/lib/maplibre";
import { BASEMAP_STYLE_URL, attachBasemapFallback } from "@/lib/basemap";

export type BloodMarkerRequest = {
  id: string;
  code: string;
  bloodGroup: string;
  urgency: string;
  hospitalName: string;
  latitude: number;
  longitude: number;
};

const URGENCY_COLOR: Record<string, string> = {
  critical: "#F16D78",
  urgent: "#F5B94B",
  high: "#36D9FF",
  planned: "#929FB2",
};

/**
 * Request markers only ever sit on the receiving hospital, never on a donor's
 * or patient's home. The map is keyless and uses the same OpenFreeMap style as
 * the rest of CIVIS.
 */
export default function BloodMap({
  center,
  requests,
  selectedId,
  onSelect,
  onFailure,
}: {
  center: { lat: number; lng: number };
  requests: BloodMarkerRequest[];
  selectedId: string | null;
  onSelect: (request: BloodMarkerRequest) => void;
  onFailure: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const callbacks = useRef({ onSelect, onFailure });
  const [ready, setReady] = useState(false);
  callbacks.current = { onSelect, onFailure };

  useEffect(() => {
    let cancelled = false;
    let instance: MapLibreMap | null = null;
    (async () => {
      try {
        const library = await loadMaplibre();
        if (cancelled || !container.current) return;
        instance = new library.Map({
          container: container.current,
          style: BASEMAP_STYLE_URL,
          center: [center.lng, center.lat],
          zoom: 11,
          attributionControl: { compact: true },
        });
        map.current = instance;
        attachBasemapFallback(instance);
        instance.addControl(new library.NavigationControl(), "bottom-left");
        instance.on("error", () => { /* tile errors are handled by the fallback */ });
        instance.on("load", () => { if (!cancelled) setReady(true); });
      } catch {
        if (!cancelled) callbacks.current.onFailure();
      }
    })();
    return () => {
      cancelled = true;
      markers.current.forEach((marker) => marker.remove());
      instance?.remove();
      map.current = null;
    };
    // The instance is created once; markers are updated by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;
    let cancelled = false;
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    (async () => {
      const library = await loadMaplibre();
      if (cancelled) return;
      for (const request of requests) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `blood-map-pin${selectedId === request.id ? " selected" : ""}`;
        button.style.setProperty("--pin-color", URGENCY_COLOR[request.urgency] ?? "#929FB2");
        button.textContent = request.bloodGroup;
        button.title = `${request.bloodGroup} · ${request.hospitalName}`;
        button.setAttribute("aria-label", `${request.bloodGroup} blood request at ${request.hospitalName}`);
        button.addEventListener("click", () => callbacks.current.onSelect(request));
        markers.current.push(
          new library.Marker({ element: button }).setLngLat([request.longitude, request.latitude]).addTo(instance),
        );
      }
      instance.resize();
    })();
    return () => { cancelled = true; };
  }, [requests, selectedId, ready]);

  return <div ref={container} className="blood-map" role="application" aria-label="Active blood requests map" />;
}

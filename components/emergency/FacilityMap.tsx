"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, Marker } from "maplibre-gl";
import { loadMaplibre } from "@/lib/maplibre";
import { BASEMAP_STYLE_URL, attachBasemapFallback } from "@/lib/basemap";
import { FACILITY_COLORS, type Facility, type FacilityLocation, type FacilityRoute } from "@/lib/emergency/facilities-types";

export default function FacilityMap({ location, facilities, selectedId, onSelect, route, onFailure }: {
  location: FacilityLocation; facilities: Facility[]; selectedId: string | null; onSelect: (facility: Facility) => void;
  route: FacilityRoute | null; onFailure: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const callbacks = useRef({ onSelect, onFailure });
  const [ready, setReady] = useState(false);
  const [tileError, setTileError] = useState(false);
  callbacks.current = { onSelect, onFailure };

  useEffect(() => {
    let cancelled = false;
    let instance: MapLibreMap | null = null;
    let disposeContext: (() => void) | null = null;
    (async () => {
      try {
        const library = await loadMaplibre();
        if (cancelled || !container.current) return;
        instance = new library.Map({ container: container.current, style: BASEMAP_STYLE_URL, center: [location.lng, location.lat], zoom: 12, attributionControl: { compact: true } });
        map.current = instance;
        attachBasemapFallback(instance);
        instance.addControl(new library.NavigationControl(), "bottom-left");
        instance.addControl(new library.ScaleControl({ unit: "metric" }), "bottom-left");
        instance.on("error", () => { if (!cancelled) setTileError(true); });
        const canvas = instance.getCanvas();
        const lost = (event: Event) => { event.preventDefault(); if (!cancelled) callbacks.current.onFailure(); };
        canvas.addEventListener("webglcontextlost", lost);
        disposeContext = () => canvas.removeEventListener("webglcontextlost", lost);
        instance.on("load", () => {
          if (!instance || cancelled) return;
          instance.addSource("hospital-route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          instance.addLayer({ id: "hospital-route", type: "line", source: "hospital-route", paint: { "line-color": "#36d9ff", "line-width": 4, "line-opacity": 0.85 } });
          setReady(true);
        });
      } catch { if (!cancelled) callbacks.current.onFailure(); }
    })();
    return () => { cancelled = true; disposeContext?.(); markers.current.forEach((marker) => marker.remove()); instance?.remove(); map.current = null; };
    // The coordinate/marker effects below update an existing instance.
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
      const pin = document.createElement("div");
      pin.className = "facility-map-location";
      pin.setAttribute("aria-label", "Selected search location");
      markers.current.push(new library.Marker({ element: pin }).setLngLat([location.lng, location.lat]).addTo(instance));
      for (const facility of facilities) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `facility-map-pin${selectedId === facility.id ? " selected" : ""}`;
        button.style.setProperty("--pin-color", FACILITY_COLORS[facility.kind]);
        button.textContent = facility.kind === "hospital" || facility.kind === "clinic" ? "+" : facility.kind === "fire" ? "F" : facility.kind === "police" ? "P" : "A";
        button.title = facility.name;
        button.setAttribute("aria-label", `View ${facility.name}`);
        button.addEventListener("click", () => callbacks.current.onSelect(facility));
        markers.current.push(new library.Marker({ element: button }).setLngLat([facility.lng, facility.lat]).addTo(instance));
      }
    })();
    return () => { cancelled = true; };
  }, [facilities, location, selectedId, ready]);

  useEffect(() => {
    if (!ready || !map.current) return;
    map.current.jumpTo({ center: [location.lng, location.lat], zoom: 12 });
  }, [location.lat, location.lng, ready]);

  useEffect(() => {
    if (!ready || !map.current) return;
    const source = map.current.getSource("hospital-route") as GeoJSONSource | undefined;
    source?.setData({ type: "FeatureCollection", features: route ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route.points.map((point) => [point.lng, point.lat]) } }] : [] });
    if (route?.points.length) {
      const points = route.points;
      map.current.fitBounds([[Math.min(...points.map((p) => p.lng)), Math.min(...points.map((p) => p.lat))], [Math.max(...points.map((p) => p.lng)), Math.max(...points.map((p) => p.lat))]], { padding: 65, duration: 0 });
    }
  }, [route, ready]);

  useEffect(() => {
    const selected = facilities.find((facility) => facility.id === selectedId);
    if (selected && map.current && ready && !route) map.current.jumpTo({ center: [selected.lng, selected.lat] });
  }, [selectedId, facilities, ready, route]);

  return <div className="facility-map-surface"><div ref={container} className="h-full w-full" aria-label="Interactive facility map" />{tileError && <p className="facility-map-notice" role="status">Map tiles unavailable. Facility details and directions remain accessible in the list.</p>}</div>;
}

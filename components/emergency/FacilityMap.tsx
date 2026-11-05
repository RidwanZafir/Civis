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
  const facilitiesRef = useRef(facilities);
  facilitiesRef.current = facilities;

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
        instance.on("error", (event) => {
          const message = (event as unknown as { error?: { message?: string } }).error?.message ?? "";
          if (!cancelled && /tile|style|openfreemap|arcgis/i.test(message)) setTileError(true);
        });
        const canvas = instance.getCanvas();
        const lost = (event: Event) => { event.preventDefault(); if (!cancelled) callbacks.current.onFailure(); };
        canvas.addEventListener("webglcontextlost", lost);
        disposeContext = () => canvas.removeEventListener("webglcontextlost", lost);
        instance.on("load", () => {
          if (!instance || cancelled) return;
          instance.addSource("hospital-route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          instance.addLayer({ id: "hospital-route", type: "line", source: "hospital-route", paint: { "line-color": "#36d9ff", "line-width": 4, "line-opacity": 0.85 } });
          // Facilities are drawn as one GPU layer rather than hundreds of DOM
          // markers, which kept the map smooth when panning and selecting.
          instance.addSource("facilities", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
          instance.addLayer({ id: "facility-points", type: "circle", source: "facilities", paint: { "circle-color": ["get", "color"] as never, "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 5, 16, 10] as never, "circle-stroke-color": "#08101c", "circle-stroke-width": 1.5 } });
          instance.addLayer({ id: "facility-selected", type: "circle", source: "facilities", filter: ["==", ["get", "id"], ""], paint: { "circle-color": "rgba(0,0,0,0)", "circle-radius": 15, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5 } });
          instance.on("click", "facility-points", (event) => {
            const id = String(event.features?.[0]?.properties?.id ?? "");
            const facility = facilitiesRef.current.find((item) => item.id === id);
            if (facility) callbacks.current.onSelect(facility);
          });
          instance.on("mouseenter", "facility-points", () => { if (instance) instance.getCanvas().style.cursor = "pointer"; });
          instance.on("mouseleave", "facility-points", () => { if (instance) instance.getCanvas().style.cursor = ""; });
          setReady(true);
        });
      } catch { if (!cancelled) callbacks.current.onFailure(); }
    })();
    return () => { cancelled = true; disposeContext?.(); markers.current.forEach((marker) => marker.remove()); instance?.remove(); map.current = null; };
    // The coordinate/marker effects below update an existing instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The search location keeps a DOM marker; it is a single element.
  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;
    let cancelled = false;
    (async () => {
      const library = await loadMaplibre();
      if (cancelled) return;
      markers.current.forEach((marker) => marker.remove());
      const pin = document.createElement("div");
      pin.className = "facility-map-location";
      pin.setAttribute("aria-label", "Selected search location");
      markers.current = [new library.Marker({ element: pin }).setLngLat([location.lng, location.lat]).addTo(instance)];
    })();
    return () => { cancelled = true; };
  }, [location.lat, location.lng, ready]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready) return;
    const source = instance.getSource("facilities") as GeoJSONSource | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: facilities.map((facility) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [facility.lng, facility.lat] },
        properties: { id: facility.id, color: FACILITY_COLORS[facility.kind] },
      })),
    });
  }, [facilities, ready]);

  useEffect(() => {
    const instance = map.current;
    if (!instance || !ready || !instance.getLayer("facility-selected")) return;
    instance.setFilter("facility-selected", ["==", ["get", "id"], selectedId ?? ""]);
  }, [selectedId, ready]);

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
    if (selected && map.current && ready && !route) map.current.easeTo({ center: [selected.lng, selected.lat], duration: 400 });
  }, [selectedId, facilities, ready, route]);

  return <div className="facility-map-surface"><div ref={container} className="h-full w-full" aria-label="Interactive facility map" />{tileError && <p className="facility-map-notice" role="status">Map tiles unavailable. Facility details and directions remain accessible in the list.</p>}</div>;
}

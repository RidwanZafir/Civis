"use client";

import { useEffect, useMemo, useRef } from "react";
import type { GeoJSONSource, Map as MlMap, Marker } from "maplibre-gl";
import { loadMaplibre } from "@/lib/maplibre";
import { attachBasemapFallback } from "@/lib/basemap";
import { MAP_STYLES } from "@/lib/map/styles";

export type MapHospital = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  category: string;
};

const SYLHET = { lat: 24.95, lng: 91.87 };

const CATEGORY_COLOUR = [
  "match",
  ["get", "category"],
  "medical_college",
  "#f16d78",
  "district_hospital",
  "#f5b94b",
  "upazila_health_complex",
  "#36d9ff",
  "community_clinic",
  "#43d6a0",
  "#5a9cff",
] as never;

/**
 * Regional map. Only facilities with a real coordinate are drawn: a record
 * without one stays in the list rather than being pinned somewhere invented.
 */
export default function HospitalMap({
  hospitals,
  selectedId,
  onSelect,
  fix,
}: {
  hospitals: MapHospital[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  fix: { lat: number; lng: number } | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const userMarker = useRef<Marker | null>(null);
  const callbacks = useRef({ onSelect });
  callbacks.current = { onSelect };

  // Memoised so the data effect below does not re-run on every parent render.
  const placed = useMemo(
    () =>
      hospitals.filter(
        (item) =>
          typeof item.lat === "number" &&
          typeof item.lng === "number" &&
          Math.abs(item.lat) <= 90 &&
          Math.abs(item.lng) <= 180,
      ),
    [hospitals],
  );

  useEffect(() => {
    let cancelled = false;
    let instance: MlMap | null = null;

    (async () => {
      try {
        const mod = await loadMaplibre();
        if (cancelled || !container.current) return;
        instance = new mod.Map({
          container: container.current,
          style: MAP_STYLES[1].url,
          center: [SYLHET.lng, SYLHET.lat],
          zoom: 8.4,
          attributionControl: { compact: true },
          maxZoom: 18,
        });
        mapRef.current = instance;
        attachBasemapFallback(instance);
        instance.addControl(new mod.NavigationControl({ showCompass: false }), "bottom-right");

        instance.on("load", () => {
          if (!instance) return;
          instance.addSource("hospitals", {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
            cluster: true,
            clusterRadius: 44,
            clusterMaxZoom: 13,
          });
          instance.addLayer({
            id: "hospital-clusters",
            type: "circle",
            source: "hospitals",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": "rgba(54,217,255,0.18)",
              "circle-radius": ["step", ["get", "point_count"], 16, 10, 22, 40, 30] as never,
              "circle-stroke-color": "rgba(54,217,255,0.6)",
              "circle-stroke-width": 1.2,
            },
          });
          instance.addLayer({
            id: "hospital-cluster-count",
            type: "symbol",
            source: "hospitals",
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"] as never,
              "text-size": 11.5,
            },
            paint: { "text-color": "#dbe9f7", "text-halo-color": "#0a111d", "text-halo-width": 1 },
          });
          instance.addLayer({
            id: "hospital-points",
            type: "circle",
            source: "hospitals",
            filter: ["!", ["has", "point_count"]],
            paint: {
              "circle-color": CATEGORY_COLOUR,
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 4.5, 16, 8] as never,
              "circle-stroke-color": "#08101c",
              "circle-stroke-width": 1.4,
            },
          });
          instance.addLayer({
            id: "hospital-selected",
            type: "circle",
            source: "hospitals",
            filter: ["==", ["get", "id"], ""],
            paint: {
              "circle-color": "rgba(0,0,0,0)",
              "circle-radius": 14,
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
            },
          });
        });

        instance.on("click", (event) => {
          const map = instance;
          if (!map) return;
          const layers = ["hospital-points", "hospital-clusters"].filter((id) => map.getLayer(id));
          const hits = map.queryRenderedFeatures(event.point, { layers });
          if (!hits.length) return;
          const feature = hits[0];
          if (feature.layer.id === "hospital-clusters") {
            const source = map.getSource("hospitals") as GeoJSONSource | undefined;
            const clusterId = Number(feature.properties?.cluster_id);
            const coordinates = (feature.geometry as { type: "Point"; coordinates: [number, number] }).coordinates;
            if (source && Number.isFinite(clusterId)) {
              source
                .getClusterExpansionZoom(clusterId)
                .then((zoom) => map.flyTo({ center: coordinates, zoom, duration: 500 }))
                .catch(() => map.flyTo({ center: coordinates, zoom: map.getZoom() + 1.5 }));
            }
            return;
          }
          const id = String(feature.properties?.id ?? "");
          if (id) callbacks.current.onSelect(id);
        });

        instance.on("mousemove", (event) => {
          const map = instance;
          if (!map) return;
          const layers = ["hospital-points", "hospital-clusters"].filter((id) => map.getLayer(id));
          map.getCanvas().style.cursor = map.queryRenderedFeatures(event.point, { layers }).length ? "pointer" : "";
        });
      } catch (error) {
        console.warn("[civis:hospitals] map failed", error);
      }
    })();

    return () => {
      cancelled = true;
      userMarker.current?.remove();
      userMarker.current = null;
      instance?.remove();
      mapRef.current = null;
    };
  }, []);

  // Draw the page of facilities currently in the list.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const push = () => {
      const source = map.getSource("hospitals") as GeoJSONSource | undefined;
      if (!source) return;
      source.setData({
        type: "FeatureCollection",
        features: placed.map((item) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [item.lng as number, item.lat as number] },
          properties: { id: item.id, name: item.name, category: item.category },
        })),
      });
    };
    if (map.isStyleLoaded()) push();
    else map.once("load", push);
  }, [placed]);

  // Highlight the selected hospital.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("hospital-selected")) return;
    map.setFilter("hospital-selected", ["==", ["get", "id"], selectedId ?? ""]);
    if (selectedId) {
      const target = placed.find((item) => item.id === selectedId);
      if (target && typeof target.lat === "number" && typeof target.lng === "number") {
        map.easeTo({ center: [target.lng, target.lat], zoom: Math.max(map.getZoom(), 13), duration: 600 });
      }
    }
  }, [selectedId, placed]);

  // Blue dot for the user's real fix, when one exists.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    (async () => {
      const mod = await loadMaplibre();
      if (!fix) {
        userMarker.current?.remove();
        userMarker.current = null;
        return;
      }
      if (!userMarker.current) {
        const element = document.createElement("div");
        element.className = "civis-user-location";
        element.innerHTML = '<span class="civis-user-pulse"></span><span class="civis-user-dot"></span>';
        userMarker.current = new mod.Marker({ element, anchor: "center" })
          .setLngLat([fix.lng, fix.lat])
          .addTo(map);
        map.easeTo({ center: [fix.lng, fix.lat], zoom: 12, duration: 700 });
      } else {
        userMarker.current.setLngLat([fix.lng, fix.lat]);
      }
    })();
  }, [fix]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10">
      <div ref={container} className="h-[420px] w-full sm:h-[520px]" aria-label="Hospital locations across Sylhet Division" />
      {placed.length === 0 && (
        <p className="pointer-events-none absolute inset-x-4 top-4 rounded-xl border border-warn/30 bg-ink/90 px-3 py-2 text-[11.5px] text-warn">
          None of the facilities on this page has a verified coordinate yet. They are listed below; nothing is placed
          at a guessed location.
        </p>
      )}
    </div>
  );
}

"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "./map-shell.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { GeoJSONSource, Map as MlMap, MapMouseEvent, Marker } from "maplibre-gl";
import { loadMaplibre, type MapLibreModule } from "@/lib/maplibre";
import { applyLanguage, attachBasemapFallback } from "@/lib/basemap";
import {
  DEFAULT_MAP_STYLE,
  MAP_STYLES,
  ensurePmtilesProtocol,
  mapStyleUrl,
  type MapStyleId,
} from "@/lib/map/styles";
import { useGeolocation } from "@/lib/map/geolocation";
import { accuracyPolygon, bboxParam, expandBbox, isValidCoordinate, type Bbox } from "@/lib/map/geo";
import {
  GeoStatusBanner,
  LAYER_DEFS,
  MapControlStack,
  MapLayersPanel,
  MapSearchBar,
  type LayerId,
} from "./map-chrome";
import { Badge, EmptyState, Spinner, cx } from "@/components/ui";
import { CITY, category, severityMeta, statusMeta } from "@/lib/constants";
import { timeAgo } from "@/lib/format";

export type ExplorePoint = {
  id: string;
  title: string;
  lat: number;
  lng: number;
  severity: string;
  status: string;
  verification: string;
  category: string;
  neighborhood: string | null;
  supporters: number;
};

type MapFacility = {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lng: number;
  address?: string | null;
};

type MapBloodRequest = {
  id: string;
  code: string;
  bloodGroup: string;
  urgency: string;
  hospitalName: string;
  latitude: number;
  longitude: number;
};

type IncidentDetail = {
  report: ExplorePoint & {
    description: string;
    address: string | null;
    created_at: string;
    department_name?: string | null;
  };
  images: { id: string; url: string; kind: string }[];
  responses: { id: string; body: string; progress: number; created_at: string; department: string }[];
  history: { to_status: string; created_at: string; note: string | null }[];
};

type Selection =
  | { kind: "incident"; id: string }
  | { kind: "facility"; data: MapFacility }
  | { kind: "blood"; data: MapBloodRequest }
  | null;

const SRC = {
  incidents: "civis-incidents",
  facilities: "civis-facilities",
  blood: "civis-blood",
  accuracy: "civis-user-accuracy",
} as const;

const INCIDENT_LAYERS = ["incidents-clusters", "incidents-cluster-count", "incidents-points"];
const FACILITY_LAYERS = ["facilities-points"];
const BLOOD_LAYERS = ["blood-points"];
const ACCURACY_LAYERS = ["user-accuracy-fill", "user-accuracy-line"];
const INTERACTIVE = [...INCIDENT_LAYERS, ...FACILITY_LAYERS, ...BLOOD_LAYERS];

const SEVERITY_COLOR = [
  "match",
  ["get", "severity"],
  "critical",
  "#f16d78",
  "high",
  "#f5b94b",
  "medium",
  "#36d9ff",
  "low",
  "#43d6a0",
  "#929fb2",
] as never;

const FACILITY_COLOR = [
  "match",
  ["get", "kind"],
  "hospital",
  "#5a9cff",
  "clinic",
  "#5a9cff",
  "police",
  "#d4eaff",
  "fire",
  "#f16d78",
  "ambulance",
  "#36d9ff",
  "#5a9cff",
] as never;

const EMPTY = { type: "FeatureCollection" as const, features: [] as never[] };

/** Reuse the style's own font stack so added labels cannot render glyphless. */
function textFont(map: MlMap): string[] {
  const layers = map.getStyle()?.layers ?? [];
  for (const layer of layers) {
    if (layer.type !== "symbol") continue;
    const font = (layer.layout as Record<string, unknown> | undefined)?.["text-font"];
    if (Array.isArray(font) && font.every((entry) => typeof entry === "string")) {
      return font as string[];
    }
  }
  return ["Noto Sans Regular"];
}

export function ExploreMap({
  initialPoints,
  viewerId,
}: {
  initialPoints: ExplorePoint[];
  viewerId: string | null;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const moduleRef = useRef<MapLibreModule | null>(null);
  const userMarker = useRef<Marker | null>(null);
  const centreOnNextFix = useRef(false);

  const geo = useGeolocation();

  const [ready, setReady] = useState(false);
  const [styleEpoch, setStyleEpoch] = useState(0);
  const [styleId, setStyleId] = useState<MapStyleId>(DEFAULT_MAP_STYLE);
  const [lang, setLang] = useState<"en" | "bn">("en");
  const [layers, setLayers] = useState<Record<LayerId, boolean>>({ incidents: true, hospitals: true, blood: true });
  const [layersOpen, setLayersOpen] = useState(false);
  const [filters, setFilters] = useState({ category: "", severity: "", status: "" });

  const [incidents, setIncidents] = useState<ExplorePoint[]>(initialPoints);
  const [facilities, setFacilities] = useState<MapFacility[]>([]);
  const [blood, setBlood] = useState<MapBloodRequest[]>([]);
  const [viewport, setViewport] = useState<Bbox | null>(null);
  const [bearing, setBearing] = useState(0);

  const [selection, setSelection] = useState<Selection>(null);
  const [detail, setDetail] = useState<IncidentDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [view, setView] = useState<"map" | "list">("map");
  const [mapFailed, setMapFailed] = useState(false);
  const [tileError, setTileError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const layersRef = useRef(layers);
  layersRef.current = layers;

  // Kept in a ref so the create effect never re-runs when the style changes.
  const styleIdRef = useRef(styleId);
  styleIdRef.current = styleId;

  /* ---------------- layer installation ---------------- */

  const applyVisibility = useCallback((map: MlMap) => {
    const current = layersRef.current;
    const groups: [LayerId, string[]][] = [
      ["incidents", INCIDENT_LAYERS],
      ["hospitals", FACILITY_LAYERS],
      ["blood", BLOOD_LAYERS],
    ];
    for (const [key, ids] of groups) {
      for (const id of ids) {
        if (!map.getLayer(id)) continue;
        try {
          map.setLayoutProperty(id, "visibility", current[key] ? "visible" : "none");
        } catch {
          /* layer removed between reads */
        }
      }
    }
  }, []);

  const installLayers = useCallback(
    (map: MlMap) => {
      if (!map.isStyleLoaded()) return;

      if (!map.getSource(SRC.accuracy)) {
        map.addSource(SRC.accuracy, { type: "geojson", data: EMPTY });
      }
      if (!map.getSource(SRC.incidents)) {
        map.addSource(SRC.incidents, {
          type: "geojson",
          data: EMPTY,
          cluster: true,
          clusterRadius: 48,
          clusterMaxZoom: 15,
        });
      }
      if (!map.getSource(SRC.facilities)) {
        map.addSource(SRC.facilities, { type: "geojson", data: EMPTY });
      }
      if (!map.getSource(SRC.blood)) {
        map.addSource(SRC.blood, { type: "geojson", data: EMPTY });
      }

      // Accuracy ring sits under every marker so the dot is never obscured.
      if (!map.getLayer("user-accuracy-fill")) {
        map.addLayer({
          id: "user-accuracy-fill",
          type: "fill",
          source: SRC.accuracy,
          paint: { "fill-color": "#2f7bff", "fill-opacity": 0.12 },
        });
      }
      if (!map.getLayer("user-accuracy-line")) {
        map.addLayer({
          id: "user-accuracy-line",
          type: "line",
          source: SRC.accuracy,
          paint: { "line-color": "#2f7bff", "line-width": 1, "line-opacity": 0.5 },
        });
      }

      if (!map.getLayer("incidents-clusters")) {
        map.addLayer({
          id: "incidents-clusters",
          type: "circle",
          source: SRC.incidents,
          filter: ["has", "point_count"],
          paint: {
            "circle-color": "rgba(245,185,75,0.18)",
            "circle-radius": ["step", ["get", "point_count"], 17, 8, 22, 26, 30] as never,
            "circle-stroke-color": "rgba(245,185,75,0.6)",
            "circle-stroke-width": 1.2,
          },
        });
      }
      if (!map.getLayer("incidents-cluster-count")) {
        map.addLayer({
          id: "incidents-cluster-count",
          type: "symbol",
          source: SRC.incidents,
          filter: ["has", "point_count"],
          layout: {
            "text-field": ["get", "point_count_abbreviated"] as never,
            "text-font": textFont(map),
            "text-size": 11.5,
          },
          paint: { "text-color": "#f6e2b3", "text-halo-color": "#0a111d", "text-halo-width": 1 },
        });
      }
      if (!map.getLayer("incidents-points")) {
        map.addLayer({
          id: "incidents-points",
          type: "circle",
          source: SRC.incidents,
          filter: ["!", ["has", "point_count"]],
          paint: {
            "circle-color": SEVERITY_COLOR,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 5, 16, 9] as never,
            "circle-stroke-color": "#08101c",
            "circle-stroke-width": 1.6,
          },
        });
      }
      if (!map.getLayer("facilities-points")) {
        map.addLayer({
          id: "facilities-points",
          type: "circle",
          source: SRC.facilities,
          paint: {
            "circle-color": FACILITY_COLOR,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 4, 16, 7.5] as never,
            "circle-stroke-color": "#08101c",
            "circle-stroke-width": 1.4,
          },
        });
      }
      if (!map.getLayer("blood-points")) {
        map.addLayer({
          id: "blood-points",
          type: "circle",
          source: SRC.blood,
          paint: {
            "circle-color": "#f16d78",
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 5, 16, 9] as never,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.2,
          },
        });
      }

      applyVisibility(map);
    },
    [applyVisibility],
  );

  /* ---------------- map lifecycle ---------------- */

  useEffect(() => {
    let cancelled = false;
    let instance: MlMap | null = null;

    (async () => {
      try {
        const mod = await loadMaplibre();
        moduleRef.current = mod;
        if (cancelled || !containerRef.current) return;

        await ensurePmtilesProtocol(mod.addProtocol as never);

        instance = new mod.Map({
          container: containerRef.current,
          style: mapStyleUrl(styleIdRef.current),
          center: [CITY.center.lng, CITY.center.lat],
          zoom: 11.4,
          minZoom: 3,
          maxZoom: 19,
          attributionControl: { compact: true },
          cooperativeGestures: false,
        });
        mapRef.current = instance;
        attachBasemapFallback(instance);
        instance.addControl(new mod.ScaleControl({ maxWidth: 90, unit: "metric" }), "bottom-left");

        instance.on("error", (event) => {
          const message = (event as unknown as { error?: { message?: string } }).error?.message ?? "";
          if (message) console.warn("[civis:map]", message);
          if (/openfreemap|tiles|glyph|sprite/i.test(message)) setTileError(true);
        });

        instance.on("load", () => {
          if (!instance || cancelled) return;
          installLayers(instance);
          setReady(true);
        });

        // Every setStyle rebuilds the style; our sources and layers must return.
        instance.on("style.load", () => {
          if (!instance || cancelled || !instance.isStyleLoaded()) return;
          installLayers(instance);
          setStyleEpoch((value) => value + 1);
        });

        instance.on("moveend", () => {
          if (!instance) return;
          const bounds = instance.getBounds();
          setViewport({
            minLng: Math.max(-180, bounds.getWest()),
            minLat: Math.max(-85, bounds.getSouth()),
            maxLng: Math.min(180, bounds.getEast()),
            maxLat: Math.min(85, bounds.getNorth()),
          });
        });

        instance.on("rotate", () => setBearing(instance?.getBearing() ?? 0));

        const canvas = instance.getCanvas();
        const onLost = (event: Event) => {
          event.preventDefault();
          if (!cancelled) setMapFailed(true);
        };
        canvas.addEventListener("webglcontextlost", onLost);
        instance.once("remove", () => canvas.removeEventListener("webglcontextlost", onLost));
      } catch (error) {
        console.error("[civis:map] initialisation failed", error);
        if (!cancelled) setMapFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      userMarker.current?.remove();
      userMarker.current = null;
      instance?.remove();
      mapRef.current = null;
    };
  }, [installLayers]);

  // Push data into the sources whenever it changes or a style is reinstalled.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const incidentSource = map.getSource(SRC.incidents) as GeoJSONSource | undefined;
    incidentSource?.setData({
      type: "FeatureCollection",
      features: incidents
        .filter((point) => isValidCoordinate(point.lat, point.lng))
        .map((point) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [point.lng, point.lat] },
          properties: {
            id: point.id,
            severity: point.status === "resolved" ? "low" : point.severity,
            category: point.category,
          },
        })),
    });

    const facilitySource = map.getSource(SRC.facilities) as GeoJSONSource | undefined;
    facilitySource?.setData({
      type: "FeatureCollection",
      features: facilities
        .filter((facility) => isValidCoordinate(facility.lat, facility.lng))
        .map((facility) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [facility.lng, facility.lat] },
          properties: { id: facility.id, kind: facility.kind },
        })),
    });

    const bloodSource = map.getSource(SRC.blood) as GeoJSONSource | undefined;
    bloodSource?.setData({
      type: "FeatureCollection",
      features: blood
        .filter((request) => isValidCoordinate(request.latitude, request.longitude))
        .map((request) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [request.longitude, request.latitude] },
          properties: { id: request.id, urgency: request.urgency },
        })),
    });
  }, [incidents, facilities, blood, ready, styleEpoch]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    applyVisibility(map);
  }, [layers, ready, styleEpoch, applyVisibility]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    applyLanguage(map, lang);
  }, [lang, ready, styleEpoch]);

  /* ---------------- user location ---------------- */

  useEffect(() => {
    const map = mapRef.current;
    const mod = moduleRef.current;
    if (!map || !mod || !ready) return;

    const fix = geo.fix;
    const source = map.getSource(SRC.accuracy) as GeoJSONSource | undefined;

    if (!fix) {
      source?.setData(EMPTY);
      userMarker.current?.remove();
      userMarker.current = null;
      return;
    }
    if (!isValidCoordinate(fix.lat, fix.lng)) return;

    const coarse = (fix.accuracy ?? 0) > 120;
    if (!userMarker.current) {
      const element = document.createElement("div");
      element.className = "civis-user-location";
      element.innerHTML = '<span class="civis-user-pulse"></span><span class="civis-user-dot"></span>';
      element.setAttribute("aria-hidden", "true");
      userMarker.current = new mod.Marker({ element, anchor: "center" })
        .setLngLat([fix.lng, fix.lat])
        .addTo(map);
    } else {
      userMarker.current.setLngLat([fix.lng, fix.lat]);
    }
    userMarker.current.getElement().dataset.accuracy = coarse ? "coarse" : "fine";

    if (source) {
      source.setData(
        fix.accuracy && fix.accuracy > 5
          ? accuracyPolygon(fix.lng, fix.lat, fix.accuracy)
          : { type: "FeatureCollection", features: [] },
      );
    }

    if (centreOnNextFix.current) {
      centreOnNextFix.current = false;
      map.flyTo({
        center: [fix.lng, fix.lat],
        zoom: Math.max(map.getZoom(), 15.5),
        duration: 850,
        essential: true,
      });
    }
  }, [geo.fix, ready, styleEpoch]);

  // Following recentres only while the user asked for it; panning stops nothing.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geo.following || !geo.fix) return;
    map.easeTo({ center: [geo.fix.lng, geo.fix.lat], duration: 600 });
  }, [geo.fix, geo.following]);

  const handleLocate = useCallback(async () => {
    centreOnNextFix.current = true;
    const fix = await geo.locate();
    if (!fix) centreOnNextFix.current = false;
  }, [geo]);

  const handleToggleFollow = useCallback(() => {
    if (geo.following) {
      geo.stopFollow();
      return;
    }
    centreOnNextFix.current = true;
    geo.startFollow();
  }, [geo]);

  /* ---------------- data loading ---------------- */

  // Incidents: filtered, and limited to the viewport once one is known.
  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ mode: "map" });
        if (filters.category) params.set("category", filters.category);
        if (filters.severity) params.set("severity", filters.severity);
        if (filters.status) params.set("status", filters.status);
        const res = await fetch(`/api/reports?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error("Could not load reports");
        const data = (await res.json()) as { points: ExplorePoint[] };
        setIncidents(data.points);
      } catch (error) {
        if ((error as Error).name !== "AbortError") setNotice("Reports could not be refreshed. Showing the last loaded set.");
      }
    }, 280);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [filters, ready]);

  // Facilities and blood requests: only what the viewport can show.
  useEffect(() => {
    if (!viewport || !ready) return;
    if (!layers.hospitals && !layers.blood) return;

    const controller = new AbortController();
    const bbox = expandBbox(viewport);
    const timer = window.setTimeout(async () => {
      if (layers.hospitals) {
        try {
          const res = await fetch(
            `/api/map/facilities?bbox=${bboxParam(bbox)}&types=hospital,emergency_department,police,fire,ambulance`,
            { signal: controller.signal },
          );
          if (res.ok) {
            const data = (await res.json()) as { facilities?: Record<string, unknown>[] };
            const mapped: MapFacility[] = (data.facilities ?? [])
              .map((row) => ({
                id: String(row.id ?? ""),
                name: String(row.name ?? "Unnamed facility"),
                // `/api/map/facilities` selects the column as `type`.
                kind: String(row.type ?? row.kind ?? "hospital"),
                lat: Number(row.lat ?? row.latitude),
                lng: Number(row.lng ?? row.longitude),
                address: (row.address as string | null | undefined) ?? null,
              }))
              .filter((row) => row.id && isValidCoordinate(row.lat, row.lng));
            setFacilities(mapped);
          }
        } catch (error) {
          if ((error as Error).name !== "AbortError") setFacilities([]);
        }
      }

      if (layers.blood) {
        const centreLng = (bbox.minLng + bbox.maxLng) / 2;
        const centreLat = (bbox.minLat + bbox.maxLat) / 2;
        const latKm = (bbox.maxLat - bbox.minLat) * 111;
        const lngKm = (bbox.maxLng - bbox.minLng) * 111 * Math.cos((centreLat * Math.PI) / 180);
        const radius = Math.min(250, Math.max(2, Math.round(Math.hypot(latKm, lngKm) / 2)));
        try {
          const res = await fetch(
            `/api/blood/requests?lat=${centreLat.toFixed(4)}&lng=${centreLng.toFixed(4)}&radius=${radius}&limit=100`,
            { signal: controller.signal },
          );
          if (res.ok) {
            const data = (await res.json()) as { requests?: MapBloodRequest[] };
            setBlood(data.requests ?? []);
          }
        } catch (error) {
          if ((error as Error).name !== "AbortError") setBlood([]);
        }
      }
    }, 340);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [viewport, layers.hospitals, layers.blood, ready]);

  /* ---------------- interaction ---------------- */

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    const onClick = (event: MapMouseEvent) => {
      const present = INTERACTIVE.filter((id) => map.getLayer(id));
      if (!present.length) return;
      const hits = map.queryRenderedFeatures(event.point, { layers: present });
      if (!hits.length) {
        setSelection(null);
        return;
      }
      const feature = hits[0];

      if (feature.layer.id === "incidents-clusters") {
        const clusterId = Number(feature.properties?.cluster_id);
        const source = map.getSource(SRC.incidents) as GeoJSONSource | undefined;
        const coordinates = (feature.geometry as { type: "Point"; coordinates: [number, number] }).coordinates;
        if (source && Number.isFinite(clusterId)) {
          source
            .getClusterExpansionZoom(clusterId)
            .then((zoom) => map.flyTo({ center: coordinates, zoom, duration: 600, essential: true }))
            .catch(() => map.flyTo({ center: coordinates, zoom: map.getZoom() + 1.5 }));
        }
        return;
      }

      const id = String(feature.properties?.id ?? "");
      if (!id) return;

      if (feature.layer.id === "incidents-points") {
        setSelection({ kind: "incident", id });
      } else if (feature.layer.id === "facilities-points") {
        const found = facilities.find((facility) => facility.id === id);
        if (found) setSelection({ kind: "facility", data: found });
      } else if (feature.layer.id === "blood-points") {
        const found = blood.find((request) => request.id === id);
        if (found) setSelection({ kind: "blood", data: found });
      }
    };

    const onMove = (event: MapMouseEvent) => {
      const present = INTERACTIVE.filter((id) => map.getLayer(id));
      if (!present.length) return;
      const hits = map.queryRenderedFeatures(event.point, { layers: present });
      map.getCanvas().style.cursor = hits.length ? "pointer" : "";
    };

    map.on("click", onClick);
    map.on("mousemove", onMove);
    return () => {
      map.off("click", onClick);
      map.off("mousemove", onMove);
    };
  }, [ready, facilities, blood]);

  // Incident detail for the sheet.
  useEffect(() => {
    if (!selection || selection.kind !== "incident") {
      setDetail(null);
      return;
    }
    const controller = new AbortController();
    setDetailLoading(true);
    setDetail(null);
    fetch(`/api/reports/${selection.id}`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Could not load incident"))))
      .then((data: IncidentDetail) => setDetail(data))
      .catch((error: Error) => {
        if (error.name !== "AbortError") setNotice(error.message);
      })
      .finally(() => setDetailLoading(false));
    return () => controller.abort();
  }, [selection]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  /* ---------------- controls ---------------- */

  const changeStyle = useCallback((next: MapStyleId) => {
    setStyleId(next);
    styleIdRef.current = next;
    const map = mapRef.current;
    if (!map) return;
    setTileError(false);
    try {
      map.setStyle(mapStyleUrl(next), { diff: false });
    } catch (error) {
      console.warn("[civis:map] style switch failed", error);
      setNotice("That map style could not be loaded. The current style was kept.");
    }
  }, []);

  const zoomBy = useCallback((delta: number) => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ zoom: map.getZoom() + delta, duration: 220 });
  }, []);

  const resetView = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    setSelection(null);
    geo.stopFollow();
    map.flyTo({ center: [CITY.center.lng, CITY.center.lat], zoom: 11.4, bearing: 0, duration: 750, essential: true });
  }, [geo]);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => setNotice("Full screen could not be closed."));
      return;
    }
    const element = stageRef.current;
    if (!element?.requestFullscreen) {
      setNotice("This browser does not offer full screen mode.");
      return;
    }
    void element.requestFullscreen().catch(() => setNotice("Full screen was blocked by the browser."));
  }, []);

  const counts = useMemo<Record<LayerId, number>>(
    () => ({ incidents: incidents.length, hospitals: facilities.length, blood: blood.length }),
    [incidents.length, facilities.length, blood.length],
  );

  const selectedPoint = selection?.kind === "incident" ? incidents.find((point) => point.id === selection.id) : undefined;

  /* ---------------- render ---------------- */

  return (
    <div ref={stageRef} className="civis-map-stage">
      <div ref={containerRef} className="civis-map-canvas" aria-label="Interactive map of CIVIS reports, hospitals and blood requests" />

      <MapSearchBar
        onPick={({ lat, lng }) => {
          const map = mapRef.current;
          if (!map || !isValidCoordinate(lat, lng)) return;
          geo.stopFollow();
          map.flyTo({ center: [lng, lat], zoom: 14.5, duration: 900, essential: true });
        }}
      />

      {/* view switch + live counts */}
      <div className="pointer-events-none absolute inset-x-0 top-[140px] z-20 px-3 sm:px-5">
        <div className="pointer-events-auto mx-auto flex max-w-[560px] flex-wrap items-center gap-1.5">
          <div className="flex rounded-full border border-white/10 bg-[#0c131f]/90 p-0.5 backdrop-blur">
            {(["map", "list"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                aria-pressed={view === mode}
                className={cx(
                  "rounded-full px-3 py-1 text-[11.5px] font-medium capitalize",
                  view === mode ? "bg-white/10 text-fg" : "text-muted hover:text-fg",
                )}
              >
                {mode}
              </button>
            ))}
          </div>
          <span className="rounded-full border border-white/10 bg-[#0c131f]/90 px-2.5 py-1 text-[10.5px] text-muted backdrop-blur">
            {incidents.length} report{incidents.length === 1 ? "" : "s"}
            {facilities.length > 0 ? ` · ${facilities.length} facilities` : ""}
            {blood.length > 0 ? ` · ${blood.length} blood` : ""}
          </span>
          {tileError && (
            <span className="rounded-full border border-warn/40 bg-warn/10 px-2.5 py-1 text-[10.5px] text-warn">
              Some map tiles failed to load
            </span>
          )}
          {notice && (
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="rounded-full border border-crit/40 bg-crit/10 px-2.5 py-1 text-[10.5px] text-crit"
            >
              {notice} · dismiss
            </button>
          )}
        </div>
      </div>

      <GeoStatusBanner
        state={geo.state}
        fix={geo.fix}
        following={geo.following}
        onRetry={() => void handleLocate()}
        onStopFollow={geo.stopFollow}
        onDismiss={() => geo.reset()}
      />

      <MapControlStack
        following={geo.following}
        locating={geo.state === "detecting"}
        onLocate={() => void handleLocate()}
        onToggleFollow={handleToggleFollow}
        onZoomIn={() => zoomBy(1)}
        onZoomOut={() => zoomBy(-1)}
        bearing={bearing}
        onCompass={() => mapRef.current?.easeTo({ bearing: 0, duration: 400 })}
        onReset={resetView}
        isFullscreen={isFullscreen}
        onFullscreen={toggleFullscreen}
        layersOpen={layersOpen}
        onToggleLayers={() => setLayersOpen((open) => !open)}
      />

      <MapLayersPanel
        open={layersOpen}
        onClose={() => setLayersOpen(false)}
        layers={layers}
        counts={counts}
        onToggleLayer={(id) => setLayers((current) => ({ ...current, [id]: !current[id] }))}
        styleId={styleId}
        onStyle={changeStyle}
        lang={lang}
        onLang={setLang}
        filters={filters}
        onFilter={(key, value) => setFilters((current) => ({ ...current, [key]: value }))}
        onClearFilters={() => setFilters({ category: "", severity: "", status: "" })}
      />

      {/* list mode and map failure share one honest surface */}
      {(view === "list" || mapFailed) && (
        <div className={cx("civis-map-fallback", view === "map" && "!z-[18]")}>
          {mapFailed && (
            <div className="mx-auto mb-4 max-w-[720px] rounded-xl border border-crit/35 bg-crit/[0.07] p-4">
              <p className="text-[13px] font-semibold text-crit">The map could not start</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">
                WebGL may be unavailable or the style failed to load. Reports, hospitals and emergency contacts
                are still available below and in the list views.
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-3 rounded-full bg-white/10 px-3 py-1.5 text-[12px] font-medium text-fg hover:bg-white/15"
              >
                Retry the map
              </button>
            </div>
          )}

          <div className="mx-auto max-w-[720px] space-y-2">
            {incidents.length === 0 ? (
              <EmptyState title="No reports in this view" description="Move the map, clear a filter, or search a different area." />
            ) : (
              incidents.map((point) => {
                const severity = severityMeta(point.severity);
                const status = statusMeta(point.status);
                return (
                  <button
                    key={point.id}
                    type="button"
                    onClick={() => {
                      setView("map");
                      setSelection({ kind: "incident", id: point.id });
                      mapRef.current?.flyTo({ center: [point.lng, point.lat], zoom: 15, duration: 700 });
                    }}
                    className="panel panel-hover flex w-full items-center gap-3 p-3 text-left"
                  >
                    <span
                      className="grid size-10 shrink-0 place-items-center rounded-xl border text-[10px] font-semibold"
                      style={{ borderColor: `${severity.color}44`, color: severity.color, background: `${severity.color}12` }}
                    >
                      {point.category.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium">{point.title}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px]">
                        <span style={{ color: severity.color }}>{severity.label}</span>
                        <span style={{ color: status.color }}>{status.label}</span>
                        <span className="text-muted">{point.neighborhood ?? "Unmapped"}</span>
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      {selection && !mapFailed && view === "map" && (
        <div className="civis-sheet" role="dialog" aria-label="Selected map item">
          <div className="civis-sheet-grabber" />
          <div className="mb-2 flex items-start justify-between gap-3">
            <h2 className="text-[14px] font-semibold">
              {selection.kind === "incident"
                ? selectedPoint?.title ?? "Incident"
                : selection.kind === "facility"
                  ? selection.data.name
                  : `${selection.data.bloodGroup} blood needed`}
            </h2>
            <button
              type="button"
              onClick={() => setSelection(null)}
              aria-label="Close details"
              className="grid size-7 shrink-0 place-items-center rounded-full border border-white/12 text-muted hover:text-fg"
            >
              ✕
            </button>
          </div>

          {selection.kind === "incident" &&
            (detailLoading ? (
              <div className="grid h-24 place-items-center">
                <Spinner />
              </div>
            ) : detail ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  <Badge color={severityMeta(detail.report.severity).color}>{severityMeta(detail.report.severity).label}</Badge>
                  <Badge color={statusMeta(detail.report.status).color} dot={false}>
                    {statusMeta(detail.report.status).label}
                  </Badge>
                  <Badge color="#929fb2" dot={false}>
                    {category(detail.report.category).label}
                  </Badge>
                </div>
                <p className="text-[12.5px] leading-relaxed text-muted line-clamp-4">{detail.report.description}</p>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px]">
                  <div className="col-span-2">
                    <dt className="text-muted">Location</dt>
                    <dd>{detail.report.address ?? detail.report.neighborhood ?? "Unmapped"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Reported</dt>
                    <dd>{timeAgo(detail.report.created_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Supporters</dt>
                    <dd>{detail.report.supporters}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-muted">Department</dt>
                    <dd>{detail.report.department_name ?? "Not assigned"}</dd>
                  </div>
                </dl>
                {detail.responses.length > 0 && (
                  <div className="rounded-xl border border-mint/25 bg-mint/[0.06] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-mint">
                      Official response · {detail.responses[detail.responses.length - 1].department}
                    </p>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-fg/90">
                      {detail.responses[detail.responses.length - 1].body}
                    </p>
                  </div>
                )}
                <Link
                  href={`/incidents/${detail.report.id}`}
                  className="flex h-10 items-center justify-center rounded-full bg-accent text-[12.5px] font-semibold text-ink hover:bg-[#5ce2ff]"
                >
                  Open full incident page
                </Link>
              </div>
            ) : (
              <p className="text-[12px] text-muted">Details could not be loaded. Open the list to retry.</p>
            ))}

          {selection.kind === "facility" && (
            <div className="space-y-2 text-[12px]">
              <p className="text-muted">{selection.data.address ?? "Address not recorded for this facility."}</p>
              <p className="font-mono text-[11px] text-muted">
                {selection.data.lat.toFixed(5)}, {selection.data.lng.toFixed(5)}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link href="/emergency#nearby-hospitals" className="rounded-full bg-accent px-3 py-1.5 text-[12px] font-semibold text-ink">
                  Emergency Center
                </Link>
                <a
                  href={`https://www.openstreetmap.org/?mlat=${selection.data.lat}&mlon=${selection.data.lng}#map=17/${selection.data.lat}/${selection.data.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-white/15 px-3 py-1.5 text-[12px] text-muted hover:text-fg"
                >
                  Open in OpenStreetMap
                </a>
              </div>
            </div>
          )}

          {selection.kind === "blood" && (
            <div className="space-y-2 text-[12px]">
              <p className="text-muted">
                {selection.data.bloodGroup} requested at {selection.data.hospitalName}. Contact details are only
                shared after a request owner accepts a donor offer.
              </p>
              <Link href={`/blood/${selection.data.code}`} className="inline-flex rounded-full bg-accent px-3 py-1.5 text-[12px] font-semibold text-ink">
                View blood request
              </Link>
            </div>
          )}
        </div>
      )}

      {viewerId === null && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 px-3 sm:bottom-5">
          <div className="pointer-events-auto mx-auto flex max-w-[420px] items-center justify-between gap-3 rounded-full border border-white/10 bg-[#0c131f]/92 px-4 py-1.5 text-[11px] text-muted backdrop-blur">
            Sign in to support and follow incidents
            <Link href="/auth/sign-in?next=/explore" className="rounded-full bg-accent px-3 py-1.5 font-semibold text-ink">
              Sign in
            </Link>
          </div>
        </div>
      )}

      <span className="sr-only" aria-live="polite">
        {LAYER_DEFS.filter((layer) => layers[layer.id]).map((layer) => layer.label).join(", ")} shown on the map.
      </span>
    </div>
  );
}

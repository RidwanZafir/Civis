import type { StyleSpecification } from "maplibre-gl";

/**
 * Map styles.
 *
 * Every style here is keyless: OpenFreeMap publishes OpenStreetMap-derived
 * vector tiles with no signup, no token and no watermark. Choosing a style is a
 * `setStyle` call on the live map, so panning, markers and the user's location
 * survive the switch.
 *
 * The locally hosted PMTiles path is deliberately opt-in. It only activates when
 * NEXT_PUBLIC_CIVIS_PMTILES_URL points at an archive produced by
 * `scripts/map-tiles.mjs`, because a missing archive must not blank the map.
 */

export type MapStyleId = "dark" | "standard" | "light";

export type MapStyleDef = {
  id: MapStyleId;
  label: string;
  description: string;
  url: string;
};

export const MAP_STYLES: MapStyleDef[] = [
  {
    id: "dark",
    label: "Dark",
    description: "Night navigation. Highest contrast for incident work.",
    url: "https://tiles.openfreemap.org/styles/dark",
  },
  {
    id: "standard",
    label: "Standard",
    description: "Full colour, every place name and point of interest.",
    url: "https://tiles.openfreemap.org/styles/liberty",
  },
  {
    id: "light",
    label: "Light",
    description: "Bright and minimal, closest to a navigation app.",
    url: "https://tiles.openfreemap.org/styles/positron",
  },
];

export const DEFAULT_MAP_STYLE: MapStyleId = "standard";

export const LOCAL_TILES = {
  /** Set by the operator after running the tile pipeline. Empty means remote. */
  pmtilesUrl: process.env.NEXT_PUBLIC_CIVIS_PMTILES_URL ?? "",
  glyphs: "/map/fonts/{fontstack}/{range}.pbf",
  sprite: "/map/sprites/civis",
};

let registered = false;

/**
 * Registers the `pmtiles://` protocol once per page load. HTTP Range requests
 * are what make this cheap: the browser fetches only the byte ranges for the
 * tiles it needs instead of the whole archive.
 */
export async function ensurePmtilesProtocol(addProtocol: ((name: string, handler: never) => void) | undefined) {
  if (!LOCAL_TILES.pmtilesUrl || registered) return registered;
  if (typeof addProtocol !== "function") return false;
  try {
    const { Protocol } = await import("pmtiles");
    const protocol = new Protocol();
    addProtocol("pmtiles", protocol.tile as never);
    registered = true;
  } catch (error) {
    console.warn("[civis:map] PMTiles protocol unavailable, using the remote style.", error);
  }
  return registered;
}

export function mapStyleUrl(id: MapStyleId): string | StyleSpecification {
  if (LOCAL_TILES.pmtilesUrl && registered) return buildLocalStyle();
  return (MAP_STYLES.find((style) => style.id === id) ?? MAP_STYLES[0]).url;
}

export function mapStyleById(id: MapStyleId): MapStyleDef {
  return MAP_STYLES.find((style) => style.id === id) ?? MAP_STYLES[0];
}

/**
 * The style served from our own PMTiles archive.
 *
 * Source layers follow the OpenMapTiles schema that the pipeline writes, and
 * labels appear progressively: country and region at low zoom, districts and
 * towns at medium zoom, streets and individual amenities only when zoomed in.
 * Fonts and sprites are served from `public/map/` so no request leaves CIVIS.
 */
export function buildLocalStyle(): StyleSpecification {
  const zoomFade = (from: number) => ["step", ["zoom"], 0, from, 1] as never;

  return {
    version: 8,
    name: "CIVIS Local",
    glyphs: LOCAL_TILES.glyphs,
    sprite: LOCAL_TILES.sprite,
    sources: {
      openmaptiles: {
        type: "vector",
        url: `pmtiles://${LOCAL_TILES.pmtilesUrl}`,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#0a111d" } },
      {
        id: "landcover",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landcover",
        paint: { "fill-color": "#0f1a28", "fill-opacity": 0.6 },
      },
      {
        id: "landuse",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "landuse",
        paint: { "fill-color": "#111c2b", "fill-opacity": 0.5 },
      },
      {
        id: "water",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "water",
        paint: { "fill-color": "#0b2338" },
      },
      {
        id: "waterway",
        type: "line",
        source: "openmaptiles",
        "source-layer": "waterway",
        paint: { "line-color": "#12405f", "line-width": zoomFade(10) },
      },
      {
        id: "park",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "park",
        paint: { "fill-color": "#0d241f", "fill-opacity": 0.7 },
      },
      {
        id: "road-minor",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        minzoom: 11,
        filter: ["in", ["get", "class"], ["literal", ["minor", "service", "track"]]],
        paint: {
          "line-color": "#1b2a3d",
          "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.5, 18, 6] as never,
        },
      },
      {
        id: "road-secondary",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["secondary", "tertiary"]]],
        paint: {
          "line-color": "#26394f",
          "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.6, 18, 9] as never,
        },
      },
      {
        id: "road-primary",
        type: "line",
        source: "openmaptiles",
        "source-layer": "transportation",
        filter: ["in", ["get", "class"], ["literal", ["primary", "trunk", "motorway"]]],
        paint: {
          "line-color": "#3b5470",
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.8, 18, 13] as never,
        },
      },
      {
        id: "boundary",
        type: "line",
        source: "openmaptiles",
        "source-layer": "boundary",
        filter: ["<=", ["get", "admin_level"], 4],
        paint: { "line-color": "#33506e", "line-width": 0.8, "line-dasharray": [3, 2] },
      },
      {
        id: "building",
        type: "fill",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 14,
        paint: { "fill-color": "#162334", "fill-opacity": 0.85 },
      },
      {
        id: "road-label",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "transportation_name",
        minzoom: 13,
        layout: {
          "text-field": ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "symbol-placement": "line",
          "text-padding": 4,
        },
        paint: { "text-color": "#9fb0c6", "text-halo-color": "#0a111d", "text-halo-width": 1.2 },
      },
      {
        id: "place-suburb",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        minzoom: 12,
        filter: ["in", ["get", "class"], ["literal", ["suburb", "neighbourhood", "quarter"]]],
        layout: {
          "text-field": ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": 12,
          "text-transform": "uppercase",
          "text-letter-spacing": 0.08,
        },
        paint: { "text-color": "#8fa3bb", "text-halo-color": "#0a111d", "text-halo-width": 1.3 },
      },
      {
        id: "place-town",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        minzoom: 8,
        filter: ["in", ["get", "class"], ["literal", ["town", "village", "hamlet"]]],
        layout: {
          "text-field": ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 8, 11, 14, 15] as never,
        },
        paint: { "text-color": "#c7d4e4", "text-halo-color": "#0a111d", "text-halo-width": 1.4 },
      },
      {
        id: "place-city",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        filter: ["==", ["get", "class"], "city"],
        layout: {
          "text-field": ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]],
          "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 5, 12, 12, 20] as never,
        },
        paint: { "text-color": "#e8eef7", "text-halo-color": "#0a111d", "text-halo-width": 1.6 },
      },
      {
        id: "place-country",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        maxzoom: 8,
        filter: ["==", ["get", "class"], "country"],
        layout: {
          "text-field": ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]],
          "text-font": ["Noto Sans Bold"],
          "text-size": 15,
          "text-transform": "uppercase",
          "text-letter-spacing": 0.12,
        },
        paint: { "text-color": "#aebdd0", "text-halo-color": "#0a111d", "text-halo-width": 1.6 },
      },
      {
        id: "poi",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "poi",
        minzoom: 15,
        layout: {
          "text-field": ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]],
          "text-font": ["Noto Sans Regular"],
          "text-size": 10.5,
          "text-offset": [0, 1.1],
          "text-anchor": "top",
          "text-padding": 2,
        },
        paint: { "text-color": "#93a7bf", "text-halo-color": "#0a111d", "text-halo-width": 1.1 },
      },
    ],
  };
}

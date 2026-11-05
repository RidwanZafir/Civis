import type { Map as MlMap } from "maplibre-gl";

/**
 * Keyless basemap.
 *
 * The previous CARTO raster endpoint (`basemaps.cartocdn.com`) now stamps
 * "API KEY REQUIRED" watermarks into every tile, so the map rendered as a wall
 * of placeholder text. OpenFreeMap publishes a dark vector style with no API
 * key, no signup and no watermark, which is what we use instead.
 *
 * If that style cannot be fetched, the map falls back to a keyless Esri
 * dark-grey raster basemap so an outage never leaves a blank canvas.
 */
export const BASEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/dark";

export const BASEMAP_ATTRIBUTION =
  '© <a href="https://openfreemap.org">OpenFreeMap</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const BASEMAP_FALLBACK = {
  version: 8 as const,
  sources: {
    basemap: {
      type: "raster" as const,
      tiles: [
        "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: `${BASEMAP_ATTRIBUTION} © Esri`,
    },
  },
  layers: [
    { id: "bg", type: "background" as const, paint: { "background-color": "#080D17" } },
    {
      id: "basemap",
      type: "raster" as const,
      source: "basemap",
      paint: { "raster-opacity": 0.92, "raster-saturation": -0.3 },
    },
  ],
};

/**
 * Swaps in the raster fallback if the vector style itself fails to fetch.
 * Registered before the `load` handler runs, so the fallback's own load pass
 * installs the incident layers exactly once.
 */
/**
 * Switches map labels between Latin and Bangla names where the vector tiles
 * carry `name:bn`. Layers keep their geometry and filtering; only the label
 * expression changes, so nothing is rebuilt and no style is reloaded.
 */
export function applyLanguage(map: MlMap, lang: "en" | "bn") {
  const layers = map.getStyle()?.layers ?? [];
  // OSM vector tiles tag Latin names inconsistently: some features carry
  // `name:en`, most carry only `name:latin`, and many carry just `name`. Trying
  // only `name:en` left those labels blank, which read as "names are missing".
  const expression =
    lang === "bn"
      ? ["coalesce", ["get", "name:bn"], ["get", "name"]]
      : ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]];
  for (const layer of layers) {
    if (layer.type !== "symbol") continue;
    if (!("text-field" in (layer.layout ?? {}))) continue;
    try {
      map.setLayoutProperty(layer.id, "text-field", expression as never);
    } catch {
      // Layer may have been removed between reads; ignore and continue.
    }
  }
}

export function attachBasemapFallback(map: MlMap) {
  // The OpenFreeMap sprite atlas does not carry every icon its style names
  // ("wood-pattern", "circle-11"). Without a resolver MapLibre throws a
  // console error per symbol layer on every style pass, which floods the
  // console and makes the map look broken.
  try {
    const resolver = map as unknown as {
      setMissingStyleImageResolver?: (fn: (id: string) => ImageData | null) => void;
    };
    if (typeof resolver.setMissingStyleImageResolver === "function") {
      const blank = new ImageData(new Uint8ClampedArray([0, 0, 0, 0]), 1, 1);
      resolver.setMissingStyleImageResolver(() => blank);
    }
  } catch {
    // Older builds do not expose the hook; sprite misses are cosmetic.
  }

  let used = false;
  const onError = (event: unknown) => {
    const detail = (event as { error?: { message?: string } }).error?.message ?? "";
    if (used || !detail.includes("openfreemap")) return;
    used = true;
    try {
      map.setStyle(BASEMAP_FALLBACK as never);
    } catch {
      /* keep the dark background; markers still render */
    }
  };
  map.on("error", onError);
  return () => map.off("error", onError);
}

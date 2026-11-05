/**
 * MapLibre is loaded lazily on the client only.
 *
 * Bundlers rewrite the module URL that MapLibre uses to spawn its worker, which
 * breaks tile parsing ("Worker failed to load"). We ship MapLibre's own worker
 * file from `public/maplibre/` and point the library at it once per page load.
 */

export type MapLibreModule = {
  Map: typeof import("maplibre-gl").Map;
  Marker: typeof import("maplibre-gl").Marker;
  NavigationControl: typeof import("maplibre-gl").NavigationControl;
  ScaleControl: typeof import("maplibre-gl").ScaleControl;
  setWorkerUrl?: (url: string) => void;
  /** Needed to register an extra protocol such as `pmtiles://`. */
  addProtocol?: (name: string, handler: (...args: never[]) => unknown) => void;
};

const WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";

let cached: Promise<MapLibreModule> | null = null;

type Mod = MapLibreModule & { default?: Partial<MapLibreModule> };

function configureWorker(mod: Mod) {
  // setWorkerUrl is a named export of the ESM build. With some interop shapes it
  // only exists on the default object, so check both before giving up.
  const setter = mod.setWorkerUrl ?? mod.default?.setWorkerUrl;
  if (typeof setter !== "function") {
    console.error(
      "[civis:map] MapLibre did not expose setWorkerUrl; tiles cannot be parsed.",
    );
    return;
  }
  setter(WORKER_URL);
  if (process.env.NODE_ENV !== "production") {
    console.info("[civis:map] worker configured", WORKER_URL);
  }
}

export function loadMaplibre(): Promise<MapLibreModule> {
  if (!cached) {
    cached = import("maplibre-gl").then((mod) => {
      const typed = mod as unknown as Mod;
      configureWorker(typed);
      return (typed.default && typed.default.Map ? typed.default : typed) as MapLibreModule;
    });
  }
  return cached;
}

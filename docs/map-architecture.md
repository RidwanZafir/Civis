# CIVIS map architecture

This document describes the map engine that CIVIS uses, why the previous
"my location does nothing" behaviour happened, and how to move the basemap onto
self-hosted vector tiles.

---

## 1. What the renderer actually is

**MapLibre GL JS has been the renderer all along.** There is no Leaflet in this
repository, and no raster tile grid. Search the tree for `leaflet` and you get
zero matches.

| Layer | Implementation |
| --- | --- |
| Renderer | MapLibre GL JS (WebGL, vector tiles) |
| Basemap data | OpenStreetMap, served as OpenFreeMap vector styles |
| App overlays | GeoJSON sources and layers, drawn in the same GL context |
| Labels | Style symbol layers plus progressive zoom thresholds |
| Fonts / sprites | Served by the style endpoint; local hosting documented below |

So the map was never raster-based, and swapping "Leaflet for MapLibre" was not
the missing step. The five reported problems had five different causes:

| Reported problem | Actual cause |
| --- | --- |
| My Location shows nothing | `locate()` flew the camera and never created a marker |
| Not navigation-like | One dense filter toolbar, no search, no layer control |
| Names missing | Latin labels requested only as `name:en`; most tiles carry `name:latin` |
| Laggy interactions | Markers as DOM elements, no code splitting, 60-point cap |
| Inconsistent data | No viewport filtering; a fixed 400-row request, capped to 60 |

---

## 2. The location bug, and the fix

### Root cause

`components/map/ExploreMap.tsx` (now removed) called:

```ts
navigator.geolocation.getCurrentPosition((position) => {
  mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 14 });
```

The camera moved. Nothing was drawn at the coordinates. The user saw the map
jump to an area with no "you are here" indicator, which reads as "my location
did not work". Coordinates were also not validated, the failure path collapsed
every error into "permission denied", and there was no continuous tracking.

### The replacement

`lib/map/geolocation.ts` is the single place the browser location is read.

- **One-shot and continuous are separate.** `locate()` uses
  `getCurrentPosition`; `startFollow()` uses `watchPosition` and stores its
  handle; `stopFollow()` releases it with `clearWatch`. Unmounting releases it
  too.
- **Nothing is published unless it is real.** A fix is only accepted when
  latitude and longitude are finite and in range. A denial never becomes
  "here is the city centre instead".
- **Every state is explicit:** `idle`, `detecting`, `found`, `denied`,
  `unavailable`, `timeout`, `unsupported`, `insecure`. `insecure` exists because
  geolocation silently fails over plain HTTP on a non-loopback origin.
- **A generation counter** stops a slow one-shot fix from overwriting a newer
  watch update.

`lib/map/geo.ts` owns the coordinate contract. MapLibre takes
`[longitude, latitude]`; the Geolocation API returns named `latitude` and
`longitude`. Every helper takes named fields or an explicit `[lng, lat]` tuple,
and `accuracyPolygon(lng, lat, metres)` builds the accuracy ring.

### What the user sees

- A blue dot with a white ring, anchored at the actual fix, drawn as a MapLibre
  marker above the app layers with `pointer-events: none`.
- A soft pulse, disabled under `prefers-reduced-motion`.
- A translucent accuracy circle from the device's reported accuracy, drawn as a
  real GeoJSON polygon so it stays correct at every zoom.
- A status banner with the coordinate, the accuracy in metres, and the actions
  that apply to the current state: retry, enable-location guidance, select
  manually, stop following.

Follow mode recentres only while it is on, and only to the user's own fix,
so panning away during tracking is not fought.

---

## 3. Interface

`components/map/explore-map.tsx` is the map surface.
`components/map/map-chrome.tsx` holds the floating UI. The map fills the
viewport; nothing is docked over it permanently.

- **Search** (top centre): placeholder "Search places, hospitals, roads, and
  locations…", debounced local `/api/places` lookup, arrow-key navigation,
  Enter to select. No geocoder request leaves CIVIS.
- **Control stack** (right): my location, follow, zoom in/out, compass with the
  live bearing, layers, full screen, reset view.
- **Layers panel**: three independently toggled layers with live counts, three
  map styles, EN/বাংলা labels, and report filters.
- **Bottom sheet** on mobile, side sheet on desktop, for the selected item.
- **List view** toggle, and the same list is the fallback when the map cannot
  start.

Map failure is contained: a WebGL context loss or style failure shows a notice
and keeps reports, facilities and emergency contacts reachable. The rest of
CIVIS does not depend on the map engine.

---

## 4. Layers

| Layer | Source | Rendering |
| --- | --- | --- |
| Community reports | `/api/reports?mode=map` | Clustered GeoJSON circles + cluster counts |
| Hospitals & services | `/api/map/facilities?bbox=…` | GeoJSON circles, coloured by `type` |
| Blood requests | `/api/blood/requests` | GeoJSON circles |
| User location | `navigator.geolocation` | Marker + accuracy polygon |
| Places | (labels only) | Style symbol layers |

Reports are clustered with `clusterRadius: 48`, `clusterMaxZoom: 15`; clicking a
cluster uses `getClusterExpansionZoom`, so clusters break apart to the zoom
where their members actually separate. Layers are GL layers, not React
components: a few hundred points cost the same as a few.

Facilities and blood requests are requested for the current viewport plus a 15 %
margin, debounced by 340 ms. Reports are filtered server-side. Nothing loads
"all of Bangladesh" to show one neighbourhood.

Contact details are never part of a public layer. Blood markers sit on the
requesting hospital, not on a donor or patient address.

---

## 5. Styles and labels

`lib/map/styles.ts` defines three keyless styles, all OpenStreetMap-derived:

| Style | Source | Use |
| --- | --- | --- |
| Dark | `openfreemap/styles/dark` | Night work, highest contrast |
| Standard | `openfreemap/styles/liberty` | Full colour, most labels and POIs |
| Light | `openfreemap/styles/positron` | Brightest, navigation-like |

Switching calls `setStyle` on the live map. Pan, zoom, markers and the user's fix
survive, and `style.load` reinstalls the app layers and re-applies the selected
label language.

Labels are fixed in two places:

1. `applyLanguage` now coalesces `name:en → name:latin → name`. Requesting only
   `name:en` left every feature without that exact tag blank, which is what
   "geographic names are missing" looked like.
2. The **Standard** style carries far more labels and POIs than **Dark**. If you
   were only ever seeing the dark style, that alone explains the gap.

There is no terrain style. Terrain needs a DEM tileset that CIVIS does not ship,
so rather than fabricate one the style list simply does not offer it.

Bangla uses `name:bn` with a fallback to the local `name`, so a missing
translation never blanks a label. Correct Bengali shaping additionally needs a
glyph set that contains the Bangla ranges — see the glyphs section below.

---

## 6. Self-hosted tiles (PMTiles)

The app currently reads styles from OpenFreeMap: keyless, no watermark, no
signup, but hosted by a third party. Moving to CIVIS-controlled hosting is
supported and wired, but **the archive is not built in this repository and has
not been verified**, because this machine cannot build one:

- the volume has ~5.9 GB free and a Bangladesh build needs more,
- no Java 21 runtime, Planetiler, tippecanoe, osmium or Docker is installed.

### Build

```bash
# 1. Download a regional extract (do not scrape OSM raster tiles)
curl -LO https://download.geofabrik.de/asia/bangladesh-latest.osm.pbf

# 2. Build the archive (checks Java and free disk, then runs Planetiler)
npm run map:tiles -- --osm bangladesh-latest.osm.pbf

# 3. Point CIVIS at it
#    .env.local
NEXT_PUBLIC_CIVIS_PMTILES_URL=/map/tiles/bangladesh.pmtiles
```

`scripts/map-tiles.mjs` refuses to start without Java, without an extract, or
with insufficient disk, rather than failing halfway through a multi-hour build.

### Hosting requirements

The archive must be served with:

- **HTTP Range requests** — this is the whole point. Browsers read byte ranges
  for the tiles in view instead of downloading the file.
- **CORS** allowing the CIVIS origin, if the archive is on another host.
- **Caching headers** — `Cache-Control: public, max-age=31536000, immutable` for
  a versioned filename.
- **Correct `Content-Type: application/octet-stream`** and no content encoding.

`public/` satisfies Range and same-origin by default for local development.
For production, a CDN or object store in front of the file is the normal choice;
that is infrastructure spend and needs a decision, not an assumption.

### Glyphs and sprites

`lib/map/styles.ts` expects:

```
public/map/fonts/{fontstack}/{range}.pbf
public/map/sprites/civis.json
public/map/sprites/civis.png
```

These are **not included**. A glyph set containing the Bangla ranges is a large
asset; it has to be generated with `fontnik` from a font whose licence permits
redistribution (Noto Sans Bengali is a suitable OFL source). Until then the
remote styles keep working, and the local style path stays inactive because no
archive URL is set.

---

## 7. Performance changes

| Change | Effect |
| --- | --- |
| `next/dynamic` map import (`explore-map-loader.tsx`, `ssr: false`) | MapLibre and WebGL leave the route's initial JS |
| Layers as GL sources instead of DOM markers | Marker count no longer drives frame time |
| Viewport filtering for facilities and blood | Payload scales with the view, not the database |
| `bbox` filter on reports, indexed by lat/lng | Server returns a rectangle, not a country |
| Debounced input (200–340 ms) + `AbortController` | A fast pan or type cancels the superseded request |
| Style switching via `setStyle` | No map teardown, no re-download of the page |
| Cluster expansion instead of rendering members | Zoomed-out views stay cheap |

Also fixed: `listReports` capped every page at 60 rows, so `mapPoints` (which
asked for 400) silently returned 60. The cap is now 500 and applies to the
public list too.

### Not measured

Lighthouse and Core Web Vitals (LCP, INP, CLS) were **not** run, and no
before/after bundle-size or profiler capture was taken. This environment has no
browser automation available for the map surface. Any performance claim here is
architectural, not a measurement.

---

## 8. Environment and data changes

**Environment variables**

| Name | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_CIVIS_PMTILES_URL` | No | Activates the self-hosted PMTiles style |

Existing provider overrides (`CIVIS_PHOTON_URL`, `CIVIS_NOMINATIM_URL`,
`CIVIS_OVERPASS_URL`, `CIVIS_ROUTING_URL`, `CIVIS_BUILD_DIR`) are unchanged.

**Database**

- No schema change, no migration.
- `ReportFilters` gained an optional `bbox`, applied as
  `lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`, which uses the existing
  latitude/longitude index. This is the same shape that becomes `ST_DWithin` on
  PostGIS.
- `pageSize` cap raised from 60 to 500.

**Dependencies**

- Added: `pmtiles` (client protocol for the optional archive).
- Removed: nothing.

**Files**

```
lib/map/geo.ts              coordinate contract, accuracy ring, bbox helpers
lib/map/geolocation.ts      the location hook (states + watch lifecycle)
lib/map/styles.ts           keyless style catalog + local PMTiles style
components/map/explore-map.tsx          map surface
components/map/explore-map-loader.tsx   code-split boundary
components/map/map-chrome.tsx           search, controls, panels, status
components/map/map-shell.css            scoped map chrome
scripts/map-tiles.mjs                   OSM -> PMTiles pipeline
```

Removed: `components/map/ExploreMap.tsx`, `components/map/map-search.tsx`
(both superseded, nothing imported them).

---

## 9. Known limitations

1. **No PMTiles archive.** The pipeline and the local style exist; the data does
   not. Packaged assets are remote OpenFreeMap styles until an operator builds
   one.
2. **No local glyphs.** Bangla shaping depends on the style endpoint's glyph set.
   The label *field* is correct; the glyph *coverage* is not ours yet.
3. **No terrain style**, because there is no DEM.
4. **`/api/blood/requests` has no bbox parameter.** The map converts the viewport
   into a centre plus radius, so a very wide viewport gets a coarse circle rather
   than an exact rectangle.
5. **Report points are fetched without `bbox` on the first pass**, to keep the
   server-rendered first paint instant. Subsequent filter changes are still
   server-filtered.
6. **No browser verification.** The map was checked by typecheck, production
   build and HTTP requests; the rendered WebGL scene was not viewed.
7. **`npm run db:seed` is broken on Node 20.20** — it passes
   `--experimental-strip-types`, which that Node version does not have. This
   predates this work and is unrelated to the map.

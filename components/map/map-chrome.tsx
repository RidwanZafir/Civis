"use client";

import { useEffect, useRef, useState } from "react";
import { Compass, Layers, LocateFixed, Maximize2, Minimize2, Minus, Navigation, Plus, RotateCcw, Search, TriangleAlert, X } from "lucide-react";
import { Spinner, cx } from "@/components/ui";
import { MAP_STYLES, type MapStyleId } from "@/lib/map/styles";
import { GEO_MESSAGES, type GeoFix, type GeoState } from "@/lib/map/geolocation";
import { formatCoordinate, formatDistance } from "@/lib/map/geo";
import { CATEGORIES, SEVERITIES, STATUS_FLOW } from "@/lib/constants";

export type LayerId = "incidents" | "hospitals" | "blood";

export const LAYER_DEFS: { id: LayerId; label: string; color: string; description: string }[] = [
  { id: "incidents", label: "Community reports", color: "#f5b94b", description: "Reported infrastructure problems" },
  { id: "hospitals", label: "Hospitals & services", color: "#5a9cff", description: "Hospitals, police, fire, ambulance" },
  { id: "blood", label: "Blood requests", color: "#f16d78", description: "Active verified requests" },
];

type Place = {
  id: string;
  name: string;
  name_bn: string | null;
  kind: string;
  lat: number;
  lng: number;
  division: string | null;
  district: string | null;
};

/** Local place search. No geocoder request leaves CIVIS. */
export function MapSearchBar({ onPick }: { onPick: (place: { lat: number; lng: number; label: string }) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const timer = useRef<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setMessage(null);
      setBusy(false);
      setOpen(false);
      return;
    }
    setBusy(true);
    timer.current = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(term)}`);
        const data = await res.json();
        setResults(data.results ?? []);
        setMessage(data.message ?? null);
        setActive(0);
        setOpen(true);
      } catch {
        setMessage("Search is unavailable right now.");
        setOpen(true);
      } finally {
        setBusy(false);
      }
    }, 200);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [q]);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function choose(place: Place) {
    onPick({ lat: place.lat, lng: place.lng, label: place.name });
    setQ(place.name);
    setOpen(false);
  }

  return (
    <div className="civis-search-wrap">
      <div className="civis-search" ref={wrap}>
        <div className="relative">
          <Search
            size={17}
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            className="civis-search-input"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setOpen(false);
                return;
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((i) => Math.min(i + 1, results.length - 1));
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
                return;
              }
              if (event.key === "Enter" && results[active]) {
                event.preventDefault();
                choose(results[active]);
              }
            }}
            placeholder="Search places, hospitals, roads, and locations…"
            aria-label="Search places, hospitals, roads and locations"
            autoComplete="off"
            enterKeyHint="search"
          />
          {busy && <Spinner className="absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted" />}
          {!busy && q && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setOpen(false);
              }}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted hover:text-fg"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {open && (
          <div className="civis-search-results" role="listbox" aria-label="Place suggestions">
            {results.length === 0 ? (
              <p className="px-3 py-3 text-[12px] leading-relaxed text-muted">
                {message ?? "No match in the local dataset."}
              </p>
            ) : (
              results.map((place, index) => (
                <button
                  key={place.id}
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  data-active={index === active}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(place)}
                  className="civis-search-row"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-fg">{place.name}</span>
                    <span className="block truncate text-[10.5px] text-muted">
                      {[place.kind, place.division, place.district].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {place.name_bn && <span className="shrink-0 text-[11px] text-muted">{place.name_bn}</span>}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function MapControlStack({
  following,
  locating,
  onLocate,
  onToggleFollow,
  onZoomIn,
  onZoomOut,
  bearing,
  onCompass,
  onReset,
  isFullscreen,
  onFullscreen,
  layersOpen,
  onToggleLayers,
}: {
  following: boolean;
  locating: boolean;
  onLocate: () => void;
  onToggleFollow: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  bearing: number;
  onCompass: () => void;
  onReset: () => void;
  isFullscreen: boolean;
  onFullscreen: () => void;
  layersOpen: boolean;
  onToggleLayers: () => void;
}) {
  return (
    <div className="civis-controls" role="group" aria-label="Map controls">
      <button
        type="button"
        className="civis-map-btn"
        data-active={following}
        onClick={onLocate}
        disabled={locating}
        aria-label="Show my current location"
        title="My location"
      >
        {locating ? <Spinner className="size-4" /> : <LocateFixed size={18} />}
      </button>

      <button
        type="button"
        className="civis-map-btn"
        data-active={following}
        onClick={onToggleFollow}
        aria-pressed={following}
        aria-label={following ? "Stop following my location" : "Follow my location"}
        title={following ? "Stop following" : "Follow my location"}
      >
        <Navigation size={17} />
      </button>

      <div className="civis-control-group">
        <button type="button" className="civis-map-btn" onClick={onZoomIn} aria-label="Zoom in" title="Zoom in">
          <Plus size={17} />
        </button>
        <button type="button" className="civis-map-btn" onClick={onZoomOut} aria-label="Zoom out" title="Zoom out">
          <Minus size={17} />
        </button>
      </div>

      <button
        type="button"
        className="civis-map-btn"
        onClick={onCompass}
        aria-label={`Reset bearing ${Math.round(bearing)} degrees to north`}
        title="Reset to north"
      >
        <Compass size={17} style={{ transform: `rotate(${-bearing}deg)` }} />
      </button>

      <button
        type="button"
        className="civis-map-btn"
        data-active={layersOpen}
        onClick={onToggleLayers}
        aria-expanded={layersOpen}
        aria-label="Map layers and styles"
        title="Layers"
      >
        <Layers size={17} />
      </button>

      <button type="button" className="civis-map-btn" onClick={onFullscreen} aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"} title="Full screen">
        {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
      </button>

      <button type="button" className="civis-map-btn" onClick={onReset} aria-label="Reset map view" title="Reset view">
        <RotateCcw size={16} />
      </button>
    </div>
  );
}

export function MapLayersPanel({
  open,
  onClose,
  layers,
  counts,
  onToggleLayer,
  styleId,
  onStyle,
  lang,
  onLang,
  filters,
  onFilter,
  onClearFilters,
}: {
  open: boolean;
  onClose: () => void;
  layers: Record<LayerId, boolean>;
  counts: Record<LayerId, number>;
  onToggleLayer: (id: LayerId) => void;
  styleId: MapStyleId;
  onStyle: (id: MapStyleId) => void;
  lang: "en" | "bn";
  onLang: (lang: "en" | "bn") => void;
  filters: { category: string; severity: string; status: string };
  onFilter: (key: "category" | "severity" | "status", value: string) => void;
  onClearFilters: () => void;
}) {
  if (!open) return null;
  const dirty = Boolean(filters.category || filters.severity || filters.status);

  return (
    <div className="civis-panel" role="dialog" aria-label="Map layers and styles">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[13px] font-semibold text-fg">Layers</h2>
        <button type="button" onClick={onClose} aria-label="Close layers" className="grid size-7 place-items-center rounded-full text-muted hover:text-fg">
          <X size={14} />
        </button>
      </div>

      <div className="space-y-1">
        {LAYER_DEFS.map((layer) => (
          <button
            key={layer.id}
            type="button"
            onClick={() => onToggleLayer(layer.id)}
            aria-pressed={layers[layer.id]}
            className="civis-layer-row text-left"
          >
            <span
              className="civis-swatch"
              style={{ background: layers[layer.id] ? layer.color : "transparent", border: `1.5px solid ${layer.color}` }}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] text-fg">{layer.label}</span>
              <span className="block truncate text-[10.5px] text-muted">{layer.description}</span>
            </span>
            <span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] tabular-nums text-muted">
              {counts[layer.id]}
            </span>
            <span
              className={cx(
                "ml-1 h-4 w-7 shrink-0 rounded-full p-0.5 transition-colors",
                layers[layer.id] ? "bg-accent/70" : "bg-white/15",
              )}
              aria-hidden
            >
              <span
                className={cx(
                  "block size-3 rounded-full bg-white transition-transform",
                  layers[layer.id] ? "translate-x-3" : "translate-x-0",
                )}
              />
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 border-t border-white/10 pt-3">
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[.14em] text-muted">Map style</h3>
        <div className="grid grid-cols-3 gap-1.5">
          {MAP_STYLES.map((style) => (
            <button
              key={style.id}
              type="button"
              onClick={() => onStyle(style.id)}
              aria-pressed={styleId === style.id}
              className={cx(
                "rounded-lg border px-2 py-2 text-[11.5px] font-medium transition-colors",
                styleId === style.id
                  ? "border-accent/50 bg-accent/12 text-accent"
                  : "border-white/10 text-muted hover:text-fg",
              )}
            >
              {style.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 border-t border-white/10 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted">Labels</h3>
          <div className="flex rounded-full border border-white/10 p-0.5">
            {(["en", "bn"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onLang(value)}
                aria-pressed={lang === value}
                className={cx(
                  "rounded-full px-2.5 py-1 text-[10.5px]",
                  lang === value ? "bg-white/10 text-fg" : "text-muted hover:text-fg",
                )}
              >
                {value === "en" ? "EN" : "বাংলা"}
              </button>
            ))}
          </div>
        </div>
        <p className="text-[10.5px] leading-relaxed text-muted">
          Bangla uses <span className="font-mono">name:bn</span> where the tiles carry it and falls back to the
          local name, so a missing translation never blanks a label.
        </p>
      </div>

      <div className="mt-4 border-t border-white/10 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted">Report filters</h3>
          {dirty && (
            <button type="button" onClick={onClearFilters} className="text-[10.5px] text-accent underline underline-offset-2">
              Clear
            </button>
          )}
        </div>
        <div className="grid gap-1.5">
          <select
            aria-label="Filter reports by category"
            value={filters.category}
            onChange={(event) => onFilter("category", event.target.value)}
            className="h-9 w-full rounded-lg border border-white/10 bg-ink-soft px-2 text-[11.5px] text-fg"
          >
            <option value="">All categories</option>
            {CATEGORIES.map((item) => (
              <option key={item.slug} value={item.slug}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter reports by severity"
            value={filters.severity}
            onChange={(event) => onFilter("severity", event.target.value)}
            className="h-9 w-full rounded-lg border border-white/10 bg-ink-soft px-2 text-[11.5px] text-fg"
          >
            <option value="">Any severity</option>
            {SEVERITIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter reports by status"
            value={filters.status}
            onChange={(event) => onFilter("status", event.target.value)}
            className="h-9 w-full rounded-lg border border-white/10 bg-ink-soft px-2 text-[11.5px] text-fg"
          >
            <option value="">Any status</option>
            {STATUS_FLOW.filter((item) => item.value !== "rejected").map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
            <option value="unresolved">Open only</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </div>
    </div>
  );
}

export function GeoStatusBanner({
  state,
  fix,
  following,
  onRetry,
  onStopFollow,
  onDismiss,
}: {
  state: GeoState;
  fix: GeoFix | null;
  following: boolean;
  onRetry: () => void;
  onStopFollow: () => void;
  onDismiss: () => void;
}) {
  const [showHelp, setShowHelp] = useState(false);
  if (state === "idle") return null;

  const error = state === "denied" || state === "unavailable" || state === "timeout" || state === "unsupported" || state === "insecure";
  const message = GEO_MESSAGES[state];

  return (
    <div className="civis-geo-status" data-tone={error ? "error" : state === "found" ? "good" : "neutral"} role="status" aria-live="polite">
      <div className="flex w-full items-start gap-2">
        {error ? (
          <TriangleAlert size={15} className="mt-0.5 shrink-0 text-crit" aria-hidden />
        ) : state === "detecting" ? (
          <Spinner className="mt-0.5 size-3.5 shrink-0" />
        ) : (
          <LocateFixed size={15} className="mt-0.5 shrink-0 text-mint" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p>{message}</p>
          {state === "found" && fix && (
            <p className="mt-0.5 font-mono text-[10.5px] text-muted">
              {formatCoordinate(fix.lat, fix.lng)} · {formatDistance(fix.accuracy)}
              {following ? " · following" : ""}
            </p>
          )}
          {error && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={onRetry} className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-fg hover:bg-white/15">
                Retry location
              </button>
              <button type="button" onClick={() => setShowHelp((v) => !v)} className="rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-muted hover:text-fg">
                How to enable
              </button>
              <button type="button" onClick={onDismiss} className="rounded-full px-2 py-1 text-[11px] text-muted hover:text-fg">
                Select manually
              </button>
            </div>
          )}
          {state === "found" && following && (
            <button type="button" onClick={onStopFollow} className="mt-2 rounded-full border border-white/15 px-2.5 py-1 text-[11px] text-muted hover:text-fg">
              Stop following
            </button>
          )}
          {showHelp && (
            <ul className="mt-2 space-y-1 text-[10.5px] leading-relaxed text-muted">
              <li>Open the padlock icon in the address bar and allow Location.</li>
              <li>On Windows, check Settings → Privacy → Location is on.</li>
              <li>On mobile, check the OS location permission for this browser.</li>
              <li>CIVIS needs HTTPS or localhost to read a location at all.</li>
            </ul>
          )}
        </div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss location message" className="shrink-0 text-muted hover:text-fg">
          <X size={13} />
        </button>
      </div>
    </div>
  );
}

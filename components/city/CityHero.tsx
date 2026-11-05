"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Badge, Button, Spinner, cx } from "@/components/ui";
import { category, severityMeta, statusMeta } from "@/lib/constants";
import type { CityIncident, Quality } from "./CityScene";
import { projectToCity, severityColor } from "./CityScene";
import { SceneBoundary } from "./scene-boundary";

const CityScene = dynamic(() => import("./CityScene"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Spinner /> Building the city model…
      </div>
    </div>
  ),
});

function detectQuality(): Quality {
  if (typeof window === "undefined") return "balanced";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const width = window.innerWidth;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  if (reduced) return "low";
  if (width < 768 || memory <= 2 || cores <= 2) return "low";
  if (width < 1180 || memory <= 4) return "balanced";
  return "high";
}

export function CityHero({ incidents }: { incidents: CityIncident[] }) {
  const [quality, setQuality] = useState<Quality>("balanced");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [hover, setHover] = useState<{ x: number; z: number } | null>(null);
  const [hoverScreen, setHoverScreen] = useState<{ x: number; y: number } | null>(null);
  const [blockNotice, setBlockNotice] = useState<string | null>(null);
  const [reduced, setReduced] = useState(false);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuality(detectQuality());
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setMounted(true);
    const onResize = () => setQuality(detectQuality());
    window.addEventListener("resize", onResize);

    // R3F only measures its container from within an animation frame. A tab
    // that is backgrounded, minimised, or restored from bfcache never runs
    // one, so the scene would sit at 300×150 and never initialise. A synthetic
    // resize makes it measure immediately; harmless when already correct.
    const nudge = [60, 260, 800].map((ms) =>
      window.setTimeout(() => window.dispatchEvent(new Event("resize")), ms),
    );

    return () => {
      window.removeEventListener("resize", onResize);
      nudge.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  const selected = useMemo(
    () => incidents.find((i) => i.id === selectedId) ?? null,
    [incidents, selectedId],
  );

  const focus = useMemo(() => {
    if (!selected) return null;
    return projectToCity(selected.lat, selected.lng);
  }, [selected]);

  const projectIncident = useCallback((incident: CityIncident) => {
    return projectToCity(incident.lat, incident.lng);
  }, []);

  const handleInspectBlock = useCallback(
    (world: { x: number; z: number }) => {
      let nearest: { id: string; d: number } | null = null;
      for (const incident of incidents) {
        const p = projectIncident(incident);
        const d = Math.hypot(p.x - world.x, p.z - world.z);
        if (!nearest || d < nearest.d) nearest = { id: incident.id, d };
      }
      if (nearest && nearest.d < 26) {
        setSelectedId(nearest.id);
        setBlockNotice(null);
      } else {
        setBlockNotice("No reports recorded in this block yet. Drag to explore, or click a glowing marker.");
        setSelectedId(null);
        window.setTimeout(() => setBlockNotice(null), 4200);
      }
    },
    [incidents, projectIncident],
  );

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-0">
        {mounted && (
          <SceneBoundary>
            <CityScene
              incidents={incidents}
              quality={quality}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id);
                setBlockNotice(null);
              }}
              focus={focus}
              resetSignal={resetSignal}
              onHoverBuilding={(b, screen) => {
                setHover(b);
                setHoverScreen(screen ?? null);
              }}
              onInspectBlock={handleInspectBlock}
              reduced={reduced}
            />
          </SceneBoundary>
        )}
      </div>

      {/* atmospheric vignette */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_-10%,transparent_35%,rgba(8,13,23,0.55)_78%,rgba(8,13,23,0.95)_100%)]" />

      {/* control rail */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 sm:p-5">
        <div className="pointer-events-auto hidden gap-2 sm:flex">
          {[
            { label: "Drag", hint: "rotate" },
            { label: "Scroll", hint: "zoom" },
            { label: "Click", hint: "inspect" },
          ].map((item) => (
            <div
              key={item.label}
              className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] text-muted"
            >
              <span className="font-semibold text-fg">{item.label}</span>
              {item.hint}
            </div>
          ))}
        </div>

        <div className="pointer-events-auto ml-auto flex items-center gap-2">
          <div className="glass hidden items-center gap-2 rounded-full px-3 py-1.5 text-[11px] text-muted md:flex">
            <span className="size-1.5 rounded-full bg-mint" />
            {quality === "high" ? "Full detail" : quality === "balanced" ? "Adaptive detail" : "Lite mode"}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setResetSignal((v) => v + 1);
              setSelectedId(null);
            }}
            aria-label="Reset camera"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M2.5 8a5.5 5.5 0 1 1 1.7 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path d="M2 4.5V8h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            Reset view
          </Button>
        </div>
      </div>

      {/* building hover tooltip */}
      <AnimatePresence>
        {hover && hoverScreen && !selected && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-xl border border-white/12 bg-[#0b1320]/95 px-3 py-2 text-[11px] shadow-xl backdrop-blur"
            style={{
              left: Math.min(Math.max(hoverScreen.x, 90), (wrapRef.current?.clientWidth ?? 400) - 90),
              top: hoverScreen.y - 14,
            }}
          >
            <p className="font-semibold text-fg">City block</p>
            <p className="text-muted">
              {incidents.filter((i) => {
                const p = projectIncident(i);
                return Math.hypot(p.x - hover.x, p.z - hover.z) < 26;
              }).length}{" "}
              reports nearby · click to inspect
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* selected incident panel */}
      <AnimatePresence>
        {selected && (
          <motion.div
            key={selected.id}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="absolute bottom-16 left-3 z-30 w-[min(92vw,360px)] overflow-hidden rounded-[20px] border border-white/12 bg-[#0b1320]/95 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl sm:bottom-20 sm:left-5"
          >
            <div
              className="h-1 w-full"
              style={{ background: severityColor(selected.severity, selected.status) }}
            />
            <div className="p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <Badge color={severityMeta(selected.severity).color}>
                  {severityMeta(selected.severity).label} severity
                </Badge>
                <button
                  onClick={() => setSelectedId(null)}
                  className="rounded-full p-1 text-muted hover:bg-white/10 hover:text-fg"
                  aria-label="Close incident panel"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <h3 className="text-[14px] font-semibold leading-snug">{selected.title}</h3>
              <p className="mt-1.5 text-[11px] text-muted">
                {category(selected.category).label}
                {selected.neighborhood ? ` · ${selected.neighborhood}` : ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge color={statusMeta(selected.status).color} dot={false}>
                  {statusMeta(selected.status).label}
                </Badge>
                <Badge color="#929FB2" dot={false}>
                  {selected.id}
                </Badge>
              </div>
              <Link
                href={`/incidents/${selected.id}`}
                className="mt-4 flex h-9 items-center justify-center rounded-full bg-accent text-[13px] font-semibold text-ink transition-colors hover:bg-[#5ce2ff]"
              >
                Open incident
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {blockNotice && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute left-1/2 top-24 z-30 -translate-x-1/2 rounded-full border border-white/12 bg-[#0b1320]/95 px-4 py-2 text-[11px] text-muted shadow-xl backdrop-blur"
          >
            {blockNotice}
          </motion.div>
        )}
      </AnimatePresence>

      <div className={cx("absolute inset-0", !mounted && "opacity-0")} aria-hidden />
    </div>
  );
}

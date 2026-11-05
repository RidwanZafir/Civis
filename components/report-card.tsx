"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { Badge, cx } from "@/components/ui";
import { category, severityMeta, statusMeta, verificationMeta } from "@/lib/constants";
import { timeAgo } from "@/lib/format";
import type { ReportListItem } from "@/lib/repo";
import { EvidenceMedia } from "@/components/incident/evidence-media";

export function ReportCard({
  report,
  viewerId,
  initialSupported,
  compact,
  index = 0,
}: {
  report: ReportListItem;
  viewerId: string | null;
  initialSupported: boolean;
  compact?: boolean;
  index?: number;
}) {
  const [supported, setSupported] = useState(initialSupported);
  const [count, setCount] = useState(report.supporters);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleSupport(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!viewerId) {
      window.location.href = `/auth/sign-in?next=/incidents/${report.id}`;
      return;
    }
    if (busy) return;
    setBusy(true);
    setError(null);
    const next = !supported;
    setSupported(next);
    setCount((c) => c + (next ? 1 : -1));
    try {
      const res = await fetch(`/api/reports/${report.id}/support`, {
        method: next ? "POST" : "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not update support");
      }
      const data = (await res.json()) as { supported: boolean; supporters: number };
      setSupported(data.supported);
      setCount(data.supporters);
    } catch (err) {
      setSupported(!next);
      setCount((c) => c + (next ? -1 : 1));
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const sev = severityMeta(report.severity);
  const stat = statusMeta(report.status);
  const cat = category(report.category_slug);
  const ver = verificationMeta(report.verification);

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.2) }}
      className="group panel panel-hover relative overflow-hidden"
    >
      <Link href={`/incidents/${report.id}`} className="block">
        <div className="relative aspect-[16/10] overflow-hidden bg-ink-soft">
          {report.cover_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <EvidenceMedia
              src={report.cover_image}
              alt={report.title}
              controls={false}
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="grid h-full place-items-center text-muted">
              <span className="text-xs">No photograph</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0a1220] via-[#0a1220]/10 to-transparent" />
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            <Badge color={sev.color}>{sev.label}</Badge>
            {report.verification === "community_verified" && (
              <Badge color="#43D6A0" dot={false}>
                Verified
              </Badge>
            )}
            {report.is_demo === 1 && (
              <span className="rounded-full border border-white/15 bg-black/45 px-2 py-1 text-[10px] font-medium text-white/70 backdrop-blur">
                Demo
              </span>
            )}
          </div>
          <div className="absolute right-3 top-3">
            <span
              className="rounded-full border px-2 py-1 text-[10px] font-semibold backdrop-blur"
              style={{
                borderColor: `${stat.color}55`,
                color: stat.color,
                background: "rgba(8,13,23,0.6)",
              }}
            >
              {stat.label}
            </span>
          </div>
          <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between gap-2 text-[11px] text-white/80">
            <span className="truncate">{report.neighborhood ?? report.address ?? "Unmapped"}</span>
            <span>{timeAgo(report.created_at)}</span>
          </div>
        </div>
      </Link>

      <div className={cx("p-4", compact && "p-3.5")}>
        <div className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className="size-1.5 rounded-full" style={{ background: cat.color }} />
          {cat.label}
        </div>
        <Link href={`/incidents/${report.id}`}>
          <h3 className="mt-1.5 line-clamp-2 text-[15px] font-semibold leading-snug transition-colors group-hover:text-accent">
            {report.title}
          </h3>
        </Link>
        {!compact && (
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted">
            {report.description}
          </p>
        )}

        <div className="mt-3.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-[11px] text-muted">
            <button
              onClick={toggleSupport}
              disabled={busy}
              aria-pressed={supported}
              aria-label={supported ? "Remove support" : "Support this report"}
              className={cx(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-all",
                supported
                  ? "border-accent/45 bg-accent/12 text-accent"
                  : "border-white/10 text-muted hover:border-accent/35 hover:text-accent",
              )}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M8 13.5S2 9.8 2 5.9A3.4 3.4 0 0 1 8 3.6a3.4 3.4 0 0 1 6 2.3c0 3.9-6 7.6-6 7.6z"
                  fill={supported ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="tabular-nums">{count}</span>
            </button>
            <span className="flex items-center gap-1.5">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M2.5 3.5h11v7h-5l-3 2.5v-2.5h-3v-7z"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
              </svg>
              {report.comment_count}
            </span>
            {report.response_count > 0 && (
              <span className="flex items-center gap-1.5 text-mint">
                <span className="size-1.5 rounded-full bg-mint" />
                Official reply
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: ver.color }}>
            {report.verification === "unverified" ? "Unverified" : ver.label}
          </span>
        </div>
        {error && <p className="mt-2 text-[11px] text-crit">{error}</p>}
      </div>
    </motion.article>
  );
}

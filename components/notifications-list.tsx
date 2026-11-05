"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { BellRing, Search } from "lucide-react";
import { Button, EmptyState, Input, Spinner, cx } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  notificationCategory,
  notificationHref,
  notificationIcon,
  priorityColor,
  type NotificationItem,
} from "@/lib/notification-types";

type Filter = "all" | "unread" | (typeof CATEGORY_ORDER)[number];

const TABS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  ...CATEGORY_ORDER.map((value) => ({ value: value as Filter, label: CATEGORY_LABELS[value] })),
];

export function NotificationsList({
  items,
  unread,
  initialByCategory,
}: {
  items: NotificationItem[];
  unread: number;
  initialByCategory: Record<string, number>;
}) {
  const router = useRouter();
  const [list, setList] = useState(items);
  const [counts, setCounts] = useState(initialByCategory);
  const [unreadCount, setUnreadCount] = useState(unread);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const fetchList = useCallback(async (nextFilter: Filter, nextQuery: string, quiet = false) => {
    const id = ++requestId.current;
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ filter: nextFilter, limit: "100" });
      if (nextQuery.trim()) params.set("q", nextQuery.trim());
      const response = await fetch(`/api/notifications?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Notifications could not be loaded.");
      const data = (await response.json()) as {
        notifications?: NotificationItem[];
        unread?: number;
        byCategory?: Record<string, number>;
      };
      if (id !== requestId.current) return;
      setList(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadCount(Number(data.unread ?? 0));
      setCounts(data.byCategory ?? {});
    } catch (problem) {
      if (id === requestId.current) {
        setError(problem instanceof Error ? problem.message : "Notifications could not be loaded.");
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  // Search is debounced; tab changes fetch immediately.
  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchList(filter, query); }, 280);
    return () => window.clearTimeout(timer);
  }, [filter, query, fetchList]);

  const visible = list;

  async function markAll() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!response.ok) throw new Error("Could not mark notifications as read.");
      setList((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
      setUnreadCount(0);
      setCounts({});
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not mark notifications as read.");
    } finally {
      setBusy(false);
    }
  }

  async function markOne(id: string) {
    setError(null);
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      if (!response.ok) throw new Error("Could not mark this notification as read.");
      setList((current) => current.map((item) => (item.id === id ? { ...item, read_at: new Date().toISOString() } : item)));
      setUnreadCount((value) => Math.max(0, value - 1));
      const target = list.find((item) => item.id === id);
      if (target) {
        const category = notificationCategory(target);
        setCounts((current) => ({ ...current, [category]: Math.max(0, (current[category] ?? 0) - 1) }));
      }
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not mark this notification as read.");
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notifications"
            aria-label="Search notifications"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11.5px] text-muted">{unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}</span>
          <Button size="sm" variant="secondary" onClick={markAll} disabled={busy || unreadCount === 0}>
            {busy ? <Spinner className="size-3" /> : null}
            Mark all as read
          </Button>
        </div>
      </div>

      <div className="mt-4 flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Notification categories">
        {TABS.map((tab) => {
          const count = tab.value === "all" ? 0 : tab.value === "unread" ? unreadCount : counts[tab.value] ?? 0;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={filter === tab.value}
              onClick={() => setFilter(tab.value)}
              className={cx(
                "shrink-0 rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition-colors",
                filter === tab.value
                  ? "border-accent/35 bg-accent/[0.09] text-fg"
                  : "border-white/10 text-muted hover:border-white/20 hover:text-fg",
              )}
            >
              {tab.label}
              {count > 0 && <span className="ml-1.5 tabular-nums text-accent">{count}</span>}
            </button>
          );
        })}
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-crit/25 bg-crit/5 p-3 text-xs text-crit" role="alert">{error}</p>
      )}

      <div className="mt-4 space-y-2">
        {loading && visible.length === 0 ? (
          <div className="grid place-items-center py-16"><Spinner /></div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<BellRing size={22} />}
            title={query ? "No notifications match that search" : "No notifications yet"}
            description={
              query
                ? "Try a shorter term or a different category."
                : "Report updates, authority assignments, blood requests and verification decisions will appear here and stay in your history."
            }
          />
        ) : (
          visible.map((item, index) => {
            const icon = notificationIcon(item.type);
            const href = notificationHref(item);
            const category = notificationCategory(item);
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.02, 0.15) }}
                className={cx("panel flex items-start gap-3 p-3.5 transition-colors", !item.read_at && "border-accent/20 bg-accent/[0.03]")}
              >
                <span
                  className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border text-[13px]"
                  style={{ borderColor: `${icon.color}33`, color: icon.color, background: `${icon.color}10` }}
                  aria-hidden
                >
                  {icon.glyph}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                      {CATEGORY_LABELS[category]}
                    </span>
                    {item.priority && item.priority !== "normal" && (
                      <span
                        className="rounded-full px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em]"
                        style={{ color: priorityColor(item.priority), background: `${priorityColor(item.priority)}1a` }}
                      >
                        {item.priority}
                      </span>
                    )}
                    <span className="ml-auto text-[10px] text-muted">{timeAgo(item.created_at)}</span>
                  </div>
                  <div className="mt-1 flex items-start justify-between gap-3">
                    <p className="text-[13px] font-medium leading-snug">{item.title}</p>
                    {!item.read_at && <span className="mt-1 size-1.5 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
                  </div>
                  {item.body && <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">{item.body}</p>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10.5px] text-muted">
                    {href && (
                      <Link
                        href={href}
                        onClick={() => { if (!item.read_at) void markOne(item.id); }}
                        className="text-accent underline-offset-4 hover:underline"
                      >
                        {item.blood_request_id ? "Open blood request" : item.report_id ? "Open report" : "Open record"}
                      </Link>
                    )}
                    {!item.read_at && (
                      <button type="button" onClick={() => void markOne(item.id)} className="hover:text-fg">Mark as read</button>
                    )}
                    {item.read_at && <span className="text-[10px]">Read</span>}
                  </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}

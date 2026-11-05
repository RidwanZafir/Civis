"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, CheckCheck, X } from "lucide-react";
import { Spinner, cx } from "@/components/ui";
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

const POLL_MS = 45_000;

type Filter = "all" | "unread" | (typeof CATEGORY_ORDER)[number];

const SHORT_LABEL: Record<string, string> = {
  reports: "Reports",
  emergencies: "Emergency",
  blood: "Blood",
  authority: "Authority",
  moderation: "Moderation",
  system: "System",
};

export function NotificationBell({
  initialUnread,
  onUnreadChange,
}: {
  initialUnread: number;
  onUnreadChange?: (count: number) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(initialUnread);
  const [byCategory, setByCategory] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<NotificationItem | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const active = useRef(true);
  const lastTotal = useRef<number | null>(null);
  const lastArrival = useRef<{ id: string; title: string } | null>(null);

  const syncUnread = useCallback((count: number) => {
    setUnread(count);
    onUnreadChange?.(count);
  }, [onUnreadChange]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/notifications?limit=40", { cache: "no-store" });
      if (!response.ok) throw new Error("The notification feed is unavailable right now.");
      const data = (await response.json()) as {
        notifications?: NotificationItem[];
        unread?: number;
        byCategory?: Record<string, number>;
      };
      if (!active.current) return;
      const next = Array.isArray(data.notifications) ? data.notifications : [];
      setItems(next);
      syncUnread(Number(data.unread ?? 0));
      setByCategory(data.byCategory && typeof data.byCategory === "object" ? data.byCategory : {});
      setLoaded(true);
      setError(null);
      if (lastArrival.current) {
        const newest = next.find((item) => !item.read_at);
        if (newest) {
          setToast(newest);
          // Opt-in system notification, and only while the page is in the
          // background. The row is already stored either way.
          try {
            if (
              window.localStorage.getItem("civis.browserNotify") === "1" &&
              typeof Notification !== "undefined" &&
              Notification.permission === "granted" &&
              document.visibilityState !== "visible"
            ) {
              new Notification(newest.title, { body: newest.body ?? undefined, tag: newest.id });
            }
          } catch {
            // A refused browser notification must never break the feed.
          }
        }
        lastArrival.current = null;
      }
    } catch (problem) {
      if (active.current) {
        setError(problem instanceof Error ? problem.message : "The notification feed is unavailable right now.");
      }
    } finally {
      if (active.current) setLoading(false);
    }
  }, [syncUnread]);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  // A live change feed keeps the badge current without a page refresh. The
  // stream only announces that something changed; the list is re-read so the
  // rendered notifications always match the database.
  useEffect(() => {
    let source: EventSource | null = null;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let closed = false;

    const connect = () => {
      if (closed) return;
      try {
        source = new EventSource("/api/notifications/stream");
        source.addEventListener("ready", (event) => {
          try {
            const signature = JSON.parse((event as MessageEvent).data) as { total?: number; unread?: number };
            lastTotal.current = signature.total ?? null;
            if (typeof signature.unread === "number") syncUnread(signature.unread);
          } catch { /* Ignore a malformed initial frame. */ }
        });
        source.addEventListener("notifications", (event) => {
          let grew = false;
          try {
            const signature = JSON.parse((event as MessageEvent).data) as { total?: number; unread?: number };
            grew = lastTotal.current !== null && (signature.total ?? 0) > lastTotal.current;
            lastTotal.current = signature.total ?? lastTotal.current;
            if (typeof signature.unread === "number") syncUnread(signature.unread);
          } catch { /* Treat as a generic change. */ }
          if (grew) lastArrival.current = { id: "new", title: "" };
          void load(true);
        });
        source.onerror = () => {
          source?.close();
          source = null;
          if (!closed) reconnect = setTimeout(connect, 8_000);
        };
      } catch {
        reconnect = setTimeout(connect, 15_000);
      }
    };

    connect();
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, POLL_MS);
    const onVisibility = () => { if (document.visibilityState === "visible") void load(true); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);

    return () => {
      closed = true;
      if (reconnect) clearTimeout(reconnect);
      source?.close();
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, [load, syncUnread]);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 9_000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    if (!loaded) void load();
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || trigger.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, loaded, load]);

  const fcmUnread = (category: string) => byCategory[category] ?? 0;

  async function markAll() {
    setMarking(true);
    setError(null);
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!response.ok) throw new Error("Could not mark notifications as read.");
      setItems((list) => list.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
      setByCategory({});
      syncUnread(0);
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not mark notifications as read.");
    } finally {
      setMarking(false);
    }
  }

  async function markOne(id: string) {
    const wasUnread = items.some((item) => item.id === id && !item.read_at);
    try {
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      if (!response.ok) throw new Error("Could not mark this notification as read.");
      setItems((list) => list.map((item) => (item.id === id ? { ...item, read_at: item.read_at ?? new Date().toISOString() } : item)));
      if (wasUnread) syncUnread(Math.max(0, unread - 1));
      const target = items.find((item) => item.id === id);
      if (target) {
        const category = notificationCategory(target);
        setByCategory((counts) => ({ ...counts, [category]: Math.max(0, (counts[category] ?? 0) - 1) }));
      }
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Could not mark this notification as read.");
    }
  }

  const visible = items
    .filter((item) => filter === "all" || (filter === "unread" ? !item.read_at : notificationCategory(item) === filter))
    .slice(0, 12);

  return (
    <div className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="menu"
        className="relative grid size-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-muted transition-colors hover:border-white/20 hover:text-fg"
      >
        <Bell size={16} aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-crit px-1 text-[9px] font-bold tabular-nums text-[#2a0509]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* A short-lived toast for a newly arrived alert. It never replaces the
          stored notification, so a missed toast loses nothing. */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            className="fixed bottom-4 right-4 z-[90] w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#101827] p-3.5 shadow-[0_30px_80px_-25px_rgba(0,0,0,0.95)]"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-2.5">
              <span
                className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border text-[11px]"
                style={{
                  borderColor: `${priorityColor(toast.priority)}33`,
                  color: priorityColor(toast.priority),
                  background: `${priorityColor(toast.priority)}10`,
                }}
                aria-hidden
              >
                {notificationIcon(toast.type).glyph}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                  {CATEGORY_LABELS[notificationCategory(toast)]}
                </p>
                <p className="mt-0.5 text-[12.5px] font-medium leading-snug">{toast.title}</p>
                {toast.body && <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted">{toast.body}</p>}
                {notificationHref(toast) && (
                  <Link
                    href={notificationHref(toast)!}
                    onClick={() => { void markOne(toast.id); setToast(null); }}
                    className="mt-1.5 inline-block text-[11px] font-medium text-accent underline underline-offset-4"
                  >
                    Open
                  </Link>
                )}
              </div>
              <button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification" className="rounded-full p-1 text-muted hover:text-fg">
                <X size={12} aria-hidden />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.div
            ref={panel}
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            role="menu"
            aria-label="Notifications"
            className="absolute right-0 top-full z-[70] mt-2 w-[min(390px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#101827] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-3 py-2.5">
              <p className="text-[12px] font-semibold">
                Notifications {unread > 0 && <span className="ml-1 rounded-full bg-crit/15 px-1.5 py-0.5 text-[10px] text-crit">{unread} new</span>}
              </p>
              {unread > 0 ? (
                <button
                  type="button"
                  onClick={() => void markAll()}
                  disabled={marking}
                  className="inline-flex items-center gap-1 text-[10.5px] font-medium text-accent transition-colors hover:text-fg disabled:opacity-50"
                >
                  {marking ? <Spinner className="size-3" /> : <CheckCheck size={12} aria-hidden />}
                  Mark all read
                </button>
              ) : (
                <span className="text-[10.5px] text-muted">All caught up</span>
              )}
            </div>

            <div className="flex gap-1 overflow-x-auto border-b border-white/[0.07] px-2 py-1.5">
              {(["all", "unread", ...CATEGORY_ORDER] as Filter[]).map((value) => {
                const count = value === "all" ? items.length : value === "unread" ? unread : fcmUnread(value);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    className={cx(
                      "shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-medium transition-colors",
                      filter === value ? "bg-white/[0.09] text-fg" : "text-muted hover:text-fg",
                    )}
                  >
                    {value === "all" ? "All" : value === "unread" ? "Unread" : SHORT_LABEL[value]}
                    {value !== "all" && count > 0 ? <span className="ml-1 tabular-nums text-accent">{count}</span> : null}
                  </button>
                );
              })}
            </div>

            <div className="max-h-[min(62vh,380px)] overflow-y-auto p-1.5">
              {loading && !loaded ? (
                <div className="grid place-items-center py-10"><Spinner /></div>
              ) : error ? (
                <div className="px-3 py-6 text-center">
                  <p className="text-[11.5px] leading-relaxed text-crit" role="alert">{error}</p>
                  <button type="button" onClick={() => void load()} className="mt-2 text-[11px] text-accent underline underline-offset-4">Retry</button>
                </div>
              ) : visible.length === 0 ? (
                <p className="px-3 py-10 text-center text-[11.5px] leading-relaxed text-muted">
                  {filter === "all"
                    ? "No notifications yet. Report updates, authority responses, blood requests and verification decisions appear here."
                    : "Nothing in this category right now."}
                </p>
              ) : (
                visible.map((item) => {
                  const icon = notificationIcon(item.type);
                  const href = notificationHref(item);
                  return (
                    <div key={item.id} className={cx("flex gap-2.5 rounded-xl p-2.5 transition-colors hover:bg-white/[0.04]", !item.read_at && "bg-accent/[0.04]")}>
                      <span
                        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border text-[11px]"
                        style={{ borderColor: `${icon.color}33`, color: icon.color, background: `${icon.color}10` }}
                        aria-hidden
                      >
                        {icon.glyph}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
                            {CATEGORY_LABELS[notificationCategory(item)]}
                            {item.priority === "critical" && <span className="ml-1.5 rounded bg-crit/15 px-1 py-0.5 text-[9px] text-crit">critical</span>}
                          </p>
                          <span className="shrink-0 text-[9.5px] text-muted">{timeAgo(item.created_at)}</span>
                        </div>
                        {href ? (
                          <Link
                            href={href}
                            role="menuitem"
                            onClick={() => { setOpen(false); void markOne(item.id); }}
                            className="block text-[12px] font-medium leading-snug hover:text-accent"
                          >
                            {item.title}
                          </Link>
                        ) : (
                          <p className="text-[12px] font-medium leading-snug">{item.title}</p>
                        )}
                        {item.body && <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-relaxed text-muted">{item.body}</p>}
                        <div className="mt-1 flex items-center gap-2.5 text-[10px] text-muted">
                          {href && (
                            <Link href={href} onClick={() => { setOpen(false); void markOne(item.id); }} className="text-accent hover:underline">
                              {item.blood_request_id ? "View request" : item.report_id ? "View report" : "Open"}
                            </Link>
                          )}
                          {!item.read_at && (
                            <button type="button" onClick={() => void markOne(item.id)} className="hover:text-fg">Mark read</button>
                          )}
                        </div>
                      </div>
                      {!item.read_at && <span className="mt-1 size-1.5 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
                    </div>
                  );
                })
              )}
            </div>

            <div className="border-t border-white/[0.07] p-1.5">
              <Link
                href="/dashboard/notifications"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="block rounded-lg px-3 py-2 text-center text-[11px] font-medium text-accent transition-colors hover:bg-white/[0.05] hover:text-fg"
              >
                Open notification centre
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

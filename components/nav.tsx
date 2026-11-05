"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Avatar, ButtonLink, cx } from "@/components/ui";
import { NotificationBell } from "@/components/notification-bell";
import type { SessionUser } from "@/lib/auth";

const LINKS = [
  { href: "/emergency", label: "Emergency" },
  { href: "/hospitals", label: "Hospitals" },
  { href: "/blood", label: "Blood Connect" },
  { href: "/explore", label: "Explore" },
  { href: "/community", label: "Community" },
  { href: "/insights", label: "Safety Insights" },
  { href: "/about", label: "About" },
];

const STAFF_LINKS: Record<string, { href: string; label: string }> = {
  authority: { href: "/authority", label: "Authority centre" },
  moderator: { href: "/moderation", label: "Moderation" },
  admin: { href: "/admin", label: "Admin" },
};

export function Wordmark({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-2.5" aria-label="CIVIS home">
      <span className="relative grid size-8 place-items-center rounded-[10px] border border-accent/30 bg-accent/[0.08]">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 2.6l7.4 2.8v6c0 4.7-3.2 8-7.4 9.4C7.8 19.4 4.6 16.1 4.6 11.4v-6L12 2.6z"
            stroke="url(#navgrad)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="11" r="2.1" fill="url(#navgrad)" />
          <defs>
            <linearGradient id="navgrad" x1="4" y1="2" x2="20" y2="21">
              <stop stopColor="#36D9FF" />
              <stop offset="1" stopColor="#43D6A0" />
            </linearGradient>
          </defs>
        </svg>
        <span className="absolute inset-0 rounded-[10px] opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-hover:shadow-[0_0_22px_-4px_rgba(54,217,255,0.7)]" />
      </span>
      {!compact && (
        <span className="text-[15px] font-bold tracking-[0.18em] text-fg">CIVIS</span>
      )}
    </Link>
  );
}

export function Nav({ user, unread }: { user: SessionUser | null; unread: number }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(unread);

  useEffect(() => { setNotificationCount(unread); }, [unread]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  // The map workspace has its own chrome and needs every pixel.
  const isMap = pathname?.startsWith("/explore");
  const staff = user ? STAFF_LINKS[user.role] : undefined;

  return (
    <header
      className={cx(
        "fixed inset-x-0 top-0 z-[60] transition-all duration-300",
        scrolled ? "pt-2" : "pt-4",
      )}
    >
      <div className="mx-auto w-full max-w-[1240px] px-3 sm:px-5">
        <div
          className={cx(
            "flex items-center justify-between gap-3 rounded-full px-3 py-2 transition-all duration-300 sm:px-4",
            scrolled || menuOpen
              ? "glass shadow-[0_20px_60px_-40px_rgba(0,0,0,0.95)]"
              : "border border-transparent bg-transparent",
          )}
        >
          <Wordmark />

          {!isMap && (
            <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Primary">
              {LINKS.map((link) => {
                const active =
                  pathname === link.href || pathname?.startsWith(`${link.href}/`);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cx(
                      "relative rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors",
                      active ? "text-fg" : "text-muted hover:text-fg",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="nav-active"
                        className="absolute inset-0 rounded-full border border-white/10 bg-white/[0.06]"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      />
                    )}
                    <span className="relative z-10">{link.label}</span>
                  </Link>
                );
              })}
            </nav>
          )}

          <div className="flex items-center gap-2">
            {user ? (
              <>
                <NotificationBell initialUnread={unread} onUnreadChange={setNotificationCount} />
                <div className="relative hidden sm:block">
                <button
                  onClick={() => setAccountOpen((v) => !v)}
                  aria-expanded={accountOpen}
                  aria-haspopup="menu"
                  className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-1 pr-2.5 transition-colors hover:border-white/20"
                >
                  <Avatar name={user.name} size={26} />
                  <span className="text-[13px] font-medium">{user.name.split(" ")[0]}</span>
                  <svg width="10" height="10" viewBox="0 0 10 10" className="text-muted" aria-hidden>
                    <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" />
                  </svg>
                </button>
                <AnimatePresence>
                  {accountOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.97 }}
                      transition={{ duration: 0.16 }}
                      role="menu"
                      className="absolute right-0 mt-2 w-60 overflow-hidden rounded-2xl border border-white/10 bg-[#101827] p-1.5 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]"
                    >
                      <div className="px-3 py-2">
                        <p className="truncate text-[13px] font-semibold">{user.name}</p>
                        <p className="truncate text-[11px] text-muted">{user.email}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-wider text-accent">
                          {user.role}
                          {user.department_name ? ` · ${user.department_name}` : ""}
                        </p>
                      </div>
                      <div className="my-1 h-px bg-white/[0.07]" />
                      {[
                        { href: "/dashboard", label: "My reports" },
                        { href: "/dashboard/notifications", label: `Notifications${notificationCount ? ` (${notificationCount})` : ""}` },
                        { href: "/dashboard/settings", label: "Settings" },
                        ...(staff ? [staff] : []),
                      ].map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          role="menuitem"
                          className="block rounded-lg px-3 py-2 text-[13px] text-muted transition-colors hover:bg-white/[0.06] hover:text-fg"
                        >
                          {item.label}
                        </Link>
                      ))}
                      <div className="my-1 h-px bg-white/[0.07]" />
                      <form action="/api/auth/sign-out" method="post">
                        <button
                          type="submit"
                          role="menuitem"
                          className="w-full rounded-lg px-3 py-2 text-left text-[13px] text-crit/90 transition-colors hover:bg-crit/10"
                        >
                          Sign out
                        </button>
                      </form>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              </>
            ) : (
              <Link
                href="/auth/sign-in"
                className="hidden rounded-full px-3.5 py-2 text-[13px] font-medium text-muted transition-colors hover:text-fg sm:block"
              >
                Sign in
              </Link>
            )}

            <ButtonLink href="/report" size="sm" className="hidden sm:inline-flex">
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              Report issue
            </ButtonLink>

            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              className="grid size-9 place-items-center rounded-full border border-white/10 bg-white/[0.04] lg:hidden"
            >
              <span className="relative block h-3 w-4">
                <span
                  className={cx(
                    "absolute left-0 h-[1.5px] w-4 rounded bg-fg transition-all",
                    menuOpen ? "top-1.5 rotate-45" : "top-0.5",
                  )}
                />
                <span
                  className={cx(
                    "absolute left-0 top-1.5 h-[1.5px] w-4 rounded bg-fg transition-opacity",
                    menuOpen && "opacity-0",
                  )}
                />
                <span
                  className={cx(
                    "absolute left-0 h-[1.5px] w-4 rounded bg-fg transition-all",
                    menuOpen ? "top-1.5 -rotate-45" : "top-2.5",
                  )}
                />
              </span>
            </button>
          </div>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="mt-2 overflow-hidden rounded-3xl border border-white/10 bg-[#0c1320]/95 p-2 backdrop-blur-xl lg:hidden"
            >
              {LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block rounded-2xl px-4 py-3 text-sm font-medium text-muted transition-colors hover:bg-white/[0.06] hover:text-fg"
                >
                  {link.label}
                </Link>
              ))}
              <div className="my-1 h-px bg-white/[0.07]" />
              {user ? (
                <>
                  <Link href="/dashboard" className="block rounded-2xl px-4 py-3 text-sm text-muted hover:bg-white/[0.06] hover:text-fg">
                    My reports
                  </Link>
                  <Link href="/dashboard/notifications" className="block rounded-2xl px-4 py-3 text-sm text-muted hover:bg-white/[0.06] hover:text-fg">
                    Notifications {notificationCount > 0 && <span className="text-crit">({notificationCount})</span>}
                  </Link>
                  {staff && (
                    <Link href={staff.href} className="block rounded-2xl px-4 py-3 text-sm text-muted hover:bg-white/[0.06] hover:text-fg">
                      {staff.label}
                    </Link>
                  )}
                  <form action="/api/auth/sign-out" method="post">
                    <button className="w-full rounded-2xl px-4 py-3 text-left text-sm text-crit/90">
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <Link href="/auth/sign-in" className="block rounded-2xl px-4 py-3 text-sm text-muted hover:bg-white/[0.06] hover:text-fg">
                  Sign in
                </Link>
              )}
              <div className="p-2">
                <ButtonLink href="/report" className="w-full">
                  Report an issue
                </ButtonLink>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}

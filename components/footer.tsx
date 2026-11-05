import Link from "next/link";
import { BRAND } from "@/lib/constants";

const COLUMNS = [
  {
    title: "Explore",
    links: [
      { href: "/emergency", label: "Emergency Center" },
      { href: "/explore", label: "City map" },
      { href: "/community", label: "Community feed" },
      { href: "/insights", label: "Safety insights" },
      { href: "/report", label: "Report an issue" },
    ],
  },
  {
    title: "Community",
    links: [
      { href: "/guidelines", label: "Community guidelines" },
      { href: "/about#verification", label: "How verification works" },
      { href: "/dashboard", label: "My reports" },
      { href: "/about#contact", label: "Contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms of use" },
      { href: "/privacy#data", label: "Your data" },
      { href: "/about#openness", label: "Transparency" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative mt-24 border-t border-white/[0.06]">
      <div className="mx-auto max-w-[1240px] px-5 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="grid size-8 place-items-center rounded-[10px] border border-accent/30 bg-accent/[0.08]">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M12 2.6l7.4 2.8v6c0 4.7-3.2 8-7.4 9.4C7.8 19.4 4.6 16.1 4.6 11.4v-6L12 2.6z"
                    stroke="#36D9FF"
                    strokeWidth="1.5"
                    strokeLinejoin="round"
                  />
                  <circle cx="12" cy="11" r="2.1" fill="#43D6A0" />
                </svg>
              </span>
              <span className="text-[14px] font-bold tracking-[0.18em]">CIVIS</span>
            </div>
            <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-muted">
              {BRAND.mission}
            </p>
            <p className="mt-4 text-[11px] leading-relaxed text-muted/70">
              Built for neighbourhoods everywhere. Demonstration deployment — seeded records are
              labelled and no real authority has responded to them.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="eyebrow mb-3">{col.title}</p>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-[13px] text-muted transition-colors hover:text-fg"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-white/[0.06] pt-6 text-[11px] text-muted sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} CIVIS. See what&apos;s broken. Make it better.</p>
          <p className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-mint" />
            Map data © OpenStreetMap contributors
          </p>
        </div>
      </div>
    </footer>
  );
}

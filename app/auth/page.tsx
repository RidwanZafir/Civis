import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Footer } from "@/components/footer";
import { Panel } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Choose your portal" };

const PORTALS = [
  {
    key: "user",
    eyebrow: "I'm a user",
    title: "Report problems and track your incidents",
    body: "Register as an individual to report incidents, follow your reports, and help improve community safety.",
    primary: { href: "/auth/sign-up?portal=user", label: "Create a user account" },
    secondary: { href: "/auth/sign-in?portal=user", label: "Sign in" },
    tertiary: { href: "/auth/forgot?portal=user", label: "Forgot password" },
    accent: "#36D9FF",
  },
  {
    key: "authority",
    eyebrow: "I'm an authority",
    title: "Manage public reports and coordinate responses",
    body: "For verified government departments, emergency services and authorised organisations responsible for responding to public reports.",
    primary: { href: "/auth/register-authority", label: "Register your organisation" },
    secondary: { href: "/auth/sign-in?portal=authority", label: "Authority sign in" },
    tertiary: { href: "/auth/forgot?portal=authority", label: "Forgot password" },
    accent: "#43D6A0",
  },
];

export default async function PortalChooserPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <>
      <div className="relative min-h-dvh px-5 pb-20 pt-32">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(50%_100%_at_50%_0%,rgba(54,217,255,0.10),transparent)]" />
        <div className="relative mx-auto max-w-[980px]">
          <p className="eyebrow mb-2">Choose your portal</p>
          <h1 className="text-[clamp(1.8rem,4vw,2.6rem)] font-semibold">One platform. Two portals.</h1>
          <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-muted">
            CIVIS connects communities with the organisations responsible for public safety. Pick the
            experience that matches who you are — the two portals share one brand, one map and one
            incident record.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {PORTALS.map((portal) => (
              <Panel key={portal.key} className="flex flex-col p-6">
                <span
                  className="text-[10.5px] font-semibold uppercase tracking-[0.16em]"
                  style={{ color: portal.accent }}
                >
                  {portal.eyebrow}
                </span>
                <h2 className="mt-2 text-[17px] font-semibold leading-snug">{portal.title}</h2>
                <p className="mt-2 flex-1 text-[12.5px] leading-relaxed text-muted">{portal.body}</p>
                <div className="mt-5 space-y-2">
                  <Link
                    href={portal.primary.href}
                    className="block rounded-full px-4 py-2.5 text-center text-[13px] font-semibold text-ink"
                    style={{ backgroundColor: portal.accent }}
                  >
                    {portal.primary.label}
                  </Link>
                  <div className="flex items-center justify-between gap-2 rounded-full border border-white/10 px-4 py-2.5">
                    <Link href={portal.secondary.href} className="text-[12.5px] hover:text-accent">
                      {portal.secondary.label}
                    </Link>
                    <Link href={portal.tertiary.href} className="text-[11px] text-muted hover:text-fg">
                      {portal.tertiary.label}
                    </Link>
                  </div>
                </div>
              </Panel>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.015] px-5 py-4">
            <div>
              <p className="text-[12px] font-semibold">CIVIS platform administrator?</p>
              <p className="text-[11px] text-muted">
                Super administrator accounts are provisioned internally. There is no public
                registration route for them.
              </p>
            </div>
            <Link
              href="/auth/sign-in?portal=admin"
              className="rounded-full border border-white/12 px-4 py-2 text-[12px] text-muted transition-colors hover:border-accent/40 hover:text-fg"
            >
              Administrator sign in
            </Link>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}

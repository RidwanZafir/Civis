import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/footer";
import { ButtonLink, DemoNote, Panel } from "@/components/ui";
import { BRAND } from "@/lib/constants";

export const metadata: Metadata = {
  title: "About CIVIS",
  description: BRAND.mission,
};

export default function AboutPage() {
  return (
    <>
      <div className="relative pt-28 sm:pt-32">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_40%_0%,rgba(54,217,255,0.10),transparent)]" />
        <div className="relative mx-auto max-w-[900px] px-5">
          <p className="eyebrow mb-3">About</p>
          <h1 className="max-w-2xl text-[clamp(1.9rem,4.4vw,2.9rem)] font-semibold leading-[1.06]">
            {BRAND.mission}
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted">
            CIVIS is a community-powered public infrastructure reporting and safety platform. It
            exists to answer three questions honestly: what is broken, who has seen it, and has
            anything actually happened since.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[900px] space-y-6 px-5 py-10">
        <Panel className="p-6">
          <h2 className="text-[16px] font-semibold">Why it exists</h2>
          <div className="mt-3 space-y-3 text-[13.5px] leading-relaxed text-muted">
            <p>
              Most infrastructure problems are invisible until they hurt someone: a dark stretch of
              road, a crossing worn away, a drain that floods the same lane every monsoon. Reporting
              is fragmented across phone numbers, WhatsApp groups and ward offices that keep no shared
              record.
            </p>
            <p>
              CIVIS makes the record public and durable. One report becomes a permanent, addressable
              entry that neighbours can corroborate and authorities can respond to on the record.
            </p>
          </div>
        </Panel>

        <Panel className="p-6" id="verification">
          <h2 className="text-[16px] font-semibold">How verification works</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Trust is the product. CIVIS separates four states that are often blurred together.
          </p>
          <ol className="mt-4 space-y-3">
            {[
              ["Community submitted", "Anyone with an account can submit. The report is published immediately and marked unverified."],
              ["Under review", "A moderator checks the photograph, the pin location and whether a verified report for the same problem already exists."],
              ["Community verified", "Independent neighbours confirm the problem exists on site. This is counted in public statistics, but it is not an official statement."],
              ["Officially confirmed", "A verified authority account assigned to the incident accepts it. Only then is a report described as officially confirmed."],
            ].map(([title, body], i) => (
              <li key={title} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full border border-accent/30 bg-accent/[0.08] text-[10px] font-semibold text-accent">
                  {i + 1}
                </span>
                <div>
                  <p className="text-[13px] font-medium">{title}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 border-t border-white/[0.07] pt-3 text-[12px] leading-relaxed text-muted">
            Automated checks and AI assistance can flag duplicates or suggest a category. They can
            never mark an incident verified or confirmed.
          </p>
        </Panel>

        <Panel className="p-6" id="openness">
          <h2 className="text-[16px] font-semibold">Transparency commitments</h2>
          <ul className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-muted">
            {[
              "Every status change is timestamped and attributed to the account that made it, and the full history stays visible.",
              "Official responses can only be published by authority accounts assigned to the incident. CIVIS never simulates one.",
              "Public statistics count verified incidents only, and metric definitions are published alongside the numbers.",
              "Aggregated data can be exported as CSV or printed as a report, with no personal information included.",
              "Role permissions are enforced on the server for every action, not just hidden in the interface.",
            ].map((item) => (
              <li key={item} className="flex gap-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-mint" />
                {item}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel className="p-6">
          <h2 className="text-[16px] font-semibold">Roles</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {[
              ["Citizen", "Report issues, support and follow incidents, comment, track your own submissions."],
              ["Moderator", "Review evidence, detect duplicates, moderate comments, verify or reject reports."],
              ["Authority", "Accept incidents assigned to their department, publish responses, update progress, upload resolution evidence."],
              ["Administrator", "Manage users, departments and permissions, and review the platform audit log."],
            ].map(([role, body]) => (
              <div key={role} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
                <p className="text-[12.5px] font-semibold">{role}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">{body}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="p-6" id="contact">
          <h2 className="text-[16px] font-semibold">This deployment</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            This is a self-contained demonstration deployment running against a local database. It
            ships with seeded sample records so that every screen, filter and statistic has something
            real to compute over — those rows are flagged as demonstration data everywhere they appear.
          </p>
          <div className="mt-4">
            <DemoNote />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink href="/explore" size="sm">
              Explore the map
            </ButtonLink>
            <ButtonLink href="/guidelines" size="sm" variant="secondary">
              Community guidelines
            </ButtonLink>
            <Link
              href="/privacy"
              className="flex h-9 items-center rounded-full px-3 text-[13px] text-muted hover:text-fg"
            >
              Privacy
            </Link>
          </div>
        </Panel>
      </div>

      <Footer />
    </>
  );
}

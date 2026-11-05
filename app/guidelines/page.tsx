import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import { Panel } from "@/components/ui";

export const metadata: Metadata = {
  title: "Community guidelines",
  description: "How to report responsibly on CIVIS.",
};

const RULES = [
  {
    title: "Report what you have seen",
    body: "Photograph the problem yourself if you can. Do not upload images from other people, other streets or other years, and do not reuse a photograph of a different issue.",
  },
  {
    title: "One report per problem",
    body: "Search the map first. If a verified report already exists nearby, support it and add context instead of filing a duplicate. Duplicates are detected automatically and can be closed by moderators.",
  },
  {
    title: "Protect people, not just property",
    body: "Do not photograph faces, number plates, house numbers or anything that identifies a private individual. Frame the infrastructure, not the person.",
  },
  {
    title: "Be accurate about severity",
    body: "Critical means immediate danger to life: exposed live wiring, an open deep pit, a collapsing structure. Inflating severity slows down the reports that genuinely need urgency.",
  },
  {
    title: "Keep discussion useful",
    body: "Comments should add local knowledge. Abuse, speculation about individuals, political campaigning and commercial promotion are removed.",
  },
  {
    title: "Do not impersonate authority",
    body: "Only verified authority accounts can publish official responses. Claiming to speak for a department is a suspendable offence, and official actions are attributed in the audit log.",
  },
];

export default function GuidelinesPage() {
  return (
    <>
      <div className="relative pt-28 sm:pt-32">
        <div className="mx-auto max-w-[820px] px-5">
          <p className="eyebrow mb-3">Community guidelines</p>
          <h1 className="text-[clamp(1.8rem,4vw,2.6rem)] font-semibold leading-tight">
            Reporting responsibly is what makes this work.
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-muted">
            CIVIS is only as useful as its worst report. These rules exist so that a verified badge
            means something to a resident, a journalist and a ward engineer alike.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[820px] space-y-3 px-5 py-10">
        {RULES.map((rule, i) => (
          <Panel key={rule.title} className="p-5">
            <div className="flex gap-3.5">
              <span className="mt-0.5 text-[11px] font-semibold tabular-nums text-muted/60">
                0{i + 1}
              </span>
              <div>
                <h2 className="text-[14px] font-semibold">{rule.title}</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{rule.body}</p>
              </div>
            </div>
          </Panel>
        ))}

        <Panel className="p-5">
          <h2 className="text-[14px] font-semibold">Enforcement</h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            Moderators can hide comments, reject reports and flag accounts. Suspensions are recorded in
            the audit log with the reason and the responsible account. If you believe a decision was
            wrong, use the “Report misleading content” action on the report — it creates a reviewed
            record rather than a private message that disappears.
          </p>
        </Panel>
      </div>

      <Footer />
    </>
  );
}

import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import { Panel } from "@/components/ui";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The terms that apply to using CIVIS.",
};

export default function TermsPage() {
  return (
    <>
      <div className="relative pt-28 sm:pt-32">
        <div className="mx-auto max-w-[820px] px-5">
          <p className="eyebrow mb-3">Terms of use</p>
          <h1 className="text-[clamp(1.8rem,4vw,2.6rem)] font-semibold leading-tight">
            A public record, with public responsibilities.
          </h1>
        </div>
      </div>

      <div className="mx-auto max-w-[820px] space-y-3 px-5 py-10">
        {[
          {
            title: "What CIVIS is",
            body: "CIVIS is a reporting and transparency tool. It is not an emergency service and it does not dispatch help. If someone is in immediate danger, contact emergency services directly.",
          },
          {
            title: "Your reports",
            body: "You keep ownership of the content you submit and grant CIVIS a licence to display it, distribute it as part of public statistics, and retain it as part of the incident record. You confirm that you took the photographs you upload or have permission to use them.",
          },
          {
            title: "Accurate representation",
            body: "You must not publish official-sounding statements, impersonate a department, or claim a resolution that has not happened. Authority responses are restricted to verified authority accounts and are attributed and timestamped.",
          },
          {
            title: "Moderation",
            body: "Moderators may reject reports, hide comments, or suspend accounts that breach the community guidelines. Decisions are recorded in the audit log.",
          },
          {
            title: "Availability",
            body: "This demonstration deployment is provided as-is, without any warranty of uptime or data durability. Do not use it as the only record of a safety-critical hazard.",
          },
          {
            title: "Demonstration data",
            body: "Seeded sample records are labelled as demonstration data and do not describe real incidents, real people or real departmental actions.",
          },
        ].map((section) => (
          <Panel key={section.title} className="p-5">
            <h2 className="text-[14.5px] font-semibold">{section.title}</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{section.body}</p>
          </Panel>
        ))}
      </div>

      <Footer />
    </>
  );
}

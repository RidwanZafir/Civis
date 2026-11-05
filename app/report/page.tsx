import type { Metadata } from "next";
import { ReportWizard } from "@/components/report/wizard";
import { Footer } from "@/components/footer";
import { ButtonLink, Panel } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Report an issue",
  description: "Report broken streetlights, dangerous potholes, flooding and other public infrastructure problems.",
};

export default async function ReportPage() {
  const user = await getCurrentUser();

  return (
    <>
      <div className="relative pt-28 sm:pt-32">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(54,217,255,0.10),transparent)]" />
        <div className="relative mx-auto max-w-3xl px-5">
          <p className="eyebrow mb-3">New report</p>
          <h1 className="text-[clamp(1.8rem,4vw,2.6rem)] font-semibold leading-tight">
            Report a public infrastructure problem
          </h1>
          <p className="mt-3 max-w-xl text-[14px] leading-relaxed text-muted">
            Two minutes of your time gives your neighbourhood a permanent, traceable record. Be
            specific, add a photograph if you can, and only report what you have seen yourself.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-5 py-10">
        {user ? (
          <ReportWizard anonymousDefault={user.anonymous_default === 1} />
        ) : (
          <Panel className="p-7 text-center">
            <div className="mx-auto grid size-12 place-items-center rounded-full border border-accent/30 bg-accent/[0.08]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M12 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4.5 20a7.5 7.5 0 0 1 15 0"
                  stroke="#36D9FF"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <h2 className="mt-4 text-lg font-semibold">Sign in to submit a report</h2>
            <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-muted">
              Reports are tied to an account so that evidence, comments and official responses can be
              attributed and moderated. You can still choose to publish anonymously.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <ButtonLink href="/auth/sign-in?next=/report">Sign in</ButtonLink>
              <ButtonLink href="/auth/sign-up?next=/report" variant="secondary">
                Create an account
              </ButtonLink>
            </div>
            <p className="mt-4 text-[11px] text-muted">
              Just want to look around?{" "}
              <a href="/explore" className="text-accent underline-offset-4 hover:underline">
                Explore the map
              </a>
              .
            </p>
          </Panel>
        )}
      </div>

      <Footer />
    </>
  );
}

import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import { Panel } from "@/components/ui";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What CIVIS stores, what it shows publicly, and what you can delete.",
};

export default function PrivacyPage() {
  return (
    <>
      <div className="relative pt-28 sm:pt-32">
        <div className="mx-auto max-w-[820px] px-5">
          <p className="eyebrow mb-3">Privacy</p>
          <h1 className="text-[clamp(1.8rem,4vw,2.6rem)] font-semibold leading-tight">
            Your account is public. Your identity does not have to be.
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-muted">
            This page describes exactly what this deployment stores and what it shows to other people.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[820px] space-y-3 px-5 py-10">
        <Panel className="p-6" id="data">
          <h2 className="text-[15px] font-semibold">What is stored</h2>
          <ul className="mt-3 space-y-2 text-[13px] leading-relaxed text-muted">
            <li>• Account: your name, email address, a scrypt password hash and your role.</li>
            <li>• Reports: title, description, category, severity, coordinates, photographs and the status history.</li>
            <li>• Activity: support, follows, comments and notifications associated with your account.</li>
            <li>• Audit trail: staff actions, with the acting account, timestamp and result.</li>
            <li>• Session: a single httpOnly cookie holding a random token; the database stores only its SHA-256 hash.</li>
          </ul>
        </Panel>

        <Panel className="p-6">
          <h2 className="text-[15px] font-semibold">What other people see</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Public report pages show the reported location, evidence and status history. Your name is
            shown only if you keep “Show my name on reports” enabled. Reports submitted anonymously
            display as “Anonymous reporter”; moderators and the assigned authority can still see the
            reporter in the restricted trail so that abuse can be investigated.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Your email address is never shown publicly, and other users cannot search for you by email.
          </p>
        </Panel>

        <Panel className="p-6">
          <h2 className="text-[15px] font-semibold">Location</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Coordinates describe the reported infrastructure, not your device. If you use “use my
            current location”, the coordinates are placed on the report only when you submit, and you
            can move the pin anywhere before submitting. CIVIS does not record device location in the
            background and does not store GPS history.
          </p>
        </Panel>

        <Panel className="p-6">
          <h2 className="text-[15px] font-semibold">Retention and deletion</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            You can delete your account from your settings at any time. Deletion removes your profile,
            email address and sessions. Submitted reports remain in the public record without your
            identity attached, because deleting incidents retroactively would let reports be gamed and
            would erase community evidence that other people relied on.
          </p>
        </Panel>

        <Panel className="p-6">
          <h2 className="text-[15px] font-semibold">Exports and statistics</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Public statistics and CSV exports contain aggregate counts only. No names, emails, comments
            or precise personal locations are included in any export.
          </p>
        </Panel>

        <Panel className="p-6">
          <h2 className="text-[15px] font-semibold">Cookies</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            One cookie is used, and only to keep you signed in. There is no advertising, tracking or
            third-party analytics script in this deployment. Map tiles are requested from a public tile
            provider, which necessarily receives the tile coordinates you view.
          </p>
        </Panel>
      </div>

      <Footer />
    </>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Field, Input, Panel, Select, Spinner } from "@/components/ui";

const ORG_TYPES = [
  ["police", "Police department"],
  ["fire", "Fire & rescue service"],
  ["ambulance", "Emergency medical service"],
  ["municipal", "Municipal / local government"],
  ["roads", "Roads & highway authority"],
  ["disaster", "Disaster management"],
  ["environment", "Environmental authority"],
  ["utility", "Utility authority"],
  ["health", "Health department"],
  ["other", "Other public organisation"],
] as const;

type Result = { status: string; message: string; applicationId: string } | null;

export function AuthorityRegisterForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const payload: Record<string, string> = {};
    form.forEach((value, key) => {
      if (typeof value === "string" && value.trim()) payload[key] = value.trim();
    });

    try {
      const res = await fetch("/api/authorities/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not submit the application");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
    setBusy(false);
  }

  if (result) {
    return (
      <Panel className="p-7">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-warn">
          Pending verification
        </span>
        <h2 className="mt-2 text-[17px] font-semibold">Application submitted</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">{result.message}</p>
        <p className="mt-3 font-mono text-[11px] text-muted">Reference: {result.applicationId}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href="/auth/sign-in?portal=authority"
            className="rounded-full bg-mint px-4 py-2 text-[12.5px] font-semibold text-ink"
          >
            Authority sign in
          </Link>
          <Link
            href="/"
            className="rounded-full border border-white/12 px-4 py-2 text-[12.5px] text-muted hover:text-fg"
          >
            Back to CIVIS
          </Link>
        </div>
        <p className="mt-4 text-[11px] leading-relaxed text-muted">
          Your account exists but authority features stay locked until an administrator approves the
          organisation. Signing in before approval shows the pending state; it does not grant access.
        </p>
      </Panel>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <Panel className="p-6">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">
          Organisation information
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Organisation name" required htmlFor="organisationName">
            <Input id="organisationName" name="organisationName" required minLength={3} />
          </Field>
          <Field label="Organisation type" required htmlFor="organisationType">
            <Select id="organisationType" name="organisationType" required defaultValue="police">
              {ORG_TYPES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Department" htmlFor="department">
            <Input id="department" name="department" placeholder="Traffic division" />
          </Field>
          <Field label="Country" required htmlFor="country">
            <Input id="country" name="country" required defaultValue="Bangladesh" />
          </Field>
          <Field label="Division / state" htmlFor="division">
            <Input id="division" name="division" placeholder="Dhaka" />
          </Field>
          <Field label="District" htmlFor="district">
            <Input id="district" name="district" placeholder="Dhaka" />
          </Field>
          <Field label="Office address" required htmlFor="officeAddress">
            <Input id="officeAddress" name="officeAddress" required minLength={5} />
          </Field>
          <Field label="Official website" htmlFor="website">
            <Input id="website" name="website" placeholder="https://" />
          </Field>
          <Field label="Official contact number" required htmlFor="contactNumber">
            <Input id="contactNumber" name="contactNumber" required minLength={6} />
          </Field>
          <Field label="Official email" required htmlFor="officialEmail">
            <Input id="officialEmail" name="officialEmail" type="email" required />
          </Field>
        </div>
      </Panel>

      <Panel className="p-6">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">
          Representative
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required htmlFor="repName">
            <Input id="repName" name="repName" required />
          </Field>
          <Field label="Designation" htmlFor="repDesignation">
            <Input id="repDesignation" name="repDesignation" placeholder="Deputy Chief" />
          </Field>
          <Field label="Official email" required htmlFor="repEmail" hint="This becomes the sign-in address">
            <Input id="repEmail" name="repEmail" type="email" required />
          </Field>
          <Field label="Contact number" htmlFor="repPhone">
            <Input id="repPhone" name="repPhone" />
          </Field>
          <Field label="Role in the organisation" htmlFor="repRole">
            <Input id="repRole" name="repRole" placeholder="Head of operations" />
          </Field>
          <Field label="Password" required htmlFor="password" hint="At least 10 characters">
            <Input id="password" name="password" type="password" required minLength={10} />
          </Field>
        </div>
      </Panel>

      <Panel className="p-6">
        <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">
          Verification information
        </h2>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
          Describe the authorisation documents you can provide (government notification, letterhead
          reference, official register entry). File attachments are not accepted in this demo build, so
          record the document reference here and an administrator will request the file during review.
        </p>
        <Field label="Document references / additional information" htmlFor="documents">
          <textarea
            id="documents"
            name="documents"
            rows={4}
            className="w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 text-[13px] outline-none focus:border-accent/50"
            placeholder="e.g. Ministry notification no. … dated …"
          />
        </Field>
      </Panel>

      {error && (
        <p className="rounded-lg border border-crit/30 bg-crit/10 px-3 py-2 text-[12px] text-crit">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? <Spinner className="size-3.5" /> : null}
          {busy ? "Submitting…" : "Submit for verification"}
        </Button>
        <p className="text-[11px] text-muted">
          Your application is reviewed by a platform administrator. Access is only granted after
          approval.
        </p>
      </div>
    </form>
  );
}

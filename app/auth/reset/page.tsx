import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { Panel, Spinner } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reset password" };

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="relative min-h-dvh px-5 pb-20 pt-32">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(50%_100%_at_50%_0%,rgba(54,217,255,0.08),transparent)]" />
      {token ? (
        <Suspense fallback={<div className="grid place-items-center py-20"><Spinner /></div>}>
          <AuthForm mode="reset" />
        </Suspense>
      ) : (
        <Panel className="mx-auto max-w-md p-6 text-center">
          <h1 className="text-lg font-semibold">Reset link missing</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            This page needs a valid reset token. Request a new link from the recovery page.
          </p>
          <Link
            href="/auth/forgot"
            className="mt-4 inline-block rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-ink"
          >
            Request a reset link
          </Link>
        </Panel>
      )}
    </div>
  );
}

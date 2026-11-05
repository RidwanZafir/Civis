"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Panel, Spinner } from "@/components/ui";

function VerifyInner() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<"checking" | "ok" | "error">("checking");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("This link does not contain a verification token.");
      return;
    }
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!active) return;
        if (!res.ok) {
          setState("error");
          setMessage(data.error ?? "Verification failed.");
          return;
        }
        setState("ok");
      } catch {
        if (active) {
          setState("error");
          setMessage("Could not reach the server.");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <Panel className="mx-auto max-w-md p-7 text-center">
      {state === "checking" && (
        <>
          <Spinner className="mx-auto size-6 text-accent" />
          <p className="mt-4 text-[13px] text-muted">Confirming your email…</p>
        </>
      )}
      {state === "ok" && (
        <>
          <div className="mx-auto grid size-14 place-items-center rounded-full border border-mint/40 bg-mint/10">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 12.5l5 5L20 6.5" stroke="#43D6A0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className="mt-4 text-lg font-semibold">Email confirmed</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            Your address is verified. You will now receive updates about the reports you follow.
          </p>
          <Link
            href="/dashboard"
            className="mt-5 inline-block rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-ink"
          >
            Go to dashboard
          </Link>
        </>
      )}
      {state === "error" && (
        <>
          <h1 className="text-lg font-semibold">Verification failed</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">{message}</p>
          <Link
            href="/auth/sign-in"
            className="mt-5 inline-block rounded-full border border-white/15 px-5 py-2.5 text-[13px] font-semibold"
          >
            Back to sign in
          </Link>
        </>
      )}
    </Panel>
  );
}

export default function VerifyPage() {
  return (
    <div className="relative min-h-dvh px-5 pb-20 pt-32">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(50%_100%_at_50%_0%,rgba(67,214,160,0.10),transparent)]" />
      <Suspense
        fallback={
          <div className="grid place-items-center py-20">
            <Spinner />
          </div>
        }
      >
        <VerifyInner />
      </Suspense>
    </div>
  );
}

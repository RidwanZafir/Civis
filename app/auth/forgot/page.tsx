import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { Spinner } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Password recovery" };

export default function ForgotPage() {
  return (
    <div className="relative min-h-dvh px-5 pb-20 pt-32">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(50%_100%_at_50%_0%,rgba(245,185,75,0.08),transparent)]" />
      <Suspense fallback={<div className="grid place-items-center py-20"><Spinner /></div>}>
        <AuthForm mode="forgot" />
      </Suspense>
    </div>
  );
}

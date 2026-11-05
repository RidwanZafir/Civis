import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth";
import { Spinner } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="relative min-h-dvh px-5 pb-20 pt-32">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[radial-gradient(50%_100%_at_50%_0%,rgba(54,217,255,0.10),transparent)]" />
      <Suspense fallback={<div className="grid place-items-center py-20"><Spinner /></div>}>
        <AuthForm mode="sign-in" />
      </Suspense>
    </div>
  );
}

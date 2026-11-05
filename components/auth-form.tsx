"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Button, DemoNote, Field, Input, Panel, Spinner } from "@/components/ui";

type Mode = "sign-in" | "sign-up" | "forgot" | "reset";

const DEMO_ACCOUNTS = [
  { role: "Citizen", email: "citizen@civis.demo" },
  { role: "Moderator", email: "moderator@civis.demo" },
  { role: "Authority", email: "authority@civis.demo" },
  { role: "Admin", email: "admin@civis.demo" },
];
const DEMO_PASSWORD = "CivisDemo!23";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") ?? "/dashboard";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ message: string; link?: string; label?: string } | null>(null);

  const titles: Record<Mode, { heading: string; sub: string; cta: string }> = {
    "sign-in": {
      heading: "Welcome back",
      sub: "Sign in to report, support and follow incidents in your neighbourhood.",
      cta: "Sign in",
    },
    "sign-up": {
      heading: "Join CIVIS",
      sub: "Create an account to report problems and track what changes.",
      cta: "Create account",
    },
    forgot: {
      heading: "Recover access",
      sub: "Enter the email on your account and we will issue a reset link.",
      cta: "Send reset link",
    },
    reset: {
      heading: "Set a new password",
      sub: "Choose a strong password you have not used here before.",
      cta: "Update password",
    },
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      if (mode === "sign-in") {
        const res = await fetch("/api/auth/sign-in", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not sign in");
        router.push(next);
        router.refresh();
        return;
      }

      if (mode === "sign-up") {
        if (password !== confirm) throw new Error("Passwords do not match");
        const res = await fetch("/api/auth/sign-up", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not create the account");
        setSuccess({
          message: "Account created. Confirm your email to enable follow-up notifications.",
          link: data.verification?.url,
          label: "Confirm email address",
        });
        router.refresh();
        setBusy(false);
        return;
      }

      if (mode === "forgot") {
        const res = await fetch("/api/auth/forgot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not issue a reset link");
        setSuccess({
          message: data.message,
          link: data.url,
          label: "Open reset link",
        });
        setBusy(false);
        return;
      }

      if (mode === "reset") {
        if (password !== confirm) throw new Error("Passwords do not match");
        const token = search.get("token") ?? "";
        const res = await fetch("/api/auth/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not reset the password");
        setSuccess({ message: "Password updated. You can sign in now.", link: "/auth/sign-in", label: "Go to sign in" });
        setBusy(false);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
    setBusy(false);
  }

  const t = titles[mode];

  return (
    <div className="mx-auto w-full max-w-md">
      <Panel className="overflow-hidden">
        <div className="border-b border-white/[0.07] px-6 py-5">
          <h1 className="text-xl font-semibold">{t.heading}</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">{t.sub}</p>
        </div>

        <AnimatePresence mode="wait">
          {success ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="px-6 py-6"
            >
              <p className="text-[13px] leading-relaxed text-fg/90">{success.message}</p>
              {success.link && (
                <div className="mt-4 rounded-xl border border-warn/25 bg-warn/[0.06] p-3">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-warn">
                    Demo mode — no email provider connected
                  </p>
                  <Link
                    href={success.link}
                    className="mt-1.5 inline-block text-[12.5px] text-accent underline-offset-4 hover:underline"
                  >
                    {success.label} →
                  </Link>
                </div>
              )}
              <div className="mt-5 flex gap-2">
                <Button size="sm" onClick={() => router.push(next)}>
                  Continue to dashboard
                </Button>
                <Button size="sm" variant="ghost" onClick={() => router.push("/explore")}>
                  Explore the map
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              onSubmit={submit}
              className="space-y-4 px-6 py-6"
            >
              {mode === "sign-up" && (
                <Field label="Full name" required htmlFor="name">
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    required
                    minLength={2}
                    placeholder="Ananya Ghosh"
                  />
                </Field>
              )}

              {mode !== "reset" && (
                <Field label="Email address" required htmlFor="email">
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                    placeholder="you@example.com"
                  />
                </Field>
              )}

              {(mode === "sign-in" || mode === "sign-up" || mode === "reset") && (
                <Field
                  label={mode === "reset" ? "New password" : "Password"}
                  required
                  htmlFor="password"
                  hint={mode === "sign-in" ? undefined : "At least 10 characters"}
                >
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                    required
                    minLength={mode === "sign-in" ? 1 : 10}
                    placeholder="••••••••••"
                  />
                </Field>
              )}

              {(mode === "sign-up" || mode === "reset") && (
                <Field label="Confirm password" required htmlFor="confirm">
                  <Input
                    id="confirm"
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    required
                    placeholder="••••••••••"
                  />
                </Field>
              )}

              {error && (
                <p className="rounded-lg border border-crit/30 bg-crit/10 px-3 py-2 text-[12px] text-crit">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Spinner className="size-3.5" /> : null}
                {busy ? "Working…" : t.cta}
              </Button>

              <div className="flex items-center justify-between text-[11.5px] text-muted">
                {mode === "sign-in" ? (
                  <>
                    <Link href="/auth/sign-up" className="hover:text-fg">
                      Create an account
                    </Link>
                    <Link href="/auth/forgot" className="hover:text-fg">
                      Forgot password?
                    </Link>
                  </>
                ) : (
                  <Link href="/auth/sign-in" className="hover:text-fg">
                    ← Back to sign in
                  </Link>
                )}
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </Panel>

      {mode === "sign-in" && (
        <div className="mt-4">
          <p className="mb-2 text-center text-[10.5px] uppercase tracking-[0.16em] text-muted">
            Demonstration accounts
          </p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => {
                  setEmail(a.email);
                  setPassword(DEMO_PASSWORD);
                  setError(null);
                }}
                className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-left transition-colors hover:border-accent/35 hover:bg-white/[0.05]"
              >
                <span className="block text-[11.5px] font-semibold">{a.role}</span>
                <span className="block truncate text-[10px] text-muted">{a.email}</span>
              </button>
            ))}
          </div>
          <div className="mt-3">
            <DemoNote />
          </div>
          <p className="mt-2 text-center text-[10px] text-muted">
            Shared password for all demo accounts: <span className="font-mono">{DEMO_PASSWORD}</span>
          </p>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Field, Input, Modal, Panel, Spinner, Toggle } from "@/components/ui";
import type { SessionUser } from "@/lib/auth";

/**
 * Browser notifications are opt-in and requested only here, never on sign-in.
 * The stored preference is local: the permission belongs to this browser, not
 * to the account, and the server keeps the notification regardless.
 */
function BrowserNotificationToggle() {
  const [enabled, setEnabled] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    try {
      setEnabled(window.localStorage.getItem("civis.browserNotify") === "1" && Notification.permission === "granted");
    } catch { /* Storage or Notification API unavailable. */ }
  }, []);

  async function toggle(next: boolean) {
    if (typeof Notification === "undefined") {
      setNote("This browser does not support system notifications.");
      return;
    }
    if (!next) {
      setEnabled(false);
      try { window.localStorage.setItem("civis.browserNotify", "0"); } catch { /* Ignore storage errors. */ }
      setNote("Browser notifications are off for this device.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setNote("Permission was not granted, so nothing will pop up. Your notifications remain in CIVIS.");
      return;
    }
    setEnabled(true);
    try { window.localStorage.setItem("civis.browserNotify", "1"); } catch { /* Ignore storage errors. */ }
    setNote("Enabled for this browser. Alerts stay stored even if the system notification is missed.");
  }

  return (
    <div className="py-3">
      <Toggle
        checked={enabled}
        onChange={(next) => void toggle(next)}
        label="Browser notifications"
        description="Ask this browser to alert you for new notifications. Permission is requested now, not on sign-in."
      />
      {note && <p className="mt-1.5 text-[10.5px] leading-relaxed text-muted">{note}</p>}
    </div>
  );
}

export function SettingsForm({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [notifyEmail, setNotifyEmail] = useState(user.notify_email === 1);
  const [notifyInapp, setNotifyInapp] = useState(user.notify_inapp === 1);
  const [publicName, setPublicName] = useState(user.public_name === 1);
  const [anonymousDefault, setAnonymousDefault] = useState(user.anonymous_default === 1);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [verifyLink, setVerifyLink] = useState<string | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          notify_email: notifyEmail,
          notify_inapp: notifyInapp,
          public_name: publicName,
          anonymous_default: anonymousDefault,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save settings");
      setMessage("Settings saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      setSaving(false);
    }
  }

  async function resendVerification() {
    setVerifyBusy(true);
    try {
      const res = await fetch("/api/auth/resend-verify", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.url) setVerifyLink(data.url);
      else if (data.alreadyVerified) setMessage("Your email is already confirmed.");
    } finally {
      setVerifyBusy(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not delete the account");
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the account");
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Panel className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-semibold">Profile</h2>
            <p className="mt-0.5 text-[11.5px] text-muted">How your account appears across CIVIS.</p>
          </div>
          <Badge color="#36D9FF" dot={false}>
            {user.role}
            {user.department_name ? ` · ${user.department_name}` : ""}
          </Badge>
        </div>

        <div className="mt-5 space-y-4">
          <Field label="Display name" htmlFor="name">
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </Field>
          <Field label="Email address" hint="Contact an administrator to change your email.">
            <Input value={user.email} disabled />
          </Field>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
            <span className={`size-1.5 rounded-full ${user.email_verified ? "bg-mint" : "bg-warn"}`} />
            <p className="text-[12px] text-muted">
              {user.email_verified ? "Email confirmed" : "Email not confirmed"}
            </p>
            {!user.email_verified && (
              <Button size="sm" variant="secondary" onClick={resendVerification} disabled={verifyBusy}>
                {verifyBusy ? <Spinner className="size-3" /> : null}
                Get confirmation link
              </Button>
            )}
            {verifyLink && (
              <a href={verifyLink} className="text-[11.5px] text-accent underline-offset-4 hover:underline">
                Confirm now →
              </a>
            )}
          </div>
        </div>
      </Panel>

      <Panel className="p-5 sm:p-6">
        <h2 className="text-[14px] font-semibold">Notifications</h2>
        <p className="mt-0.5 text-[11.5px] text-muted">
          Choose what reaches you. In-app notifications always respect these preferences.
        </p>
        <div className="mt-3 divide-y divide-white/[0.06]">
          <Toggle
            checked={notifyInapp}
            onChange={setNotifyInapp}
            label="In-app notifications"
            description="Verification decisions, comments, status changes and resolutions."
          />
          <Toggle
            checked={notifyEmail}
            onChange={setNotifyEmail}
            label="Email notifications"
            description="Requires a confirmed email address and a configured email provider."
          />
          <BrowserNotificationToggle />
        </div>
      </Panel>

      <Panel className="p-5 sm:p-6">
        <h2 className="text-[14px] font-semibold">Privacy</h2>
        <div className="mt-3 divide-y divide-white/[0.06]">
          <Toggle
            checked={publicName}
            onChange={setPublicName}
            label="Show my name on reports"
            description="When off, your reports display as “Community member”."
          />
          <Toggle
            checked={anonymousDefault}
            onChange={setAnonymousDefault}
            label="Submit new reports anonymously by default"
            description="You can override this on each report before submitting."
          />
        </div>
        <p className="mt-4 text-[10.5px] leading-relaxed text-muted">
          Precise coordinates are shown for the reported location, never for your device. Your email
          address is never shown publicly.
        </p>
      </Panel>

      <Panel className="flex flex-wrap items-center justify-between gap-3 p-5 sm:p-6">
        <div className="flex-1">
          <h2 className="text-[14px] font-semibold">Save changes</h2>
          <p className="mt-0.5 text-[11.5px] text-muted">
            {message ? <span className="text-mint">{message}</span> : "Applies immediately to your account."}
          </p>
          {error && <p className="mt-1 text-[11.5px] text-crit">{error}</p>}
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Spinner className="size-3.5" /> : null}
          {saving ? "Saving…" : "Save settings"}
        </Button>
      </Panel>

      <Panel className="border-crit/25 p-5 sm:p-6">
        <h2 className="text-[14px] font-semibold text-crit">Delete account</h2>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
          Your reports stay in the public record for community integrity, but your profile, email and
          sessions are removed. This cannot be undone.
        </p>
        <Button variant="danger" size="sm" className="mt-4" onClick={() => setDeleteOpen(true)}>
          Delete my account
        </Button>
      </Panel>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete your account"
        description="Confirm your password to continue."
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={deleteAccount}
              disabled={deleting || deletePassword.length === 0}
            >
              {deleting ? <Spinner className="size-3" /> : null}
              Delete permanently
            </Button>
          </>
        }
      >
        <Field label="Password" required>
          <Input
            type="password"
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        {error && <p className="mt-2 text-[11.5px] text-crit">{error}</p>}
      </Modal>
    </div>
  );
}

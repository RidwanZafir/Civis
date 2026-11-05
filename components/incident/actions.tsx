"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Avatar, Button, Field, Modal, Spinner, Textarea, cx } from "@/components/ui";
import { timeAgo } from "@/lib/format";

type Comment = {
  id: string;
  body: string;
  author: string | null;
  role: string;
  created_at: string;
};

export function IncidentInteractions({
  reportId,
  initialSupported,
  initialFollowing,
  initialSupporters,
  initialComments,
  viewer,
  isOwner,
}: {
  reportId: string;
  initialSupported: boolean;
  initialFollowing: boolean;
  initialSupporters: number;
  initialComments: Comment[];
  viewer: { id: string; name: string; role: string } | null;
  isOwner: boolean;
}) {
  const [supported, setSupported] = useState(initialSupported);
  const [following, setFollowing] = useState(initialFollowing);
  const [supporters, setSupporters] = useState(initialSupporters);
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [flagReason, setFlagReason] = useState("");
  const [flagSent, setFlagSent] = useState(false);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function toggleSupport() {
    if (!viewer) {
      window.location.href = `/auth/sign-in?next=/incidents/${reportId}`;
      return;
    }
    const next = !supported;
    setSupported(next);
    setSupporters((n) => n + (next ? 1 : -1));
    const res = await fetch(`/api/reports/${reportId}/support`, { method: next ? "POST" : "DELETE" });
    if (!res.ok) {
      setSupported(!next);
      setSupporters((n) => n + (next ? -1 : 1));
      setError("Could not update support.");
      return;
    }
    const data = await res.json();
    setSupporters(data.supporters);
  }

  async function toggleFollow() {
    if (!viewer) {
      window.location.href = `/auth/sign-in?next=/incidents/${reportId}`;
      return;
    }
    const next = !following;
    setFollowing(next);
    const res = await fetch(`/api/reports/${reportId}/follow`, { method: next ? "POST" : "DELETE" });
    if (!res.ok) {
      setFollowing(!next);
      setError("Could not update follow state.");
    }
  }

  async function share() {
    const url = `${window.location.origin}/incidents/${reportId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "CIVIS report", url });
      } else {
        await navigator.clipboard.writeText(url);
        setNotice("Link copied to clipboard");
        setTimeout(() => setNotice(null), 2200);
      }
    } catch {
      setNotice("Could not share this report");
      setTimeout(() => setNotice(null), 2200);
    }
  }

  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    if (!viewer) {
      window.location.href = `/auth/sign-in?next=/incidents/${reportId}`;
      return;
    }
    if (body.trim().length < 2) return;
    setPosting(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not post comment");
      setComments((c) => [...c, data.comment]);
      setBody("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post comment");
    } finally {
      setPosting(false);
    }
  }

  async function submitFlag(e: React.FormEvent) {
    e.preventDefault();
    if (!viewer) {
      window.location.href = `/auth/sign-in?next=/incidents/${reportId}`;
      return;
    }
    const res = await fetch(`/api/reports/${reportId}/flag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: flagReason.trim() }),
    });
    if (res.ok) {
      setFlagSent(true);
      setFlagReason("");
    }
  }

  async function addEvidence(files: FileList | null) {
    if (!files?.length) return;
    setEvidenceBusy(true);
    setError(null);
    try {
      const form = new FormData();
      Array.from(files).forEach((f) => form.append("files", f));
      const uploadRes = await fetch("/api/upload", { method: "POST", body: form });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error ?? "Upload failed");
      const res = await fetch(`/api/reports/${reportId}/manage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "evidence", images: uploadData.urls }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not attach evidence");
      setNotice("Evidence attached — reload to see it in the gallery");
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not attach evidence");
    } finally {
      setEvidenceBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={toggleSupport}
          aria-pressed={supported}
          className={cx(
            "flex h-11 items-center justify-center gap-2 rounded-full border text-[13px] font-semibold transition-all",
            supported
              ? "border-accent/45 bg-accent/12 text-accent"
              : "border-white/12 text-fg hover:border-accent/40 hover:text-accent",
          )}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path
              d="M8 13.5S2 9.8 2 5.9A3.4 3.4 0 0 1 8 3.6a3.4 3.4 0 0 1 6 2.3c0 3.9-6 7.6-6 7.6z"
              fill={supported ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1.3"
            />
          </svg>
          {supported ? "Supported" : "Support"} · {supporters}
        </button>
        <button
          onClick={toggleFollow}
          aria-pressed={following}
          className={cx(
            "flex h-11 items-center justify-center gap-2 rounded-full border text-[13px] font-semibold transition-all",
            following
              ? "border-mint/45 bg-mint/12 text-mint"
              : "border-white/12 text-fg hover:border-mint/40 hover:text-mint",
          )}
        >
          {following ? "Following" : "Follow"}
        </button>
      </div>

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onClick={share}>
          Share
        </Button>
        {isOwner && (
          <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full border border-white/12 px-4 text-[13px] font-semibold text-fg transition-colors hover:border-white/25">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              multiple
              onChange={(e) => void addEvidence(e.target.files)}
            />
            {evidenceBusy ? <Spinner className="size-3.5" /> : null}
            Add evidence
          </label>
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted">
        <button
          onClick={() => setFlagOpen(true)}
          className="transition-colors hover:text-crit"
        >
          Report misleading content
        </button>
        {notice && <span className="text-mint">{notice}</span>}
      </div>

      {error && <p className="text-[11px] text-crit">{error}</p>}

      <div className="border-t border-white/[0.07] pt-5">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-semibold">Community discussion ({comments.length})</h3>
        </div>

        <div className="mt-4 space-y-4">
          {comments.length === 0 && (
            <p className="text-[12px] text-muted">
              No comments yet. Add local context only if you have seen the issue yourself.
            </p>
          )}
          {comments.map((c) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-2.5"
            >
              <Avatar name={c.author ?? "Anonymous"} size={28} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[11px]">
                  <span className="font-medium text-fg">{c.author ?? "Anonymous"}</span>
                  {c.role && c.role !== "citizen" && (
                    <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted">
                      {c.role}
                    </span>
                  )}
                  <span className="text-muted">{timeAgo(c.created_at)}</span>
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-fg/85">{c.body}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <form onSubmit={postComment} className="mt-4 space-y-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={1200}
            placeholder={viewer ? "Add local context…" : "Sign in to comment"}
            disabled={!viewer}
            className="min-h-16 text-[12.5px]"
            aria-label="Add a comment"
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={posting || body.trim().length < 2}>
              {posting ? <Spinner className="size-3" /> : null}
              Post comment
            </Button>
          </div>
        </form>
      </div>

      <Modal
        open={flagOpen}
        onClose={() => {
          setFlagOpen(false);
          setFlagSent(false);
        }}
        title="Report misleading content"
        description="Moderators review every flag. False flags are also logged."
        footer={
          flagSent ? (
            <Button size="sm" onClick={() => setFlagOpen(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setFlagOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="danger" onClick={submitFlag} disabled={flagReason.trim().length < 5}>
                Send flag
              </Button>
            </>
          )
        }
      >
        {flagSent ? (
          <p className="text-[13px] text-mint">
            Thanks — the report has been queued for moderator review.
          </p>
        ) : (
          <Field label="What is wrong with this report?" required>
            <Textarea
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              placeholder="e.g. the photograph is from a different location"
              className="min-h-24"
            />
          </Field>
        )}
      </Modal>
    </div>
  );
}

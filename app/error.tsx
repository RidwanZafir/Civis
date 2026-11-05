"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="grid min-h-[60vh] place-items-center px-5 py-32">
      <div className="max-w-md text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-crit">Something broke</p>
        <h1 className="mt-3 text-2xl font-semibold">That did not work</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          {error.message || "An unexpected error occurred while loading this page."}
        </p>
        <div className="mt-6 flex justify-center gap-2.5">
          <button
            onClick={reset}
            className="rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-ink"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-full border border-white/15 px-5 py-2.5 text-[13px] font-semibold"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

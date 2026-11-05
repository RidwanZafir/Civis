import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-5">
      <div className="max-w-md text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">404</p>
        <h1 className="mt-3 text-2xl font-semibold">This page isn&apos;t on the map</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          The incident or page you were looking for does not exist, or may have been removed during
          moderation.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          <Link
            href="/explore"
            className="rounded-full bg-accent px-5 py-2.5 text-[13px] font-semibold text-ink"
          >
            Explore the map
          </Link>
          <Link
            href="/community"
            className="rounded-full border border-white/15 px-5 py-2.5 text-[13px] font-semibold"
          >
            Community reports
          </Link>
        </div>
      </div>
    </div>
  );
}

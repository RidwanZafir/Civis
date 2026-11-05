"use client";

export function PrintClientButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-full border border-white/12 px-3.5 py-1.5 text-[12px] font-medium text-fg transition-colors hover:border-accent/40 hover:text-accent"
    >
      Print / save as PDF
    </button>
  );
}

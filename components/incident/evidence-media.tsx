import { isVideoEvidence } from "@/lib/report-evidence";

export function EvidenceMedia({ src, alt, className, controls = true }: { src: string; alt: string; className?: string; controls?: boolean }) {
  if (isVideoEvidence(src)) {
    return <video src={src} controls={controls} preload="metadata" playsInline aria-label={alt} className={className} />;
  }
  // Uploaded evidence is served locally; native images preserve its original aspect ratio.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" className={className} />;
}

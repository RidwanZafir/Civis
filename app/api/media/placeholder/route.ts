import { category } from "@/lib/constants";

/**
 * Generates clearly-labelled illustrative tiles for the seeded demonstration
 * reports. These are drawn graphics, never photographs of a real incident.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("c") ?? "other";
  const seed = Number(url.searchParams.get("s") ?? 0);
  const kind = url.searchParams.get("k") === "resolution" ? "resolution" : "evidence";
  const cat = category(slug);

  const hueShift = (seed * 37) % 60;
  const base = kind === "resolution" ? "#43D6A0" : cat.color;
  const angle = 20 + ((seed * 13) % 50);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1" gradientTransform="rotate(${angle} .5 .5)">
      <stop offset="0" stop-color="#0b1420"/>
      <stop offset="0.55" stop-color="#101a2a"/>
      <stop offset="1" stop-color="#0a1119"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.28" cy="0.22" r="0.75">
      <stop offset="0" stop-color="${base}" stop-opacity="0.30"/>
      <stop offset="1" stop-color="${base}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
      <path d="M28 0H0V28" fill="none" stroke="rgba(255,255,255,0.045)" stroke-width="1"/>
    </pattern>
    <linearGradient id="line" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${base}" stop-opacity="0.05"/>
      <stop offset="1" stop-color="${base}" stop-opacity="0.55"/>
    </linearGradient>
  </defs>
  <rect width="800" height="500" fill="url(#bg)"/>
  <rect width="800" height="500" fill="url(#grid)"/>
  <rect width="800" height="500" fill="url(#glow)"/>

  <g opacity="0.5" stroke="${base}" stroke-width="1.2" fill="none">
    <path d="M0 372 L260 300 L470 336 L800 268"/>
    <path d="M0 404 L258 332 L468 368 L800 300" stroke-opacity="0.35"/>
  </g>

  <g transform="translate(64 84)">
    <rect x="0" y="0" width="120" height="120" rx="26" fill="${base}" fill-opacity="0.10" stroke="${base}" stroke-opacity="0.4"/>
    <g stroke="${base}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" transform="translate(34 30)">
      <path d="M26 2 L26 30 M26 40 L26 46" stroke-width="4" stroke-opacity="${kind === "resolution" ? 0.35 : 0.9}"/>
      <circle cx="26" cy="22" r="0" />
      <path d="M2 60 L50 60" stroke-opacity="0.3"/>
    </g>
    <rect x="34" y="52" width="52" height="18" rx="9" fill="${base}" fill-opacity="0.5"/>
  </g>

  <text x="64" y="262" fill="#F5F7FA" font-family="Inter, system-ui, sans-serif" font-size="34" font-weight="600">${escapeXml(cat.label)}</text>
  <text x="64" y="300" fill="#929FB2" font-family="Inter, system-ui, sans-serif" font-size="18">${kind === "resolution" ? "Resolution evidence tile" : "Community evidence tile"}</text>

  <g transform="translate(64 356)">
    <rect x="0" y="0" width="250" height="34" rx="17" fill="#F5B94B" fill-opacity="0.12" stroke="#F5B94B" stroke-opacity="0.45"/>
    <circle cx="20" cy="17" r="4" fill="#F5B94B"/>
    <text x="36" y="22" fill="#F5B94B" font-family="Inter, system-ui, sans-serif" font-size="13" font-weight="600">DEMONSTRATION RECORD</text>
  </g>

  <g transform="translate(560 300)" opacity="0.5">
    ${Array.from({ length: 7 })
      .map((_, i) => {
        const h = 26 + ((seed * 17 + i * 41) % 120);
        return `<rect x="${i * 30}" y="${150 - h}" width="18" height="${h}" rx="3" fill="${base}" fill-opacity="${0.12 + (i % 3) * 0.08}"/>`;
      })
      .join("")}
    <rect x="-6" y="152" width="222" height="1.6" fill="url(#line)"/>
  </g>

  <rect x="0.5" y="0.5" width="799" height="499" fill="none" stroke="rgba(255,255,255,0.06)"/>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

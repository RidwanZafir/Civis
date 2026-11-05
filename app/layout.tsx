import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./inter-subsets.css";
import "./globals.css";
import { Nav } from "@/components/nav";
import { getCurrentUser, unreadNotificationCount } from "@/lib/auth";
import { BRAND } from "@/lib/constants";

const inter = localFont({
  src: "../public/fonts/Inter-latin.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-inter",
  adjustFontFallback: false,
  fallback: ["Inter Fallback"],
  declarations: [
    { prop: "font-family", value: "Inter" },
    { prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" },
  ],
});

export const metadata: Metadata = {
  title: {
    default: "CIVIS — See what's broken. Make it better.",
    template: "%s · CIVIS",
  },
  description:
    "CIVIS is a community-powered platform for reporting, verifying and tracking public infrastructure problems.",
  applicationName: BRAND.name,
  openGraph: {
    title: "CIVIS — See what's broken. Make it better.",
    description: BRAND.mission,
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#080D17",
  colorScheme: "dark",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  const unread = user ? unreadNotificationCount(user.id) : 0;

  return (
    <html lang="en" className={inter.variable} data-scroll-behavior="smooth">
      <body className="min-h-dvh bg-ink text-fg antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-ink"
        >
          Skip to content
        </a>
        <Nav user={user} unread={unread} />
        <main id="main">{children}</main>
      </body>
    </html>
  );
}

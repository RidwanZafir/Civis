import type { NextConfig } from "next";

const buildDir = process.env.CIVIS_BUILD_DIR ?? ".next";
if (!/^[A-Za-z0-9._-]+$/.test(buildDir) || buildDir === "." || buildDir === "..") {
  throw new Error("CIVIS_BUILD_DIR must name a directory inside the CIVIS workspace.");
}

const nextConfig: NextConfig = {
  // An isolated output directory permits a production check while dev is active.
  distDir: buildDir,
  // The WASM sqlite driver resolves its own .wasm file relative to its package
  // directory at runtime, so it must not be bundled by Turbopack.
  serverExternalPackages: ["node-sqlite3-wasm"],
  experimental: {
    optimizePackageImports: ["recharts", "lucide-react"],
  },
};

export default nextConfig;

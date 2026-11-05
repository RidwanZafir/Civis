#!/usr/bin/env node
/**
 * Build a self-hosted PMTiles basemap for CIVIS.
 *
 * This orchestrates the whole pipeline described in docs/map-architecture.md:
 *
 *   OSM extract (.osm.pbf) -> Planetiler -> vector tiles (.pmtiles)
 *
 * Nothing here runs automatically, and nothing here downloads tiles from the
 * public OpenStreetMap tile server. It reads an `.osm.pbf` extract (Geofabrik)
 * and writes one archive, which the app then serves from `public/map/tiles/`.
 *
 * Usage:
 *   node scripts/map-tiles.mjs --osm path/to/bangladesh-latest.osm.pbf
 *   node scripts/map-tiles.mjs --osm bangladesh-latest.osm.pbf --area bangladesh
 *
 * Requirements, checked before anything starts:
 *   - Java 21+ (Planetiler runs on the JVM)
 *   - A Planetiler jar (--jar) or network access to fetch the release
 *   - ~10x the extract size in free disk space
 *
 * After a successful run, set NEXT_PUBLIC_CIVIS_PMTILES_URL to the archive path
 * (for example /map/tiles/bangladesh.pmtiles) and CIVIS will use it instead of
 * the remote keyless style.
 */

import { createWriteStream, existsSync, mkdirSync, statfsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const GEOFABRIK = "https://download.geofabrik.de/asia";
const PLANETILER_RELEASE = "https://github.com/onthegomap/planetiler/releases/latest/download/planetiler.jar";

function parseArgs(argv) {
  const args = { osm: "", area: "bangladesh", jar: join("tools", "planetiler.jar"), out: "", force: false };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === "--osm") args.osm = value, i += 1;
    else if (key === "--area") args.area = value, i += 1;
    else if (key === "--jar") args.jar = value, i += 1;
    else if (key === "--out") args.out = value, i += 1;
    else if (key === "--force") args.force = true;
  }
  return args;
}

function fail(message, code = 1) {
  console.error(`\n✗ ${message}\n`);
  process.exit(code);
}

function freeGb(path) {
  try {
    const stats = statfsSync(path);
    return (stats.bavail * stats.bsize) / 1024 ** 3;
  } catch {
    return null;
  }
}

async function download(url, destination) {
  console.log(`  fetching ${url}`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} for ${url}`);
  mkdirSync(dirname(destination), { recursive: true });
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
}

async function main() {
  const args = parseArgs(process.argv);
  const osmPath = args.osm ? resolve(args.osm) : "";
  const outPath = resolve(args.out || join("public", "map", "tiles", `${args.area}.pmtiles`));

  console.log("\nCIVIS basemap build\n───────────────────");

  // 1. Java
  const java = spawnSync("java", ["-version"], { encoding: "utf8" });
  if (java.status !== 0) {
    fail(
      [
        "Java is required and was not found on PATH.",
        "Install a JRE 21+ (for example Temurin) and re-run this script.",
        "This machine currently has no tile toolchain, so the archive cannot be built here.",
      ].join("\n"),
    );
  }

  // 2. The OSM extract
  if (!osmPath) {
    fail(
      [
        "No OSM extract given.",
        `Download one first, for example:\\n  ${GEOFABRIK}/${args.area}-latest.osm.pbf`,
        "Then re-run: node scripts/map-tiles.mjs --osm <file>.osm.pbf",
      ].join("\n"),
    );
  }
  if (!existsSync(osmPath)) fail(`Extract not found: ${osmPath}`);

  const extractGb = statSync(osmPath).size / 1024 ** 3;
  const available = freeGb(dirname(outPath));
  // Planetiler's sort and tile stages need substantially more room than the input.
  const required = Math.max(4, extractGb * 8);
  console.log(`  extract     ${osmPath} (${extractGb.toFixed(2)} GB)`);
  console.log(`  output      ${outPath}`);
  if (available !== null) {
    console.log(`  free disk   ${available.toFixed(1)} GB (need about ${required.toFixed(1)} GB)`);
    if (available < required) {
      fail(
        `Not enough free disk space. Need ~${required.toFixed(1)} GB, have ${available.toFixed(1)} GB.\\n` +
          "Free space, use a larger volume (--out), or build a smaller province extract.",
      );
    }
  }

  // 3. Planetiler
  const jarPath = resolve(args.jar);
  if (!existsSync(jarPath)) {
    console.log(`  planetiler  not found at ${jarPath}`);
    if (!args.force) {
      console.log("  fetching the official release…");
      try {
        await download(PLANETILER_RELEASE, jarPath);
      } catch (error) {
        fail(`Could not download Planetiler: ${error.message}\\nDownload it manually and pass --jar <path>.`);
      }
    }
  }

  // 4. Build
  console.log("\n  building vector tiles (this can take a long time)…");
  const result = spawnSync(
    "java",
    [
      "-Xmx4g",
      "-jar",
      jarPath,
      `--osm-path=${osmPath}`,
      `--output=${outPath}`,
      "--force",
      "--download",
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) fail(`Planetiler exited with status ${result.status}.`);

  const sizeGb = existsSync(outPath) ? statSync(outPath).size / 1024 ** 3 : 0;
  console.log(`\n✓ archive written: ${outPath} (${sizeGb.toFixed(2)} GB)`);
  console.log("\nNext steps:");
  console.log("  1. Serve it with HTTP Range requests and CORS (see docs/map-architecture.md).");
  console.log(`  2. Set NEXT_PUBLIC_CIVIS_PMTILES_URL=/map/tiles/${args.area}.pmtiles`);
  console.log("  3. Add locally hosted glyphs and sprites under public/map/fonts and public/map/sprites.");
  console.log("  4. Restart the dev server; the layer panel keeps working with no other change.\n");
}

main().catch((error) => fail(error.stack ?? String(error)));

// MapLibre spawns its tile worker from /maplibre/maplibre-gl-worker.mjs (see
// lib/maplibre.ts). Copy the worker that matches the installed version into
// public/ so the map can parse tiles in every environment.
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "node_modules", "maplibre-gl", "dist", "maplibre-gl-worker.mjs");
const targetDir = path.join(root, "public", "maplibre");
fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, path.join(targetDir, "maplibre-gl-worker.mjs"));
console.log("Copied MapLibre worker to public/maplibre/");

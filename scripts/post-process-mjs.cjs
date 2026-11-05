"use strict";
const fs = require("node:fs");
const path = require("node:path");

const outDir = process.argv[2];
if (!outDir || !fs.existsSync(outDir)) {
  console.error("Usage: node scripts/post-process-mjs.cjs <.ts-output dir>");
  process.exit(1);
}
const scriptsDir = path.join(path.resolve(outDir, ".."), "scripts");

// tsc with moduleResolution:"bundler" emits bare relative specifiers like
//   import { x } from "./crypto";
// We append ".mjs" so Node ESM can resolve them when the helpers are copied
// into scripts/ as .mjs files.
const IMPORT_RE = /\bfrom\s+"\.\/?([a-zA-Z_][a-zA-Z0-9_]*)"/g;
const REQUIRE_RE = /\brequire\(\s*"\.\/?([a-zA-Z_][a-zA-Z0-9_]*)"\s*\)/g;

function patchText(text) {
  let changed = false;

  // use a fresh regex each call so state does not leak between files
  const importRe = new RegExp(IMPORT_RE.source, "g");
  text = text.replace(importRe, (m, specifier) => {
    changed = true;
    return `from "./${specifier}.mjs"`;
  });

  const requireRe = new RegExp(REQUIRE_RE.source, "g");
  text = text.replace(requireRe, (m, specifier) => {
    changed = true;
    return `require("./${specifier}.mjs")`;
  });

  return { text, changed };
}

let patchedCount = 0;
const libDir = path.join(outDir, "lib");
for (const name of fs.readdirSync(libDir)) {
  if (!name.endsWith(".js")) continue;
  const filePath = path.join(libDir, name);
  const text = fs.readFileSync(filePath, "utf8");
  const { text: patched, changed } = patchText(text);
  if (changed) {
    fs.writeFileSync(filePath, patched);
    patchedCount++;
  }
  const base = name.replace(/\.js$/, "");
  fs.copyFileSync(filePath, path.join(scriptsDir, base + ".mjs"));
  console.log("copied", base + ".mjs");
}
console.log("patched", patchedCount, "file(s) in", libDir);

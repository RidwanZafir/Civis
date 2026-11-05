#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$1" && pwd)"
OUT_DIR="$ROOT/.ts-output"
mkdir -p "$OUT_DIR"

TSC="$ROOT/node_modules/.bin/tsc"
if [ ! -x "$TSC" ]; then echo "tsc not found at $TSC" >&2; exit 1; fi

"$TSC" --project "$ROOT/tsconfig.json" --outDir "$OUT_DIR" --skipLibCheck
echo "Compiled TS helpers to $OUT_DIR"

node "$ROOT/scripts/post-process-mjs.cjs" "$OUT_DIR" || { echo "patch failed" >&2; exit 1; }

node "$ROOT/scripts/gen-seed-db.mjs" || { echo "gen-seed-db failed" >&2; exit 1; }
echo "Vercel baseline DB generated at $ROOT/.vercel/sqlite/civis-seeded.db"

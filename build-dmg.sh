#!/usr/bin/env bash
set -euo pipefail

# RestMan macOS DMG build script
# Usage: ./build-dmg.sh

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEBUI_DIR="$ROOT_DIR/webui"
SRC_TAURI_DIR="$ROOT_DIR/src-tauri"
BUNDLE_DIR="$ROOT_DIR/src-tauri/target/release/bundle/dmg"
OUT_DIR="$ROOT_DIR/dist"

echo "[1/5] Checking environment..."
command -v node >/dev/null || { echo "❌ Node.js not found"; exit 1; }
command -v npm >/dev/null || { echo "❌ npm not found"; exit 1; }
command -v cargo >/dev/null || { echo "❌ Rust/Cargo not found"; exit 1; }

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "⚠️  Not running on macOS. DMG build is macOS-only."
fi

if [[ ! -f "$SRC_TAURI_DIR/tauri.conf.json" ]]; then
  echo "❌ Missing $SRC_TAURI_DIR/tauri.conf.json"
  exit 1
fi

echo "[2/5] Installing webui dependencies..."
npm --prefix "$WEBUI_DIR" install

echo "[3/5] Building Tauri app (from repo root)..."
# IMPORTANT: run from repo root so Tauri can discover src-tauri/tauri.conf.json
(
  cd "$ROOT_DIR"
  npx --prefix "$WEBUI_DIR" tauri build
)

echo "[4/5] Collecting DMG output..."
mkdir -p "$OUT_DIR"

if compgen -G "$BUNDLE_DIR/*.dmg" > /dev/null; then
  cp -f "$BUNDLE_DIR"/*.dmg "$OUT_DIR"/
  echo "✅ DMG copied to: $OUT_DIR"
else
  echo "❌ No DMG found in: $BUNDLE_DIR"
  echo "Check src-tauri/tauri.conf.json bundle.targets includes dmg"
  exit 1
fi

echo "[5/5] Done"
ls -lh "$OUT_DIR"/*.dmg

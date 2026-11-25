#!/usr/bin/env bash
# Convert phone photos (HEIC/JPG/PNG) into GPS-stripped WebP thumbnails (max 640px)
# and lightbox images (max 1600px) using macOS sips + cwebp.
#
# Usage:
#   ./scripts/optimize-photos.sh ./raw-photos
#
# Requires: sips (macOS built-in) and cwebp (brew install webp)

set -euo pipefail

SRC_DIR="${1:-./raw-photos}"
OUT_DIR="$(cd "$(dirname "$0")/../assets/photos" && pwd)"

if ! command -v cwebp >/dev/null 2>&1; then
  echo "Error: cwebp not found. Install with: brew install webp" >&2
  exit 1
fi

if [ ! -d "$SRC_DIR" ]; then
  echo "Put your phone photos into '$SRC_DIR' first, then re-run this script." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

shopt -s nullglob nocaseglob
count=0
for img in "$SRC_DIR"/*.{jpg,jpeg,png,heic,webp}; do
  base="$(basename "${img%.*}" | tr '[:upper:] ' '[:lower:]-' | tr -cd 'a-z0-9-_')"

  # Resize via sips (handles HEIC/JPEG/PNG + EXIF orientation) then encode WebP with -metadata none (strips GPS/EXIF)
  sips -s format png -Z 640 "$img" --out "$TMP_DIR/${base}-640.png" >/dev/null
  cwebp -q 80 -metadata none -quiet -resize 200 0 "$TMP_DIR/${base}-640.png" -o "$OUT_DIR/${base}-280.webp"
  cwebp -q 80 -metadata none -quiet "$TMP_DIR/${base}-640.png" -o "$OUT_DIR/${base}-640.webp"

  sips -s format png -Z 1600 "$img" --out "$TMP_DIR/${base}-1600.png" >/dev/null
  cwebp -q 82 -metadata none -quiet "$TMP_DIR/${base}-1600.png" -o "$OUT_DIR/${base}-1600.webp"

  echo "✓ ${base}-280.webp, ${base}-640.webp & ${base}-1600.webp"
  count=$((count + 1))
done

echo "Done — optimized $count photo(s) into $OUT_DIR (EXIF/GPS stripped)."

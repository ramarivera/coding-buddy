#!/usr/bin/env bash
# Compare freshly rendered VHS PNGs against committed goldens.
#
# Usage (from repo root, after render-vhs-goldens.sh):
#   bash scripts/ci/check-vhs-goldens.sh
#
# To re-baseline intentionally (MUST use the linux/amd64 container path):
#   bash scripts/ci/render-vhs-goldens.sh --update
#   # or: bun run ci:vhs:update
# Never re-baseline from host macOS vhs — CI will fail on font SSIM.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$ROOT/scripts/ci/vhs-out"
GOLDEN_DIR="$ROOT/scripts/ci/goldens"

if [ ! -d "$GOLDEN_DIR" ]; then
  echo "FAIL: missing $GOLDEN_DIR — run: bash scripts/ci/render-vhs-goldens.sh --update" >&2
  exit 1
fi

if [ ! -d "$OUT_DIR" ]; then
  echo "FAIL: missing $OUT_DIR — run render-vhs-goldens.sh first" >&2
  exit 1
fi

shopt -s nullglob
goldens=("$GOLDEN_DIR"/*.png)
if [ ${#goldens[@]} -eq 0 ]; then
  echo "FAIL: no golden PNGs in $GOLDEN_DIR" >&2
  exit 1
fi

fail=0
for golden in "${goldens[@]}"; do
  base=$(basename "$golden")
  got="$OUT_DIR/$base"
  if [ ! -f "$got" ]; then
    echo "FAIL: rendered output missing for golden $base" >&2
    fail=1
    continue
  fi

  # Exact byte identity is ideal; fall back to a tight perceptual threshold
  # via ffmpeg's ssim if metadata/filters differ across ffmpeg builds.
  if cmp -s "$golden" "$got"; then
    echo "OK: $base (byte-identical)"
    continue
  fi

  # Dimension check first — a size drift is always a real regression.
  read -r gw gh < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$golden")
  read -r ow oh < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$got")
  if [ "$gw" != "$ow" ] || [ "$gh" != "$oh" ]; then
    echo "FAIL: $base size golden=${gw}x${gh} got=${ow}x${oh}" >&2
    fail=1
    continue
  fi

  # SSIM mean across the frame. 0.99+ is effectively identical for terminal
  # screenshots; lower means glyphs/spacing shifted.
  ssim_line=$(ffmpeg -v error -i "$golden" -i "$got" -lavfi ssim=stats_file=/dev/stdout -f null - 2>/dev/null | tail -n1 || true)
  # stats look like: n:1 Y:0.998 U:0.999 V:0.999 All:0.998 (inf)
  ssim_all=$(printf '%s' "$ssim_line" | sed -n 's/.*All:\([0-9.]*\).*/\1/p')
  if [ -z "$ssim_all" ]; then
    echo "FAIL: $base differs and ssim could not be computed" >&2
    echo "  golden: $golden" >&2
    echo "  got:    $got" >&2
    fail=1
    continue
  fi
  ok=$(awk -v s="$ssim_all" 'BEGIN { print (s + 0 >= 0.99) ? "yes" : "no" }')
  if [ "$ok" = "yes" ]; then
    echo "OK: $base (ssim All=$ssim_all)"
  else
    echo "FAIL: $base visual regression (ssim All=$ssim_all < 0.99)" >&2
    echo "  golden: $golden" >&2
    echo "  got:    $got" >&2
    echo "  re-baseline (linux/amd64 container only):" >&2
    echo "    bash scripts/ci/render-vhs-goldens.sh --update" >&2
    fail=1
  fi
done

# Every rendered PNG that we care about should have a golden.
for got in "$OUT_DIR"/*.png; do
  base=$(basename "$got")
  if [ ! -f "$GOLDEN_DIR/$base" ]; then
    echo "FAIL: rendered $base has no committed golden (forget to --update?)" >&2
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  exit 1
fi
echo "OK: all vhs goldens matched"

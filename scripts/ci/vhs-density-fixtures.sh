#!/usr/bin/env bash
# Generate temporary full/compact/minimal statusline fixtures for the VHS tape.
# Leaves the committed production fixture untouched and writes into the ignored
# scripts/ci/vhs-out/ workspace.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

src_status="$ROOT/scripts/ci/statusline-fixture/buddy-state/status.json"
out_dir="$ROOT/scripts/ci/vhs-out/density-fixtures"

rm -rf "$out_dir"
mkdir -p "$out_dir"/{full,compact,minimal}/buddy-state

for d in full compact minimal; do
  cp "$src_status" "$out_dir/$d/buddy-state/status.json"
  printf '{"useCombinedStatus":false,"statuslineDensity":"%s"}\n' "$d" \
    > "$out_dir/$d/buddy-state/config.json"
done

# Augment the committed fixture with full/compact/minimal frame arrays.
cat "$src_status" | bun "$ROOT/scripts/ci/write-density-status.ts" "$out_dir/full/buddy-state/status.json"
cp "$out_dir/full/buddy-state/status.json" "$out_dir/compact/buddy-state/status.json"
cp "$out_dir/full/buddy-state/status.json" "$out_dir/minimal/buddy-state/status.json"

echo "$out_dir"

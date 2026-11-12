#!/usr/bin/env bash
# Render statusline VHS goldens (PNG frames) for the committed fixtures.
#
# Goldens are platform-sensitive (font rasterization). This script ALWAYS
# renders inside a pinned linux/amd64 container unless you pass --native
# (which the container entrypoint uses). That way a macOS developer and
# GitHub Actions ubuntu-latest produce comparable pixels.
#
# Usage (from repo root):
#   bash scripts/ci/render-vhs-goldens.sh              # -> scripts/ci/vhs-out/
#   bash scripts/ci/render-vhs-goldens.sh --update      # also refresh scripts/ci/goldens/
#
# Re-baseline (MUST go through this script / the container — never host macOS vhs):
#   bun run ci:vhs:update
#   # inspect scripts/ci/goldens/*.png, then:
#   git add scripts/ci/goldens/*.png
#
# Requires: docker (host path). Inside the container: vhs, ffmpeg, ttyd, bun, jq.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

UPDATE=0
NATIVE=0
OUT_DIR="scripts/ci/vhs-out"
GOLDEN_DIR="scripts/ci/goldens"
IMAGE_NAME="${VHS_GOLDEN_IMAGE:-coding-buddy-vhs:local}"
DOCKERFILE="scripts/ci/Dockerfile.vhs"

for arg in "$@"; do
  case "$arg" in
    --update) UPDATE=1 ;;
    --native) NATIVE=1 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "unknown arg: $arg" >&2
      exit 2
      ;;
  esac
done

# ── Host path: build pinned linux/amd64 image and re-exec inside it ──────────
if [ "$NATIVE" -eq 0 ]; then
  command -v docker >/dev/null 2>&1 || {
    echo "FAIL: docker is required to render platform-matched VHS goldens" >&2
    echo "  Install Docker, or if you are already inside scripts/ci/Dockerfile.vhs," >&2
    echo "  re-run with --native." >&2
    exit 1
  }

  echo "build: $IMAGE_NAME (linux/amd64) from $DOCKERFILE"
  docker build \
    --platform linux/amd64 \
    -f "$DOCKERFILE" \
    -t "$IMAGE_NAME" \
    scripts/ci

  args=("--native")
  [ "$UPDATE" -eq 1 ] && args+=("--update")

  # Host creates output dirs world-writable so the container's uid 1000 can
  # write through the bind mount (GHA checkout owner is not 1000).
  mkdir -p "$OUT_DIR" "$GOLDEN_DIR"
  chmod a+rwx "$OUT_DIR" "$GOLDEN_DIR" 2>/dev/null || true

  echo "run: docker render (${args[*]})"
  set +e
  # Match the image USER (vhs:1000). Chromium will not start as root.
  # HOME is the image's /home/vhs so rod can cache its browser there.
  # seccomp=unconfined is required for Chromium under Docker Desktop/OrbStack.
  docker run --rm \
    --platform linux/amd64 \
    --security-opt seccomp=unconfined \
    --user 1000:1000 \
    -e CI= \
    -e COLORTERM=truecolor \
    -e HOME=/home/vhs \
    -e XDG_CACHE_HOME=/home/vhs/.cache \
    -e VHS_GOLDEN_IMAGE="$IMAGE_NAME" \
    -v "$ROOT":/work \
    -w /work \
    "$IMAGE_NAME" \
    bash scripts/ci/render-vhs-goldens.sh "${args[@]}"
  status=$?
  set -e

  # Fix ownership when the host user is non-root (best-effort).
  if [ "$(id -u)" -ne 0 ]; then
    docker run --rm --platform linux/amd64 \
      --user 0:0 \
      -v "$ROOT":/work -w /work \
      "$IMAGE_NAME" \
      bash -lc "chown -R $(id -u):$(id -g) scripts/ci/vhs-out scripts/ci/goldens 2>/dev/null || true" \
      >/dev/null 2>&1 || true
  fi
  exit "$status"
fi

# ── Native path (inside the pinned container, or VHS_NATIVE override) ────────
command -v vhs >/dev/null 2>&1 || { echo "vhs not on PATH (native mode)" >&2; exit 1; }
command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg not on PATH (native mode)" >&2; exit 1; }
command -v ttyd >/dev/null 2>&1 || { echo "ttyd not on PATH (native mode)" >&2; exit 1; }
command -v bun >/dev/null 2>&1 || { echo "bun not on PATH (native mode)" >&2; exit 1; }

echo "native render host=$(uname -s)/$(uname -m) vhs=$(vhs --version 2>/dev/null | head -n1)"
echo "font: $(fc-match 'DejaVu Sans Mono' 2>/dev/null || echo 'fc-match unavailable')"

# Prefer cleaning contents over rm -rf of the directory itself: on CI the
# host owns scripts/ci/vhs-out (created world-writable above) and uid 1000
# cannot unlink the directory from scripts/.
rm -rf "${OUT_DIR:?}/"* 2>/dev/null || true
mkdir -p "$OUT_DIR"

env_ci_was="${CI-}"
unset CI || true
export COLORTERM=truecolor
# Pin rows so VHS golden renders stay at full density even when the terminal
# emulator reports a smaller size. vhs-run-statusline.sh falls back to 50 too.
export BUDDY_STATUSLINE_ROWS=50

# Fixture generation uses only in-repo modules (server/art.ts). Never touch
# the developer's live ~/.config/claude/buddy-state — CLAUDE_CONFIG_DIR is
# pointed at temp fixture dirs below.
gen_dir="$OUT_DIR/fixtures"
mkdir -p "$gen_dir/cjk/buddy-state" "$gen_dir/emoji/buddy-state"
cp scripts/ci/statusline-fixture/buddy-state/config.json "$gen_dir/cjk/buddy-state/config.json"
cp scripts/ci/statusline-fixture/buddy-state/config.json "$gen_dir/emoji/buddy-state/config.json"

bun "$ROOT/scripts/ci/write-density-status.ts" "$gen_dir/cjk/buddy-state/status.json" <<'JSON'
{"name":"Daffodil","species":"duck","rarity":"common","stars":"★","face":"(°>","eye":"°","shiny":false,"hat":"none","reaction":"","muted":false,"achievement":"","level":1,"xp":0,"mood":"focused"}
JSON
cp "$gen_dir/cjk/buddy-state/status.json" "$gen_dir/emoji/buddy-state/status.json"

bun -e "
import { writeFileSync } from 'fs';
writeFileSync(process.argv[1], JSON.stringify({
  reaction: '编译通过了 你好世界', timestamp: Date.now(), reason: 'turn',
}));
writeFileSync(process.argv[2], JSON.stringify({
  reaction: 'ship it 🎉 ❤️ ✨', timestamp: Date.now(), reason: 'success',
}));
" \
  "$gen_dir/cjk/buddy-state/reaction.default.json" \
  "$gen_dir/emoji/buddy-state/reaction.default.json"

render_one() {
  local name="$1"
  local cols="$2"
  local lines="$3"
  local fixture_rel="$4"
  local tape out_png out_gif
  tape="$OUT_DIR/${name}.tape"
  out_png="$OUT_DIR/${name}.png"
  out_gif="$OUT_DIR/${name}.gif"

  # Relative paths only — vhs's tape parser treats absolute "/..." paths as
  # separate commands. JSON stays out of the tape via vhs-run-statusline.sh.
  #
  # Hide/Show: the Type+Enter setup must not appear in the golden. Previous
  # macOS baselines accidentally baked the shell command into the frame, which
  # made pixel goldens useless as a layout check.
  cat > "$tape" <<EOF
Output ${out_gif}
Set Width $(( cols * 9 ))
Set Height $(( lines * 18 ))
Set FontSize 14
Set FontFamily "DejaVu Sans Mono"
Set Padding 12
Set Margin 0
Set Theme "Catppuccin Mocha"
Set Shell "bash"
Set TypingSpeed 0ms
Set Framerate 10
Hide
Type "PS1=; tput civis 2>/dev/null; clear; bash scripts/ci/vhs-run-statusline.sh ${cols} ${fixture_rel}"
Enter
Sleep 800ms
Show
Sleep 2s
EOF

  echo "render: $name (cols=$cols fixture=$fixture_rel)"
  vhs "$tape"
  [ -f "$out_gif" ] || { echo "missing gif: $out_gif" >&2; exit 1; }

  # Extract the final settled frame as a still PNG.
  local nframes last
  nframes=$(ffprobe -v error -select_streams v:0 -count_frames \
    -show_entries stream=nb_read_frames -of csv=p=0 "$out_gif" || echo 1)
  last=0
  if [ "${nframes:-0}" -gt 1 ] 2>/dev/null; then
    last=$(( nframes - 1 ))
  fi
  ffmpeg -hide_banner -loglevel error -y \
    -i "$out_gif" \
    -vf "select=eq(n\,${last})" \
    -update 1 -frames:v 1 \
    "$out_png"
  [ -f "$out_png" ] || { echo "missing png: $out_png" >&2; exit 1; }
}

render_one "baseline-80" 80 18 "scripts/ci/statusline-fixture"
render_one "baseline-40" 40 18 "scripts/ci/statusline-fixture"
render_one "cjk-80" 80 18 "scripts/ci/vhs-out/fixtures/cjk"
# Emoji reaction needs room for the bubble (INNER_W default 44). Narrow
# coverage lives in baseline-40; this fixture is about glyph rasterization.
render_one "emoji-80" 80 18 "scripts/ci/vhs-out/fixtures/emoji"

if [ "$UPDATE" -eq 1 ]; then
  mkdir -p "$GOLDEN_DIR"
  for png in "$OUT_DIR"/*.png; do
    base=$(basename "$png")
    cp "$png" "$GOLDEN_DIR/$base"
    echo "updated golden: $GOLDEN_DIR/$base"
  done
fi

if [ -n "${env_ci_was}" ]; then
  export CI="$env_ci_was"
fi

echo "OK: vhs renders written to $OUT_DIR (native=$(uname -s)/$(uname -m))"

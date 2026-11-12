#!/usr/bin/env bash
# CI golden check for the Claude Code statusline.
#
# Primary signal: loud text assertions over a row/column density matrix +
# CJK / wide-emoji / corrupt-eye fixtures. A broken render fails the build.
# VHS image goldens are a separate step (scripts/ci/check-vhs-goldens.sh).
#
# Run from the repo root:
#   bash scripts/ci/check-statusline.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

fixture_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/statusline-fixture" && pwd)"
pty_helper="$ROOT/scripts/ci/render-statusline-pty.py"
payload='{"session_id":"ci","model":{"display_name":"CI"},"workspace":{"current_dir":"."}}'

# Width/row budgets for each density tier. Full frames are 5 art rows + name;
# compact is 3 art rows + name; minimal is a single sprite/face + name line.
DENSITY_FULL_MIN=6
DENSITY_FULL_MAX=8
DENSITY_COMPACT_MIN=4
DENSITY_COMPACT_MAX=4
DENSITY_MINIMAL_MIN=1
DENSITY_MINIMAL_MAX=1

# Claude Code kills statusline scripts around 1s; stay under that budget.
TIME_BUDGET_MS=${BUDDY_STATUSLINE_TIME_BUDGET_MS:-1000}

# Density matrix uses BUDDY_STATUSLINE_ROWS to make CI independent of the
# ambient terminal size. Auto tier: full >=40 rows, compact 20-39, minimal <20.
# Very narrow terminal widths force minimal regardless of rows.
NARROW_COLS=40

CLEANUP_DIRS=()

fail() {
  echo "FAIL: $1" >&2
  if [ -n "${2:-}" ]; then
    printf '%s\n' "$2" >&2
  fi
  exit 1
}

cleanup() {
  for d in "${CLEANUP_DIRS[@]}"; do
    rm -rf "$d" 2>/dev/null || true
  done
}
trap cleanup EXIT

add_cleanup() {
  CLEANUP_DIRS+=("$1")
}

# Strip SGR / CSI color sequences. Keep the rest of the glyphs intact so
# display-width math matches what a terminal would paint.
strip_ansi() {
  # shellcheck disable=SC2001
  printf '%s' "$1" | sed $'s/\x1b\\[[0-9;]*[A-Za-z]//g'
}

# Display width — mirrors statusline/buddy-status.sh:dwidth and
# server/art.ts:displayWidth (Emoji_Presentation + CJK + VS16 upgrade).
EMOJI_WIDTHS_DATA="$ROOT/statusline/emoji-widths.data"
EMOJI_PRES_2600="$(grep -v '^#' "$EMOJI_WIDTHS_DATA" 2>/dev/null | tr -d '\n' || true)"

dwidth() {
  printf '%s' "$1" | iconv -f UTF-8 -t UTF-32LE 2>/dev/null | od -An -tu4 -v | awk -v pres="$EMOJI_PRES_2600" '
    function load_ranges(value, target,    n, i, count, bounds, start, end, cp) {
      n = split(value, ranges, ",")
      for (i = 1; i <= n; i++) {
        count = split(ranges[i], bounds, "-")
        start = bounds[1] + 0
        end = (count == 2) ? bounds[2] + 0 : start
        for (cp = start; cp <= end; cp++) target[cp] = 1
      }
    }
    BEGIN {
      load_ranges(pres, wide)
    }
    function char_width(cp) {
      if (cp >= 126976) return 2
      if (cp >= 9728 && cp <= 10175) return (cp in wide) ? 2 : 1
      if (cp >= 9472 && cp <= 9631) return 1
      if (cp >= 12288 && cp <= 40959) return 2
      if (cp >= 65281 && cp <= 65376) return 2
      return 1
    }
    {
      for (i = 1; i <= NF; i++) {
        cp = $i + 0
        if (cp == 65039) {
          if (upgradable) { w += 1; upgradable = 0 }
          continue
        }
        if ((cp >= 65024 && cp <= 65038) || cp == 8205) { upgradable = 0; continue }
        cw = char_width(cp)
        w += cw
        upgradable = (cw == 1 && cp >= 9728 && cp <= 10175) ? 1 : 0
      }
    }
    END { print w + 0 }
  '
}

now_ms() {
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import time; print(int(time.time() * 1000))'
  else
    echo $(( $(date +%s) * 1000 ))
  fi
}

# Augment a committed status.json with compactFrames/minimalFrames arrays.
# Falls back to full frames when the current getStatusFrames() does not yet
# emit the new arrays, so the CI harness is honest about missing density.
write_density_status() {
  local src_status="$1"
  local dest_status="$2"
  mkdir -p "$(dirname "$dest_status")"
  bun "$ROOT/scripts/ci/write-density-status.ts" "$dest_status" < "$src_status"
}

# Build a temporary baseline fixture with density-aware status arrays.
make_baseline_dir() {
  local dest="$1"
  rm -rf "$dest"
  mkdir -p "$dest/buddy-state"
  cp "$fixture_dir/buddy-state/config.json" "$dest/buddy-state/config.json"
  write_density_status "$fixture_dir/buddy-state/status.json" "$dest/buddy-state/status.json"
}

# Render statusline against a fixture dir at a fixed terminal width/rows.
# Sets globals: OUTPUT, PLAIN, ELAPSED_MS, EFFECTIVE_COLS, EFFECTIVE_ROWS.
render_at() {
  local source_dir="$1"
  local cols="$2"
  local rows="${3:-50}"
  local density="${4:-auto}"
  local test_dir rendered errfile
  test_dir=$(mktemp -d)
  add_cleanup "$test_dir"
  mkdir -p "$test_dir/buddy-state"
  cp "$source_dir/buddy-state/status.json" "$test_dir/buddy-state/status.json"
  cp "$source_dir/buddy-state/config.json" "$test_dir/buddy-state/config.json"
  for _react in "$source_dir"/buddy-state/reaction.*.json; do
    [ -f "$_react" ] && cp "$_react" "$test_dir/buddy-state/"
  done

  if [ "$density" != "auto" ]; then
    jq --arg d "$density" '.statuslineDensity = $d' "$test_dir/buddy-state/config.json" \
      > "$test_dir/buddy-state/config.json.tmp" \
      && mv "$test_dir/buddy-state/config.json.tmp" "$test_dir/buddy-state/config.json"
  fi

  errfile=$(mktemp)
  rendered="$(
    CLAUDE_CODE_SESSION_ID="" \
    TMUX_PANE="" \
    BUDDY_STATUSLINE_ROWS="$rows" \
    STATUSLINE_PAYLOAD="$payload" \
      python3 "$pty_helper" \
        "$cols" \
        "$ROOT" \
        "$test_dir" \
        "$ROOT/statusline/buddy-status.sh" \
        2>"$errfile"
  )"
  ELAPSED_MS=$(sed -n 's/^STATUSLINE_ELAPSED_MS=//p' "$errfile" | tail -n1)
  rm -f "$errfile"
  case "$ELAPSED_MS" in
    ''|*[!0-9]*) ELAPSED_MS=9999 ;;
  esac
  OUTPUT="$(printf '%s' "$rendered" | tr -d '\r')"
  PLAIN="$(strip_ansi "$OUTPUT")"
  # Assert the real terminal width budget; old <40 special-casing is gone.
  EFFECTIVE_COLS="$cols"
  EFFECTIVE_ROWS="$rows"
}

# Resolve the expected density tier for a (density, rows, cols) tuple.
expected_tier() {
  local density="${1:-auto}"
  local rows="$2"
  local cols="$3"
  case "$density" in
    full|compact|minimal)
      printf '%s\n' "$density"
      ;;
    *)
      if [ "$rows" -lt 20 ] || [ "$cols" -lt "$NARROW_COLS" ]; then
        printf 'minimal\n'
      elif [ "$rows" -lt 40 ]; then
        printf 'compact\n'
      else
        printf 'full\n'
      fi
      ;;
  esac
}

assert_render() {
  local label="$1"
  local cols="$2"
  local rows="$3"
  local expect_name="$4"
  local density="${5:-auto}"
  local expect_substr="${6:-}"

  local tier min_lines max_lines line_count max_w w line
  tier="$(expected_tier "$density" "$rows" "$cols")"
  case "$tier" in
    full)    min_lines=$DENSITY_FULL_MIN;    max_lines=$DENSITY_FULL_MAX    ;;
    compact) min_lines=$DENSITY_COMPACT_MIN; max_lines=$DENSITY_COMPACT_MAX ;;
    minimal) min_lines=$DENSITY_MINIMAL_MIN; max_lines=$DENSITY_MINIMAL_MAX ;;
    *)       fail "[$label] unknown expected tier '$tier'" "$PLAIN"          ;;
  esac

  line_count=$(printf '%s' "$PLAIN" | awk 'END {print NR}')

  printf '%s' "$PLAIN" | grep -Fq "$expect_name" \
    || fail "[$label] pet name '$expect_name' missing from output" "$PLAIN"

  [ "$line_count" -ge "$min_lines" ] && [ "$line_count" -le "$max_lines" ] \
    || fail "[$label] expected $tier line count $min_lines-$max_lines, got $line_count" "$PLAIN"

  if [ -n "$expect_substr" ]; then
    printf '%s' "$PLAIN" | grep -Fq "$expect_substr" \
      || fail "[$label] expected substring missing: $expect_substr" "$PLAIN"
  fi

  # Sprite content must stay art, not descriptor words.
  if printf '%s' "$PLAIN" | grep -Eq '<\([[:alpha:]]{2,}'; then
    fail "[$label] sprite looks corrupted (word leaked into eye slot)" "$PLAIN"
  fi
  if printf '%s' "$PLAIN" | grep -Fq '{E}'; then
    fail "[$label] unresolved {E} eye placeholder in output" "$PLAIN"
  fi

  max_w=0
  while IFS= read -r line || [ -n "$line" ]; do
    [ -z "$line" ] && continue
    w=$(dwidth "$line")
    if [ "$w" -gt "$max_w" ]; then
      max_w=$w
    fi
    if [ "$w" -gt "$cols" ]; then
      fail "[$label] row display width $w exceeds requested cols=$cols: $(printf '%q' "$line")" "$PLAIN"
    fi
  done < <(printf '%s' "$PLAIN")

  # Bubble box: border rows and text rows must agree in outer width.
  # Bubble and art share a line ("| text |--   <(° ..."), so measure only the
  # box segment. Ignore short art glyphs like the duck feet (\`--') that also
  # start with a backtick.
  local box_w="" trimmed first bubble_only seg_w
  while IFS= read -r line || [ -n "$line" ]; do
    [ -z "$line" ] && continue
    trimmed=$(printf '%s' "$line" | sed $'s/^[ \t\xE2\xA0\x80]*//')
    first=$(printf '%s' "$trimmed" | cut -c1)
    bubble_only=""
    if [ "$first" = "." ]; then
      bubble_only=$(printf '%s' "$trimmed" | sed -n 's/^\(\.[-][-]*\.\).*/\1/p')
    elif [ "$first" = '\`' ]; then
      bubble_only=$(printf '%s' "$trimmed" | sed -n "s/^\\(\\\`[-][-]*'\\).*/\\1/p")
    elif [ "$first" = "|" ]; then
      bubble_only=$(printf '%s' "$trimmed" | sed -n 's/^\(|[^|]*|\).*/\1/p')
    fi
    [ -z "$bubble_only" ] && continue
    seg_w=$(dwidth "$bubble_only")
    if [ "$seg_w" -lt 20 ]; then
      continue
    fi
    if [ "$first" = "|" ]; then
      if [ -n "$box_w" ] && [ "$seg_w" -ne "$box_w" ]; then
        fail "[$label] bubble text width $seg_w != border $box_w" "$PLAIN"
      fi
    else
      if [ -z "$box_w" ]; then
        box_w=$seg_w
      elif [ "$seg_w" -ne "$box_w" ]; then
        fail "[$label] bubble border width $seg_w != $box_w" "$PLAIN"
      fi
    fi
  done < <(printf '%s' "$PLAIN")

  # Name row must stay within the panel budget. Minimal is a single line, so
  # allow the full terminal width there; full/compact keep the existing panel
  # sanity check.
  local name_line name_w name_limit
  name_line=$(printf '%s' "$PLAIN" | grep -F "$expect_name" | head -n1 || true)
  if [ -n "$name_line" ]; then
    name_w=$(dwidth "$(printf '%s' "$name_line" | sed $'s/^[ \t\xE2\xA0\x80]*//')")
    if [ "$tier" = "minimal" ]; then
      name_limit=$cols
    else
      name_limit=24
    fi
    if [ "$name_w" -gt "$name_limit" ]; then
      fail "[$label] name row display width $name_w exceeds limit $name_limit" "$PLAIN"
    fi
  fi

  if [ "$ELAPSED_MS" -gt "$TIME_BUDGET_MS" ]; then
    fail "[$label] statusline took ${ELAPSED_MS}ms (budget ${TIME_BUDGET_MS}ms)" "$PLAIN"
  fi

  echo "OK: $label density=$tier requested_cols=$cols rows=$rows lines=$line_count max_row_w=$max_w time=${ELAPSED_MS}ms name='$expect_name'"
}

# ─── Fixture 1: committed baseline (pikachu / Cobalt) ────────────────────────
baseline_dir=$(mktemp -d)
add_cleanup "$baseline_dir"
make_baseline_dir "$baseline_dir"
base_name="$(jq -r .name "$baseline_dir/buddy-state/status.json")"

# Warm-up (not timed). Claude Code keeps the process hot after the first tick.
render_at "$baseline_dir" 80 50 auto >/dev/null || true

# Row/column density matrix. BUDDY_STATUSLINE_ROWS is always explicit so the
# results do not depend on the CI runner's terminal size.
LABELS=(
  "full@80x50"
  "full@120x50"
  "compact@60x30"
  "compact@80x25"
  "minimal@80x10"
  "narrow-minimal@20x50"
  "explicit-full@80x10"
  "explicit-compact@80x50"
  "explicit-minimal@80x50"
  "invalid-normalizes@80x50"
)
ROWS=(50 50 30 25 10 50 10 50 50 50)
COLS=(80 120 60 80 80 20 80 80 80 80)
DENSITIES=(auto auto auto auto auto auto full compact minimal invalid)

for i in "${!LABELS[@]}"; do
  label="${LABELS[$i]}"
  rows="${ROWS[$i]}"
  cols="${COLS[$i]}"
  density="${DENSITIES[$i]}"
  render_at "$baseline_dir" "$cols" "$rows" "$density"
  assert_render "$label" "$cols" "$rows" "$base_name" "$density"
done

# ─── Fixture 2: duck + CJK reaction (real prior breakage) ────────────────────
cjk_dir=$(mktemp -d)
add_cleanup "$cjk_dir"
mkdir -p "$cjk_dir/buddy-state"
cp "$fixture_dir/buddy-state/config.json" "$cjk_dir/buddy-state/config.json"

cat <<'JSON' | bun "$ROOT/scripts/ci/write-density-status.ts" "$cjk_dir/buddy-state/status.json"
{"name":"Daffodil","species":"duck","rarity":"common","stars":"★","face":"(°>","eye":"°","shiny":false,"hat":"none","reaction":"","muted":false,"achievement":"","level":1,"xp":0,"mood":"focused"}
JSON

_ts=$(now_ms)
printf '{"reaction":"编译通过了 你好世界","timestamp":%s,"reason":"turn"}\n' "$_ts" \
  > "$cjk_dir/buddy-state/reaction.default.json"

# Full width CJK/emoji bubble checks.
for cols in 80 93 120 200; do
  render_at "$cjk_dir" "$cols" 50 auto
  assert_render "cjk@${cols}" "$cols" 50 "Daffodil" auto "你好"
  printf '%s' "$PLAIN" | grep -Fq '<(°' \
    || fail "[cjk@${cols}] duck eye row missing degree-sign glyph" "$PLAIN"
done

# Minimal sanity: name stays visible and nothing escapes the narrow budget.
render_at "$cjk_dir" 20 10 auto
assert_render "cjk-minimal@20x10" 20 10 "Daffodil" auto

# ─── Fixture 3: wide-emoji reaction (VS16 / presentation) ────────────────────
emoji_dir=$(mktemp -d)
add_cleanup "$emoji_dir"
mkdir -p "$emoji_dir/buddy-state"
cp "$cjk_dir/buddy-state/status.json" "$emoji_dir/buddy-state/status.json"
cp "$fixture_dir/buddy-state/config.json" "$emoji_dir/buddy-state/config.json"
_ts=$(now_ms)
printf '{"reaction":"ship it 🎉 ❤️ ✨","timestamp":%s,"reason":"success"}\n' "$_ts" \
  > "$emoji_dir/buddy-state/reaction.default.json"

for cols in 80 93 120 200; do
  render_at "$emoji_dir" "$cols" 50 auto
  assert_render "emoji@${cols}" "$cols" 50 "Daffodil" auto "🎉"
done

render_at "$emoji_dir" 20 10 auto
assert_render "emoji-minimal@20x10" 20 10 "Daffodil" auto

# ─── Fixture 4: corrupt eye descriptor must not reach the sprite ─────────────
# Regression for the live "<(normal ..." bug: even if bones.eye is the word
# "normal", getStatusFrames must bake a real glyph across every density array.
corrupt_dir=$(mktemp -d)
add_cleanup "$corrupt_dir"
mkdir -p "$corrupt_dir/buddy-state"
cp "$fixture_dir/buddy-state/config.json" "$corrupt_dir/buddy-state/config.json"

cat <<'JSON' | bun "$ROOT/scripts/ci/write-density-status.ts" "$corrupt_dir/buddy-state/status.json"
{"name":"Daffodil","species":"duck","rarity":"common","stars":"★","face":"(°>","eye":"normal","shiny":false,"hat":"none","reaction":"","muted":false,"achievement":"","level":1,"xp":0,"mood":"focused"}
JSON

# Ensure the corrupt eye descriptor was sanitized in every density array.
bun -e "
import { readFileSync } from 'fs';
const status = JSON.parse(readFileSync(process.argv[1], 'utf8'));
for (const key of ['frames', 'compactFrames', 'minimalFrames']) {
  const arr = status[key];
  if (!arr) continue;
  for (const body of arr) {
    if (body.includes('normal')) {
      console.error('getStatusFrames leaked descriptor into', key, ':', body);
      process.exit(2);
    }
    if (body.includes('{E}')) {
      console.error('unresolved {E} placeholder in', key);
      process.exit(2);
    }
  }
}
" "$corrupt_dir/buddy-state/status.json"

render_at "$corrupt_dir" 80 50 auto
assert_render "corrupt-eye@80" 80 50 "Daffodil" auto
if printf '%s' "$PLAIN" | grep -Fq 'normal'; then
  fail "[corrupt-eye@80] literal normal appeared in render" "$PLAIN"
fi
printf '%s' "$PLAIN" | grep -Fq '<(°' \
  || fail "[corrupt-eye@80] expected sanitized degree-sign eye" "$PLAIN"

render_at "$corrupt_dir" 20 10 auto
assert_render "corrupt-eye-minimal@20x10" 20 10 "Daffodil" auto

# ─── Fixture 5: row override precedence smoke test ───────────────────────────
# PTY rows are set to 50 by the helper, but BUDDY_STATUSLINE_ROWS=10 forces
# minimal selection. This proves the env var wins over the PTY probe.
render_at "$baseline_dir" 80 50 auto
# Sanity: without the override the previous rows=50 call already exercised full.
# Now pin minimal with the same terminal rows to assert override behavior.
render_at "$baseline_dir" 80 10 auto
assert_render "row-override@80x10" 80 10 "$base_name" auto

# ─── Fixture 6: width invariants at the historic narrow width ──────────────────
# COLUMNS=20 used to be special-cased; the new density path must keep the name
# and sprite intact while honoring the actual 20-column budget.
render_at "$baseline_dir" 20 50 auto
assert_render "narrow-width@20x50" 20 50 "$base_name" auto

echo "OK: all statusline golden assertions passed"

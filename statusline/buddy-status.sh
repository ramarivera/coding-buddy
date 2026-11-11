#!/usr/bin/env bash
# coding-buddy status line — animated, right-aligned multi-line companion
#
# Art rendering: the server (writeStatusState in server/state.ts) pre-bakes
# every frame with eye, hat overlay, and blink resolved, and writes them into
# status.json along with the frame-index sequence. This script is a dumb
# cycler — one jq call per tick picks the current frame body.
#
# BUDDY_FAKE_NOW env var: override wall clock for snapshot tests.
#
# Uses Braille Blank (U+2800) for padding — survives JS .trim()
#
# When running inside buddy-shell (the PTY wrapper), skip status line rendering
# so the buddy doesn't show up twice (once in status line, once in wrapper panel).
# Bash treats COLUMNS as a special variable and may refresh it from a
# controlling PTY after startup. Snapshot the exported value before any
# sourced helper or external command can trigger that refresh.
_INHERITED_COLUMNS="${COLUMNS:-}"
_INHERITED_ROWS="${LINES:-}"
# Width math and substring slicing must agree on UTF-8 codepoints. Claude Code
# emits Unicode art even when a caller inherited the POSIX C locale.
_LOCALE_HINT="${LC_ALL:-${LC_CTYPE:-${LANG:-}}}"
case "$_LOCALE_HINT" in
    *UTF-8|*utf-8|*utf8|*UTF8) ;;
    *)
        _UTF8_LOCALE=""
        for _candidate in C.UTF-8 en_US.UTF-8; do
            if locale -a 2>/dev/null | grep -Fx "$_candidate" >/dev/null 2>&1; then
                _UTF8_LOCALE="$_candidate"
                break
            fi
        done
        [ -n "$_UTF8_LOCALE" ] && export LC_ALL="$_UTF8_LOCALE"
        ;;
esac

[ "$BUDDY_SHELL" = "1" ] && exit 0

# `timeout` isn't part of macOS's default BSD userland -- it only exists there
# via Homebrew coreutils, installed as `gtimeout` so it doesn't collide with
# any system tool. Detect what's actually available; every subprocess call
# below goes through _bt so it degrades to running unguarded rather than
# failing outright on a platform that doesn't have either.
#
# Windows also ships its own native timeout.exe (System32), unrelated to GNU
# coreutils and with completely different syntax (`/t <seconds>`, and it
# never runs a trailing command at all). If PATH happens to resolve `timeout`
# to that one instead of Git Bash's coreutils build, every _bt call below
# would silently do nothing useful -- the very first jq read would come back
# empty, and the script exits immediately at the empty-NAME guard, rendering
# nothing. Confirm --version looks like GNU coreutils before trusting a match.
_is_gnu_timeout() {
    "$1" --version </dev/null 2>/dev/null | grep -qi "coreutils"
}
_TIMEOUT_BIN=""
for _cand in timeout gtimeout; do
    if command -v "$_cand" >/dev/null 2>&1 && _is_gnu_timeout "$_cand"; then
        _TIMEOUT_BIN="$_cand"
        break
    fi
done
_bt() {
    local secs="$1"; shift
    if [ -n "$_TIMEOUT_BIN" ]; then
        "$_TIMEOUT_BIN" "$secs" "$@"
    else
        "$@"
    fi
}

# shellcheck source=../scripts/paths.sh
source "$(dirname "${BASH_SOURCE[0]}")/../scripts/paths.sh"
source "$(dirname "${BASH_SOURCE[0]}")/substatus.sh"

STATE="$BUDDY_STATE_DIR/status.json"
CONFIG_FILE="$BUDDY_STATE_DIR/config.json"
# Per-session ID resolved by paths.sh (CLAUDE_CODE_SESSION_ID > TMUX_PANE > default)
SID="$BUDDY_SID"

[ -f "$STATE" ] || exit 0

# One jq process for every status.json field instead of nine — each spawn
# has real cost (antivirus/process-creation overhead on Windows especially),
# and a slow statusline command risks the host's own watchdog killing it
# before it produces output, silently freezing the display on stale content.
#
# Every jq/PowerShell call in this file is also wrapped in `timeout` on top
# of that. On Windows, when the host kills a slow statusline invocation, it
# force-kills the parent bash via taskkill /T /F — but MSYS-spawned
# grandchildren (jq.exe launched from a Git-Bash-emulated fork/exec) don't
# reliably get caught by that /T cascade, so a killed tick can leave its jq
# calls running as permanently orphaned zombies instead of exiting. Found
# 197 of them accumulated on one machine, choking the whole system (CPU
# pinned near 100%, every new process spawn getting slower as a result,
# which meant slower ticks, which meant more timeouts, which meant more
# zombies). `timeout` makes every call self-terminating regardless of what
# happens to its parent, which is the actual fix; being faster (below) just
# makes the underlying kills less frequent.
#
# "absent" (for achievementAt) distinguishes a legacy status.json (no field at
# all) from an explicit 0, which means "no achievement pending" and must not
# render.
IFS=$'\x1f' read -r MUTED NAME RARITY STARS SHINY ACHIEVEMENT ACHIEVEMENT_AT LEVEL MOOD < <(
    _bt 3 jq -r '
            def clean: gsub("[\n\u001f]"; " ");
            [(.muted // false), ((.name // "") | clean), (.rarity // "common"), ((.stars // "") | clean),
            (.shiny // false), ((.achievement // "") | clean),
            (if has("achievementAt") then (.achievementAt // 0) else "absent" end),
            (.level // 1), (.mood // "focused")] | join("")' "$STATE" 2>/dev/null | tr -d '\r'
)
[ "$MUTED" = "true" ] && exit 0
[ -z "$NAME" ] && exit 0

REACTION_FILE="$BUDDY_STATE_DIR/reaction.$SID.json"

BUDDY_STATUSLINE_INPUT=$(cat)

# ─── Animation timing ───────────────────────────────────────────────────────
NOW=${BUDDY_FAKE_NOW:-$(date +%s)}
# The actual frame body is selected later once density/rows are known.

# ─── Rarity color (theme-aware) ─────────────────────────────────────────────
_THEME="dark"
_CFG_RAINBOW_TSV=""
if [ -f "$CONFIG_FILE" ]; then
    # One jq process for every config field instead of three separate reads
    # (theme, rainbowColors, bubble/reaction settings) -- each spawn has real
    # cost, especially on Windows (see the status.json consolidation note above).
    # Command substitution + here-string, not read < <(...): on this
    # Windows/MSYS setup, `read` fed via process substitution has been
    # observed to leave a stray trailing CR on the last field even though
    # `tr -d '\r'` runs cleanly under command substitution -- see the CR
    # note on the status.json read above for the general class of bug.
    _cfg_raw=$(_bt 3 jq -r '
                def clean: tostring | gsub("[\n\u001f]"; " ");
                [((.theme // "auto") | clean), ((.rainbowColors // []) | if type == "array" then @tsv else "" end),
                ((.reactionTTL // 900) | clean), ((.bubbleWidth // 44) | clean), ((.bubbleMargin // 8) | clean),
                ((.statuslineWidthAdjust // 0) | clean), ((.statuslineDensity // "auto") | clean)] | join("")' \
            "$CONFIG_FILE" 2>/dev/null | tr -d '')
    IFS=$'' read -r _cfg_theme _CFG_RAINBOW_TSV _ttl _bw _bm _wa _density <<< "$_cfg_raw"
    [ "$_cfg_theme" = "light" ] && _THEME="light"
fi

NC=$'\033[0m'
NEUTRAL=$'\033[39m'
case "$RARITY" in
  common)
    [ "$_THEME" = "light" ] && C=$'\033[38;2;90;90;90m' || C=$'\033[38;2;153;153;153m' ;;
  uncommon)
    [ "$_THEME" = "light" ] && C=$'\033[38;2;22;115;55m' || C=$'\033[38;2;78;186;101m' ;;
  rare)
    [ "$_THEME" = "light" ] && C=$'\033[38;2;55;85;210m' || C=$'\033[38;2;177;185;249m' ;;
  epic)
    [ "$_THEME" = "light" ] && C=$'\033[38;2;110;55;200m' || C=$'\033[38;2;175;135;255m' ;;
  legendary)
    [ "$_THEME" = "light" ] && C=$'\033[38;2;180;120;0m' || C=$'\033[38;2;255;193;7m' ;;
  *)         C=$'\033[0m' ;;
esac

B=$'\xe2\xa0\x80'  # Braille Blank U+2800

# ─── Rainbow colors for shiny buddies ────────────────────────────────────────
# Default ROYGBIV palette; overridden by rainbowColors in config.json
_hex_to_ansi() {
    local hex="${1#\#}"
    printf '\033[38;2;%d;%d;%dm' "$(( 16#${hex:0:2} ))" "$(( 16#${hex:2:2} ))" "$(( 16#${hex:4:2} ))"
}

RAINBOW=(
  $'\033[38;2;255;50;50m'
  $'\033[38;2;255;140;0m'
  $'\033[38;2;255;220;0m'
  $'\033[38;2;50;210;50m'
  $'\033[38;2;50;120;255m'
  $'\033[38;2;100;50;220m'
  $'\033[38;2;180;50;220m'
)

if [ -n "$_CFG_RAINBOW_TSV" ]; then
    RAINBOW=()
    for _hex in $_CFG_RAINBOW_TSV; do
        RAINBOW+=("$(_hex_to_ansi "$_hex")")
    done
fi

COLOR_ENABLED=1
[ -n "${NO_COLOR:-}" ] && COLOR_ENABLED=0

RAINBOW_LEN=${#RAINBOW[@]}
RAINBOW_OFFSET=$(( NOW % RAINBOW_LEN ))

_is_positive_int() {
    case "$1" in
        ''|*[!0-9]*) return 1 ;;
    esac
    [ "$1" -gt 0 ] 2>/dev/null && return 0
    return 1
}

# ─── Terminal size (rows + columns from the same stty size probe) ─────────────
COLS=0
ROWS=0

# Claude Code renders this command inside a content box, not across the full
# terminal. Reserve two columns for settings.json padding (1 per side) and
# twelve for Claude Code's internal left/right content margins. The 14-column
# reserve is calibrated against the reported ~74-column content box; the
# regression fixture is rendered at 60, 80, and 120 columns to assert the
# resulting budget before output.
CHROME_RESERVE=14
STATUSLINE_WIDTH_ADJUST=0

ROWS=0
COLS=0

# Rows/cols resolution precedence (real use):
#   1. BUDDY_STATUSLINE_ROWS / BUDDY_STATUSLINE_COLS (validated positive ints)
#   2. exported LINES / COLUMNS (validated positive ints)
#   3. Linux: /proc/$PID/fd/0 PTY via stty size (captures both values)
#   4. macOS: ps + stty on /dev/$TTY_NAME (captures both values)
#   5. Windows: PowerShell (Get-Host).UI.RawUI.WindowSize.Height/Width
#   6. final defaults: ROWS 999 (full), COLS 125
if _is_positive_int "${BUDDY_STATUSLINE_ROWS:-}"; then
    ROWS=$((10#${BUDDY_STATUSLINE_ROWS}))
elif _is_positive_int "$_INHERITED_ROWS"; then
    ROWS=$((10#$_INHERITED_ROWS))
fi

if _is_positive_int "${BUDDY_STATUSLINE_COLS:-}"; then
    COLS=$((10#${BUDDY_STATUSLINE_COLS}))
elif _is_positive_int "$_INHERITED_COLUMNS"; then
    COLS=$((10#$_INHERITED_COLUMNS))
fi

# If either dimension is still unknown, walk the process tree and read the
# PTY dimensions once. stty size returns "rows cols"; parse both from the same
# probe so rows and cols are consistent and no extra detection pass is needed.
#
# This walk is Linux/macOS-only: there is no /proc and no real tty devices on
# Windows, so it is guaranteed to run all 5 iterations and fail every time,
# burning real time for nothing on a command that a slow-statusline watchdog
# can kill outright (see the jq consolidation note above — same concern).
case "$(uname -s)" in
  MINGW*|CYGWIN*|MSYS*) _IS_WINDOWS=1 ;;
  *)                    _IS_WINDOWS=0 ;;
esac

if [ "$_IS_WINDOWS" -eq 0 ] && { [ "$ROWS" -lt 1 ] 2>/dev/null || [ "$COLS" -lt 1 ] 2>/dev/null; }; then
    PID=$$
    for _ in 1 2 3 4 5; do
        PID=$(ps -o ppid= -p "$PID" 2>/dev/null | tr -d ' ')
        [ -z "$PID" ] || [ "$PID" = "1" ] && break

        # Linux: read PTY device from /proc
        PTY=$(readlink "/proc/${PID}/fd/0" 2>/dev/null)
        if [ -c "$PTY" ] 2>/dev/null; then
            _stty=$(stty size < "$PTY" 2>/dev/null)
            if [ -n "$_stty" ]; then
                _rows=${_stty%% *}
                _cols=${_stty##* }
                [ "$ROWS" -lt 1 ] 2>/dev/null && _is_positive_int "$_rows" && ROWS=$((10#$_rows))
                [ "$COLS" -lt 1 ] 2>/dev/null && _is_positive_int "$_cols" && COLS=$((10#$_cols))
                [ "$ROWS" -gt 0 ] 2>/dev/null && [ "$COLS" -gt 0 ] 2>/dev/null && break
            fi
        fi

        # macOS: /proc doesn't exist — get TTY name from process table
        TTY_NAME=$(ps -o tty= -p "$PID" 2>/dev/null | tr -d ' ')
        if [ -n "$TTY_NAME" ] && [ "$TTY_NAME" != "??" ] && [ "$TTY_NAME" != "?" ]; then
            TTY_DEV="/dev/$TTY_NAME"
            if [ -c "$TTY_DEV" ] 2>/dev/null; then
                _stty=$(stty size < "$TTY_DEV" 2>/dev/null)
                if [ -n "$_stty" ]; then
                    _rows=${_stty%% *}
                    _cols=${_stty##* }
                    [ "$ROWS" -lt 1 ] 2>/dev/null && _is_positive_int "$_rows" && ROWS=$((10#$_rows))
                    [ "$COLS" -lt 1 ] 2>/dev/null && _is_positive_int "$_cols" && COLS=$((10#$_cols))
                    [ "$ROWS" -gt 0 ] 2>/dev/null && [ "$COLS" -gt 0 ] 2>/dev/null && break
                fi
            fi
        fi
    done
fi

[ "${COLS:-0}" -lt 1 ] 2>/dev/null && COLS=0
# Windows: /proc and TTY device detection don't exist; use PowerShell as
# fallback. One process for both dimensions instead of two — each PowerShell
# spawn is a full host boot (~0.5-1s), not just an ordinary process spawn.
if [ "${COLS:-0}" -lt 1 ] 2>/dev/null || [ "${ROWS:-0}" -lt 1 ] 2>/dev/null; then
    _ps_dims=$(_bt 5 powershell.exe -NoProfile -Command "(Get-Host).UI.RawUI.WindowSize.Width; (Get-Host).UI.RawUI.WindowSize.Height" 2>/dev/null | tr -d '\r')
    # Pure parameter expansion, not sed -- two more process spawns just to
    # split two lines would undercut the whole point of merging the calls.
    # Only trust the split when both lines actually came back: if PowerShell
    # printed just the width (a truncated/partial call), `${_ps_dims#*$'\n'}`
    # with no newline in the string returns the string unchanged, so a lone
    # width would get read as _ps_rows too -- accepted by _is_positive_int
    # and selecting the wrong density tier.
    case "$_ps_dims" in
        *$'\n'*)
            _ps_cols="${_ps_dims%%$'\n'*}"
            _ps_rows="${_ps_dims#*$'\n'}"
            ;;
        *)
            _ps_cols=""
            _ps_rows=""
            ;;
    esac
    if [ "${COLS:-0}" -lt 1 ] 2>/dev/null && _is_positive_int "$_ps_cols"; then
        [ "$_ps_cols" -gt 40 ] 2>/dev/null && COLS=$((10#$_ps_cols))
    fi
    if [ "${ROWS:-0}" -lt 1 ] 2>/dev/null; then
        _is_positive_int "$_ps_rows" && ROWS=$((10#$_ps_rows))
    fi
fi

[ "${COLS:-0}" -lt 1 ] 2>/dev/null && COLS=125
[ "${ROWS:-0}" -lt 1 ] 2>/dev/null && ROWS=999

COLS=$((10#$COLS))
DETECTED_COLS="$COLS"
DETECTED_ROWS="$ROWS"

# ─── Reaction bubble (with TTL check) ────────────────────────────────────────
# The achievement banner is resolved further down, once REACTION_TTL is known —
# it expires on the same clock as a reaction. Without that it latches into the
# shared status.json and pins every session's bubble to the last trophy.
BUBBLE=""
REACTION_TTL=900
INNER_W=44
MARGIN=8
DENSITY="auto"
# Each field defaults independently below by simply not overwriting its
# pre-set default when empty/invalid -- no need to (and no correctness
# reason to) reset every field just because one of them came back empty.
case "$_ttl" in ''|*[!0-9]*) ;; *) REACTION_TTL="$_ttl" ;; esac
case "$_bw" in ''|*[!0-9]*) ;; *) INNER_W="$_bw" ;; esac
case "$_bm" in ''|*[!0-9]*) ;; *) MARGIN="$_bm" ;; esac
if printf '%s' "$_wa" | grep -Eq '^[+-]?[0-9]+$'; then
    case "$_wa" in
        +*) STATUSLINE_WIDTH_ADJUST=$((10#${_wa#+})) ;;
        -*) STATUSLINE_WIDTH_ADJUST=$((-10#${_wa#-})) ;;
        *)  STATUSLINE_WIDTH_ADJUST=$((10#$_wa)) ;;
    esac
fi
case "$_density" in
    auto|full|compact|minimal) DENSITY="$_density" ;;
    *) DENSITY="auto" ;;
esac
# ─── Statusline density tier ─────────────────────────────────────────────────
# Explicit config/env density overrides pin the tier; otherwise rows drive it:
#   full >= 40, compact 20-39, minimal < 20. Very narrow terminals also force minimal.
if [ -n "${BUDDY_STATUSLINE_DENSITY:-}" ]; then
    DENSITY="${BUDDY_STATUSLINE_DENSITY}"
fi
case "$DENSITY" in
    full|compact|minimal) TIER="$DENSITY" ;;
    *)
        TIER="full"
        if [ "$DETECTED_ROWS" -lt 40 ] 2>/dev/null; then
            TIER="compact"
        fi
        if [ "$DETECTED_ROWS" -lt 20 ] 2>/dev/null; then
            TIER="minimal"
        fi
        if [ "$DETECTED_COLS" -lt 40 ] 2>/dev/null; then
            TIER="minimal"
        fi
        ;;
esac

_sweep_expired_reactions() {
    [ "$REACTION_TTL" -gt 0 ] 2>/dev/null || return 0
    local now cutoff_ms cutoff_seconds file ts
    now=$(date +%s)
    cutoff_ms=$(( (now - REACTION_TTL) * 1000 ))
    cutoff_seconds=$(( now - REACTION_TTL ))

    for file in "$BUDDY_STATE_DIR"/reaction.*.json; do
        [ -f "$file" ] || continue
        ts=$(_bt 3 jq -r '.timestamp // 0' "$file" 2>/dev/null || echo 0)
        case "$ts" in
            ''|*[!0-9]*) rm -f "$file" 2>/dev/null ;;
            *) [ "$ts" -le "$cutoff_ms" ] 2>/dev/null && rm -f "$file" 2>/dev/null ;;
        esac
    done

    for file in "$BUDDY_STATE_DIR"/.last_comment.*; do
        [ -f "$file" ] || continue
        ts=$(cat "$file" 2>/dev/null)
        case "$ts" in
            ''|*[!0-9]*) rm -f "$file" 2>/dev/null ;;
            *) [ "$ts" -le "$cutoff_seconds" ] 2>/dev/null && rm -f "$file" 2>/dev/null ;;
        esac
    done
}

_sweep_expired_reactions

# Achievement banner: shown only while fresh. ACHIEVEMENT_AT is epoch ms, written
# alongside the name by writeStatusState. A legacy status.json without the field
# (pre-upgrade, or a snapshot fixture) is treated as fresh — the next write from
# the server backfills it.
#
# Validity and age are separate gates on purpose. A zeroed or malformed
# achievementAt means "nothing pending" and must never render, including under
# reactionTTL=0 — that opt-out disables *expiry*, not the field's meaning.
if [ -n "$ACHIEVEMENT" ] && [ "$ACHIEVEMENT" != "null" ]; then
    ACH_FRESH=1
    if [ "$ACHIEVEMENT_AT" != "absent" ]; then
        case "$ACHIEVEMENT_AT" in
            ''|0|*[!0-9]*) ACH_FRESH=0 ;;
            *)
                if [ "$REACTION_TTL" -gt 0 ] 2>/dev/null; then
                    ACH_AGE=$(( ($(date +%s) * 1000 - ACHIEVEMENT_AT) / 1000 ))
                    [ "$ACH_AGE" -ge "$REACTION_TTL" ] && ACH_FRESH=0
                fi
                ;;
        esac
    fi
    [ "$ACH_FRESH" -eq 1 ] && BUBBLE=$'\xf0\x9f\x8f\x86'" $ACHIEVEMENT"
fi

# One jq process for reaction + timestamp instead of two (see the earlier
# consolidation notes on why per-call spawn cost matters here).
IFS=$'\x1f' read -r REACTION TS < <(
    _bt 3 jq -r '[((.reaction // "") | gsub("[\n\u001f]"; " ")), (.timestamp // 0)] | join("")' "$REACTION_FILE" 2>/dev/null | tr -d '\r'
)
TS="${TS:-0}"
if [ -n "$REACTION" ] && [ "$REACTION" != "null" ] && [ "$REACTION" != "" ]; then
    FRESH=0
    if [ "$REACTION_TTL" -eq 0 ]; then
        FRESH=1
    elif [ -f "$REACTION_FILE" ]; then
        if [ "$TS" != "0" ]; then
            NOW=$(date +%s)
            AGE=$(( (NOW * 1000 - TS) / 1000 ))
            [ "$AGE" -lt "$REACTION_TTL" ] && FRESH=1
        fi
    fi
    if [ "$FRESH" -eq 1 ]; then
        if [ -n "$BUBBLE" ]; then
            BUBBLE="$BUBBLE | \"${REACTION}\""
        else
            BUBBLE="\"${REACTION}\""
        fi
    else
        rm -f "$REACTION_FILE" 2>/dev/null
    fi
fi

# ─── Animation: pick current density frame from server-rendered frames ───────
NOW=${BUDDY_FAKE_NOW:-$(date +%s)}
FRAME_BODY=$(_bt 3 jq -r --argjson now "$NOW" --arg tier "$TIER" '
    .frameSequence[$now % (.frameSequence | length)] as $idx
    | if $tier == "compact" then ((.compactFrames? // .frames) | .[$idx] // .frames[$idx])
      elif $tier == "minimal" then ((.minimalFrames? // .frames) | .[$idx] // .frames[$idx])
      else .frames[$idx]
      end // ""
' "$STATE" 2>/dev/null | tr -d '\r')

# Fallback when status.json lacks .frames — e.g. server/bash version skew
# during install or while the MCP server hasn't rewritten the file yet. Keep
# the buddy visible in a degraded form instead of emitting an empty block.
if [ -z "$FRAME_BODY" ]; then
    FRAME_BODY=$'            \n    (°°)    \n    (  )    \n            \n            '
fi

ART_LINES=()
while IFS= read -r line; do
    ART_LINES+=("$line")
done <<< "$FRAME_BODY"

# ─── Build all art lines ──────────────────────────────────────────────────────
# ART_LINES comes from the pre-rendered frame (already includes hat + blink).
# Center the name under the art. Frames are 12 cols wide (see server/art.ts),
# so the geometric center sits at col 6.
NAME_WITH_LEVEL="$NAME"
[ "$LEVEL" -gt 1 ] 2>/dev/null && NAME_WITH_LEVEL="${NAME} [L${LEVEL}]"
[ -n "$STARS" ] && NAME_WITH_LEVEL="${NAME_WITH_LEVEL} ${STARS}"
case "$MOOD" in
    happy)       MOOD_EMOJI="" ;;
    focused)     MOOD_EMOJI="" ;;
    excited)     MOOD_EMOJI="" ;;
    tired)       MOOD_EMOJI="" ;;
    melancholy)  MOOD_EMOJI="" ;;
    chaotic)     MOOD_EMOJI="" ;;
    *)           MOOD_EMOJI="" ;;
esac
NAME_WITH_LEVEL="${NAME_WITH_LEVEL}${MOOD_EMOJI}"
NAME_LEN=${#NAME_WITH_LEVEL}
ART_CENTER=6
NAME_PAD=$(( ART_CENTER - NAME_LEN / 2 ))
[ "$NAME_PAD" -lt 0 ] && NAME_PAD=0
NAME_LINE="$(printf '%*s%s' "$NAME_PAD" '' "$NAME_WITH_LEVEL")"

DIM=$'\033[2;3m'
if [ "$COLOR_ENABLED" -eq 0 ]; then
    C=""
    NC=""
    NEUTRAL=""
    DIM=""
    for _rainbow_index in "${!RAINBOW[@]}"; do
        RAINBOW[$_rainbow_index]=""
    done
fi

ALL_LINES=()
ALL_COLORS=()
_arc=0
for line in "${ART_LINES[@]}"; do
    ALL_LINES+=("$line")
    if [ "$SHINY" = "true" ]; then
        ALL_COLORS+=("${RAINBOW[$(( (_arc + RAINBOW_OFFSET) % RAINBOW_LEN ))]}")
    else
        ALL_COLORS+=("$C")
    fi
    _arc=$(( _arc + 1 ))
done
ALL_LINES+=("$NAME_LINE"); ALL_COLORS+=("$C")

ART_COUNT=${#ALL_LINES[@]}

# ─── Speech bubble (left of art, word-wrapped) ──────────────────────────────
# Strip the quotes we added earlier
BUBBLE_TEXT=""
if [ -n "$BUBBLE" ]; then
    BUBBLE_TEXT="${BUBBLE%\"}"
    BUBBLE_TEXT="${BUBBLE_TEXT#\"}"
fi

# ─── Display width (emojis count as 2 cols) ──────────────────────────────────
# iconv turns the string into a stream of UTF-32LE codepoints, then awk sums
# widths. Rules mirror server/art.ts:displayWidth; the generated data lists
# every Unicode Emoji_Presentation codepoint, while VS16 upgrades a previous
# narrow emoji to 2 cols (e.g. ❤ + VS16).
EMOJI_WIDTHS_DATA="$(dirname "${BASH_SOURCE[0]}")/emoji-widths.data"
EMOJI_PRES_2600="$(grep -v '^#' "$EMOJI_WIDTHS_DATA" 2>/dev/null | tr -d '\n')"
EMOJI_TEXT_DATA="$(dirname "${BASH_SOURCE[0]}")/emoji-text.data"
EMOJI_TEXT="$(grep -v '^#' "$EMOJI_TEXT_DATA" 2>/dev/null | tr -d '\n')"

# iconv is not guaranteed to exist even where it always has before: it is
# genuinely absent on this machine right now (only the libiconv DLL other
# tools link against is installed, not the standalone binary) despite having
# worked earlier in the same environment, so this is not a platform check to
# skip -- it is a real, observed runtime gap. python3 (already a hard
# dependency of the wider install, per README/cli/install.ts) reads the same
# UTF-8 bytes and emits the same "one decimal codepoint per token" shape
# `od -An -tu4` does, so the awk scripts below don't need to know which one
# ran. Without this fallback, every non-ASCII value (rarity stars, mood/
# achievement glyphs) silently gets zero width data and whatever depends on
# it -- truncation, centering -- breaks for exactly the buddies (rare/epic/
# legendary, i.e. the ones with stars) most likely to need it.
command -v iconv >/dev/null 2>&1 && _HAS_ICONV=1 || _HAS_ICONV=0
_utf8_codepoints() {
    if [ "$_HAS_ICONV" -eq 1 ]; then
        printf '%s' "$1" | iconv -f UTF-8 -t UTF-32LE 2>/dev/null | od -An -tu4
    else
        printf '%s' "$1" | python3 -c '
import sys
data = sys.stdin.buffer.read().decode("utf-8", "replace")
print(" ".join(str(ord(c)) for c in data))
' 2>/dev/null
    fi
}

dwidth() {
    # Fast path: every ASCII codepoint is width 1 under char_width() below (none
    # of the wide/CJK/fullwidth/box-drawing ranges are in 0-127), so for ASCII-only
    # input this is just the byte length. Skipping straight to that avoids the
    # iconv|od|awk pipeline — three process spawns per call, each costing real
    # time on Windows — for what is, in practice, most reaction text. Callers
    # invoke dwidth() once per word during word-wrap, so on a slow spawn platform
    # this was previously seconds of wall-clock time for one ordinary reaction.
    case "$1" in
        *[![:ascii:]]*) ;;
        *) printf '%s' "${#1}"; return ;;
    esac
    _utf8_codepoints "$1" | awk -v pres="$EMOJI_PRES_2600" -v text="$EMOJI_TEXT" '
    function load_ranges(value, target,    n, i, count, piece, bounds, start, end, cp) {
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
        load_ranges(text, text_default)
    }
    # Precondition: cp is neither a variation selector (65024-65039) nor ZWJ
    # (8205); the main loop filters those before calling in.
    function char_width(cp) {
        if (cp in wide) return 2
        if (cp >= 9472 && cp <= 9631) return 1
        if (cp >= 12288 && cp <= 40959) return 2
        if (cp >= 65281 && cp <= 65376) return 2
        return 1
    }
    { for (i = 1; i <= NF; i++) {
        cp = $i + 0
        if (cp == 65039) {
            if (upgradable) { w += 1; upgradable = 0 }
            continue
        }
        if ((cp >= 65024 && cp <= 65038) || cp == 8205) { upgradable = 0; continue }
        cw = char_width(cp)
        w += cw
        upgradable = 0
        if (cw == 1 && (cp in text_default)) upgradable = 1
    } }
    END { print w+0 }'
}
# Emit one display-width value per UTF-8 codepoint. ANSI-aware truncation uses
# this profile to make one Unicode-width pass over the complete output row.
dwidth_profile() {
    # Same ASCII fast path as dwidth() above, just emitting one "1" per byte
    # instead of a single summed total (every caller reads this line-by-line).
    case "$1" in
        *[![:ascii:]]*) ;;
        *)
            local _n=${#1} _i
            for (( _i = 0; _i < _n; _i++ )); do printf '1\n'; done
            return
            ;;
    esac
    _utf8_codepoints "$1" | awk -v pres="$EMOJI_PRES_2600" -v text="$EMOJI_TEXT" '
    function load_ranges(value, target,    n, i, count, piece, bounds, start, end, cp) {
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
        load_ranges(text, text_default)
    }
    function char_width(cp) {
        if (cp in wide) return 2
        if (cp >= 9472 && cp <= 9631) return 1
        if (cp >= 12288 && cp <= 40959) return 2
        if (cp >= 65281 && cp <= 65376) return 2
        return 1
    }
    {
        for (j = 1; j <= NF; j++) {
            cp = $j + 0
            idx++
            if (cp == 65039) {
                if (upgradable && idx > 1) widths[idx - 1] += 1
                widths[idx] = 0
                upgradable = 0
                continue
            }
            if ((cp >= 65024 && cp <= 65038) || cp == 8205) {
                widths[idx] = 0
                upgradable = 0
                continue
            }
            cw = char_width(cp)
            widths[idx] = cw
            upgradable = 0
            if (cw == 1 && (cp in text_default)) upgradable = 1
        }
    }
    END {
        for (j = 1; j <= idx; j++) print widths[j] + 0
    }'
}
# \xe2\x94\x80\xe2\x94\x80\xe2\x94\x80 Batched width helpers \xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80\xe2\x94\x80
# Same width rules as dwidth()/dwidth_profile() above, but for N strings at
# once: joins whichever arguments actually contain non-ASCII characters with
# the Unit Separator (already used elsewhere in this file as a safe
# delimiter) and computes all of their codepoints/widths in a single
# subprocess pair instead of one pair per string. Pure-ASCII arguments keep
# using the same fast path dwidth()/dwidth_profile() use, at zero extra cost.

# Fills the global _BATCH_PROFILES array: one space-separated per-character
# width list per non-ASCII argument, in argument order.
_batch_dwidth_profiles() {
    _BATCH_PROFILES=()
    local _joined="" _s _first=1 _raw _line
    for _s in "$@"; do
        if [ "$_first" -eq 1 ]; then
            _joined="$_s"
            _first=0
        else
            _joined="${_joined}"$'\x1f'"${_s}"
        fi
    done
    _raw=$(_utf8_codepoints "$_joined" | awk -v pres="$EMOJI_PRES_2600" -v text="$EMOJI_TEXT" '
    function load_ranges(value, target,    n, i, count, piece, bounds, start, end, cp) {
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
        load_ranges(text, text_default)
    }
    function char_width(cp) {
        if (cp in wide) return 2
        if (cp >= 9472 && cp <= 9631) return 1
        if (cp >= 12288 && cp <= 40959) return 2
        if (cp >= 65281 && cp <= 65376) return 2
        return 1
    }
    function flush(    j, line) {
        line = ""
        for (j = 1; j <= idx; j++) line = line (j > 1 ? " " : "") (widths[j] + 0)
        print line
        idx = 0
        upgradable = 0
        delete widths
    }
    {
        for (i = 1; i <= NF; i++) {
            cp = $i + 0
            if (cp == 31) { flush(); continue }
            if (cp == 65039) {
                if (upgradable && idx > 0) widths[idx] += 1
                idx++
                widths[idx] = 0
                upgradable = 0
                continue
            }
            if ((cp >= 65024 && cp <= 65038) || cp == 8205) {
                idx++
                widths[idx] = 0
                upgradable = 0
                continue
            }
            idx++
            cw = char_width(cp)
            widths[idx] = cw
            upgradable = 0
            if (cw == 1 && (cp in text_default)) upgradable = 1
        }
    }
    END { flush() }')
    while IFS= read -r _line; do
        _BATCH_PROFILES+=("$_line")
    done <<< "$_raw"
}

# Sum variant: fills the global _BATCH_WIDTHS array with one integer total
# width per argument, applying the same per-argument ASCII fast path as
# dwidth() so only the non-ASCII arguments pay for the batched subprocess.
_batch_dwidth() {
    _BATCH_WIDTHS=()
    local -a _slow_idx=() _slow_strs=()
    local _i=0 _s _k=0 _profile _sum _w
    for _s in "$@"; do
        case "$_s" in
            *[![:ascii:]]*)
                _slow_idx+=("$_i")
                _slow_strs+=("$_s")
                _BATCH_WIDTHS[_i]=0
                ;;
            *)
                _BATCH_WIDTHS[_i]=${#_s}
                ;;
        esac
        _i=$(( _i + 1 ))
    done
    if [ "${#_slow_strs[@]}" -gt 0 ]; then
        _batch_dwidth_profiles "${_slow_strs[@]}"
        for _profile in "${_BATCH_PROFILES[@]}"; do
            _sum=0
            for _w in $_profile; do _sum=$(( _sum + _w )); done
            _BATCH_WIDTHS[${_slow_idx[$_k]}]=$_sum
            _k=$(( _k + 1 ))
        done
    fi
}

# Profile variant used for the final render pass: fills the global
# _LINE_WIDTHS array with one space-separated per-character width list per
# argument (ASCII arguments get an all-1s list without touching the batch).
_batch_dwidth_profiles_indexed() {
    _LINE_WIDTHS=()
    local -a _slow_idx=() _slow_strs=()
    local _i=0 _s _n _c _w _k=0
    for _s in "$@"; do
        case "$_s" in
            *[![:ascii:]]*)
                _slow_idx+=("$_i")
                _slow_strs+=("$_s")
                _LINE_WIDTHS[_i]=""
                ;;
            *)
                _n=${#_s}
                _w=""
                for (( _c = 0; _c < _n; _c++ )); do _w="${_w}1 "; done
                _LINE_WIDTHS[_i]="$_w"
                ;;
        esac
        _i=$(( _i + 1 ))
    done
    if [ "${#_slow_strs[@]}" -gt 0 ]; then
        _batch_dwidth_profiles "${_slow_strs[@]}"
        for _w in "${_BATCH_PROFILES[@]}"; do
            _LINE_WIDTHS[${_slow_idx[$_k]}]="$_w"
            _k=$(( _k + 1 ))
        done
    fi
}

# Batch every sizing dwidth() call (art rows + the name label) into a single
# subprocess pair instead of one pair per non-ASCII string -- see the
# _utf8_codepoints note above for why per-call spawn cost matters here.
_batch_dwidth "${ART_LINES[@]}" "$NAME_WITH_LEVEL"
ART_W=0
_art_line_count=${#ART_LINES[@]}
for (( _wi = 0; _wi < _art_line_count; _wi++ )); do
    line_w="${_BATCH_WIDTHS[$_wi]}"
    [ "$line_w" -gt "$ART_W" ] && ART_W="$line_w"
done

# Keep the label inside the same sprite column as the art. The exact Unicode
# width rules live in dwidth(), so the shell and TS renderers agree on bounds.
LABEL_W="${_BATCH_WIDTHS[$_art_line_count]}"
if [ "$LABEL_W" -gt "$ART_W" ] 2>/dev/null; then
    ART_W="$LABEL_W"
    NAME_PAD=$(( (ART_W - LABEL_W) / 2 ))
    NAME_LINE="$(printf '%*s%s' "$NAME_PAD" '' "$NAME_WITH_LEVEL")"
    ALL_LINES[$(( ART_COUNT - 1 ))]="$NAME_LINE"
fi
# NAME_LINE is NAME_PAD plain ASCII spaces (width 1 each) prepended to the
# already-measured label, so its width is arithmetic -- no extra dwidth call.
NAME_LINE_W=$(( NAME_PAD + LABEL_W ))
# Centering the name against a short fixture frame can make the label wider
# than every art row; include that width before sizing the card.
[ "$NAME_LINE_W" -gt "$ART_W" ] && ART_W="$NAME_LINE_W"

STATUSLINE_BUDGET=$(( DETECTED_COLS - CHROME_RESERVE + STATUSLINE_WIDTH_ADJUST ))
# Preserve the existing compact-card behavior at the smallest supported
# terminal size; the reserve applies once there is enough room for chrome.
if [ "$DETECTED_COLS" -ge 40 ] 2>/dev/null && [ "$STATUSLINE_BUDGET" -lt 40 ]; then
    STATUSLINE_BUDGET=40
fi
[ "$STATUSLINE_BUDGET" -gt "$DETECTED_COLS" ] && STATUSLINE_BUDGET="$DETECTED_COLS"

# The sprite and its identifying name are the irreducible minimum of the card.
# Never let the chrome reserve push the usable budget below the sprite's own
# width; if it does, fall back to the raw terminal width. If the terminal
# itself is narrower than the sprite, use the historical default rather than
# slicing art or name.
if [ "$STATUSLINE_BUDGET" -lt "$ART_W" ]; then
    STATUSLINE_BUDGET="$DETECTED_COLS"
fi
if [ "$STATUSLINE_BUDGET" -lt "$ART_W" ]; then
    STATUSLINE_BUDGET=125
fi
COLS="$STATUSLINE_BUDGET"

# ─── Density branch: compact drops the bubble; minimal is a single line. ─────
if [ "$TIER" = "minimal" ]; then
    _face_plain="${ART_LINES[0]:-}"
    if [ -z "$_face_plain" ]; then
        for _fline in "${ART_LINES[@]}"; do
            [ -n "$_fline" ] && _face_plain="$_fline" && break
        done
    fi
    [ -z "$_face_plain" ] && _face_plain=$'    (°°)    '
    _min_plain="${_face_plain} ${NAME_WITH_LEVEL}"
    _min_w=$(dwidth "$_min_plain")
    if [ -n "$REACTION" ]; then
        _react_plain=" │ \"${REACTION}\""
        _react_w=$(dwidth "$_react_plain")
        if [ $((_min_w + _react_w)) -le "$STATUSLINE_BUDGET" ]; then
            _min_plain="${_min_plain}${_react_plain}"
            _min_w=$(dwidth "$_min_plain")
        fi
    fi
    if [ "$STATUSLINE_BUDGET" -lt "$_min_w" ]; then
        STATUSLINE_BUDGET="$DETECTED_COLS"
    fi
    # Never widen past the real terminal: a hard-coded fallback here would
    # defeat ansi_truncate below and emit rows wider than the pane, wrapping
    # and clobbering the prompt on genuinely narrow terminals.
    if [ "$STATUSLINE_BUDGET" -lt "$_min_w" ]; then
        STATUSLINE_BUDGET="$DETECTED_COLS"
    fi
    COLS="$STATUSLINE_BUDGET"
    ART_LINES=("$_min_plain")
    ALL_COLORS=("$C")
    ALL_LINES=("$_min_plain")
    ART_COUNT=1
    ART_W="$_min_w"
    BUBBLE=""
    BUBBLE_TEXT=""
elif [ "$TIER" = "compact" ]; then
    BUBBLE=""
    BUBBLE_TEXT=""
fi

# The bubble, tail, and sprite are one unit. At narrow widths, drop the
# bubble rather than allowing a partial border or tail to escape the panel.
MIN_BUBBLE_INNER=12
TAIL_W=3
MAX_INNER=$(( COLS - ART_W - TAIL_W - 4 - MARGIN ))
if [ -n "$BUBBLE" ] && [ "$MAX_INNER" -ge "$MIN_BUBBLE_INNER" ] 2>/dev/null; then
    [ "$INNER_W" -gt "$MAX_INNER" ] && INNER_W="$MAX_INNER"
else
    BUBBLE=""
    BUBBLE_TEXT=""
fi

# ─── Word-wrap bubble text ────────────────────────────────────────────────────
TEXT_LINES=()
if [ -n "$BUBBLE_TEXT" ]; then
    read -r -a WORDS <<< "$BUBBLE_TEXT"
    CUR_LINE=""
    CUR_W=0
    for word in "${WORDS[@]}"; do
        word_w=$(dwidth "$word")
        if [ -z "$CUR_LINE" ]; then
            CUR_LINE="$word"; CUR_W=$word_w
        elif [ $(( CUR_W + 1 + word_w )) -le $INNER_W ]; then
            CUR_LINE="$CUR_LINE $word"; CUR_W=$(( CUR_W + 1 + word_w ))
        else
            TEXT_LINES+=("$CUR_LINE")
            CUR_LINE="$word"; CUR_W=$word_w
        fi
    done
    [ -n "$CUR_LINE" ] && TEXT_LINES+=("$CUR_LINE")
fi

TEXT_COUNT=${#TEXT_LINES[@]}

# Build box as plain strings (no ANSI). Color applied at output time.
# Box display width = INNER_W + 4:  "| " + text(INNER_W) + " |"
BOX_W=$(( INNER_W + 4 ))
BUBBLE_LINES=()
BUBBLE_TYPES=()  # "border" or "text" — determines coloring
if [ $TEXT_COUNT -gt 0 ]; then
    # Top border
    BORDER=$(printf '%*s' "$(( BOX_W - 2 ))" '' | tr ' ' '-')
    BUBBLE_LINES+=(".${BORDER}.")
    BUBBLE_TYPES+=("border")
    # Text rows: "| text padded |"
    for tl in "${TEXT_LINES[@]}"; do
        tpad=$(( INNER_W - $(dwidth "$tl") ))
        [ "$tpad" -lt 0 ] && tpad=0
        padding=$(printf '%*s' "$tpad" '')
        BUBBLE_LINES+=("| ${tl}${padding} |")
        BUBBLE_TYPES+=("text")
    done
    # Bottom border
    BUBBLE_LINES+=("\`${BORDER}'")
    BUBBLE_TYPES+=("border")
fi

BUBBLE_COUNT=${#BUBBLE_LINES[@]}

# ─── Right-align with bubble box to the left ─────────────────────────────────
GAP=3
if [ $BUBBLE_COUNT -gt 0 ]; then
    TOTAL_W=$(( BOX_W + GAP + ART_W ))
else
    TOTAL_W=$ART_W
fi
# COLS already includes the Claude Code chrome reserve. The spacer starts with
# one Braille Blank cell, so account for that cell but don't subtract MARGIN
# again; doing so leaves the card visibly short of the pane's right edge.
PAD=$(( COLS - TOTAL_W - 1 ))
[ "$PAD" -lt 0 ] && PAD=0

# On Windows (Git Bash / MSYS2), Braille Blank (U+2800) renders as double-width,
# which doubles the spacer and pushes content off-screen. Use regular spaces instead.
case "$(uname -s)" in
    MINGW*|CYGWIN*|MSYS*) SPACER=$(printf '%*s' "$PAD" '') ;;
    *)                     SPACER=$(printf "${B}%${PAD}s" "") ;;
esac

# Minimal tier uses plain spaces so the one-line sprite + name fits without
# sacrificing a Braille Blank column on narrow terminals.
if [ "$TIER" = "minimal" ]; then
    PAD=$(( COLS - ART_W ))
    [ "$PAD" -lt 0 ] && PAD=0
    SPACER=$(printf '%*s' "$PAD" '')
fi

# Vertically center bubble box on the art
BUBBLE_START=0
if [ $BUBBLE_COUNT -gt 0 ] && [ $BUBBLE_COUNT -lt $ART_COUNT ]; then
    BUBBLE_START=$(( (ART_COUNT - BUBBLE_COUNT) / 2 ))
fi

# ─── Find the connector line (middle text line → points to buddy's mouth) ─────
# The connector goes on the middle text row of the bubble
CONNECTOR_BI=-1
if [ $BUBBLE_COUNT -gt 2 ]; then
    # text rows are indices 1..(BUBBLE_COUNT-2), pick the middle one
    FIRST_TEXT=1
    LAST_TEXT=$(( BUBBLE_COUNT - 2 ))
    CONNECTOR_BI=$(( (FIRST_TEXT + LAST_TEXT) / 2 ))
fi

# ─── Output: merged bubble box + art per line ──────────────────────────────────
TOTAL_BUBBLE=$(( BUBBLE_START + BUBBLE_COUNT ))
MAX_LINES=$(( ART_COUNT > TOTAL_BUBBLE ? ART_COUNT : TOTAL_BUBBLE ))
OUTPUT_LINES=()
for (( i=0; i<MAX_LINES; i++ )); do
    # Art part: actual art line or blank filler
    if [ $i -lt $ART_COUNT ]; then
        art_part="${ALL_COLORS[$i]}${ALL_LINES[$i]}${NC}"
    else
        art_part=$(printf '%*s' "$ART_W" '')
    fi

    if [ $BUBBLE_COUNT -gt 0 ]; then
        bi=$(( i - BUBBLE_START ))
        if [ $bi -ge 0 ] && [ $bi -lt $BUBBLE_COUNT ]; then
            bline="${BUBBLE_LINES[$bi]}"
            btype="${BUBBLE_TYPES[$bi]}"

            # Connector: "-- " on the middle text line, spaces otherwise.
            if [ $bi -eq $CONNECTOR_BI ]; then
                gap="${C}--${NC} "
            else
                gap="   "
            fi

            if [ "$btype" = "border" ]; then
                OUTPUT_LINES+=("${SPACER}${C}${bline}${NC}${gap}${art_part}")
            else
                pipe_l="${bline:0:1}"
                pipe_r="${bline: -1}"
                inner="${bline:1:$(( ${#bline} - 2 ))}"
                OUTPUT_LINES+=("${SPACER}${C}${pipe_l}${NC}${DIM}${inner}${NC}${C}${pipe_r}${NC}${gap}${art_part}")
            fi
        else
            empty=$(printf '%*s' "$BOX_W" '')
            # NC right after SPACER breaks up what would otherwise be one long
            # unbroken run of literal space characters (SPACER + empty box +
            # gap). Rows that DO have bubble content only ever have ~SPACER-
            # length of contiguous spaces before hitting a color escape code,
            # and render fine; rows using this placeholder branch had a much
            # longer uninterrupted space run and were observed shifting left
            # in VS Code's terminal specifically (not in this script's own
            # captured stdout) -- NC is a no-op escape, it just breaks the run.
            OUTPUT_LINES+=("${SPACER}${NC}${empty}   ${art_part}")
        fi
    else
        OUTPUT_LINES+=("${SPACER}${art_part}")
    fi
done

# Precompute width profiles for every rendered row in one batched subprocess
# pair instead of one pair per row inside ansi_truncate -- see the
# _utf8_codepoints note above for why per-call spawn cost matters here.
# Returns through the _STRIP_ANSI_OUT global rather than printf + command
# substitution -- called once per rendered row, and a subshell fork per row
# is exactly the per-call spawn cost this PR removes elsewhere.
_strip_ansi() {
    local text="$1"
    local out="" i=0 char
    local text_len=${#text}
    while [ "$i" -lt "$text_len" ]; do
        char="${text:$i:1}"
        if [ "$char" = $'\033' ]; then
            i=$(( i + 1 ))
            while [ "$i" -lt "$text_len" ]; do
                char="${text:$i:1}"
                i=$(( i + 1 ))
                [ "$char" = "m" ] && break
            done
            continue
        fi
        out="${out}${char}"
        i=$(( i + 1 ))
    done
    _STRIP_ANSI_OUT="$out"
}

_LINE_PLAIN=()
for line in "${OUTPUT_LINES[@]}"; do
    _strip_ansi "$line"
    _LINE_PLAIN+=("$_STRIP_ANSI_OUT")
done
_batch_dwidth_profiles_indexed "${_LINE_PLAIN[@]}"

ansi_truncate() {
    local text="$1"
    local max_width="$2"
    local widths_str="$3"
    local out=""
    local i=0
    local text_len=${#text}
    local char seq char_width truncated=0 saw_sgr=0
    local visible_width=0
    local -a widths=()
    local visible_index=0

    [ "$max_width" -lt 0 ] && max_width=0

    case "$text" in *$'\033'*) saw_sgr=1 ;; esac
    if [ -n "$widths_str" ]; then
        read -r -a widths <<< "$widths_str"
    elif [ -n "$text" ]; then
        # Callers outside this script's own render loop (e.g. substatus.sh's
        # append_substatus, which calls statusline_output_line with just one
        # argument) don't have a precomputed profile. Fall back to computing
        # it here instead of silently treating every character as width 1.
        _strip_ansi "$text"
        while IFS= read -r char_width; do
            widths+=("$char_width")
        done < <(dwidth_profile "$_STRIP_ANSI_OUT")
    fi

    while [ "$i" -lt "$text_len" ]; do
        char="${text:$i:1}"
        if [ "$char" = $'\033' ]; then
            seq="$char"
            i=$(( i + 1 ))
            while [ "$i" -lt "$text_len" ]; do
                char="${text:$i:1}"
                seq="${seq}${char}"
                i=$(( i + 1 ))
                [ "$char" = "m" ] && break
            done
            out="${out}${seq}"
            continue
        fi

        char_width="${widths[$visible_index]:-1}"
        if [ $(( visible_width + char_width )) -gt "$max_width" ]; then
            truncated=1
            break
        fi
        out="${out}${char}"
        visible_width=$(( visible_width + char_width ))
        visible_index=$(( visible_index + 1 ))
        i=$(( i + 1 ))
    done

    [ "$truncated" -eq 1 ] && [ "$saw_sgr" -eq 1 ] && out="${out}${NC}"
    printf '%s' "$out"
}

statusline_output_line() {
    # Erase the whole line before drawing it. Observed live in VS Code:
    # when a row's internal structure changes a lot between ticks (e.g. a
    # reaction bubble or, with combined-status.sh, rate-limit stats
    # appearing/disappearing) while its total visible width stays the same,
    # stale characters from the previous tick's differently-shaped line can
    # linger instead of being fully overwritten. \033[2K clears the entire
    # line regardless of cursor position, without moving the cursor, so the
    # new content always draws onto a blank line.
    printf '\033[2K'
    ansi_truncate "$1" "$STATUSLINE_BUDGET" "$2"
    printf '\n'
}

_output_line_count=${#OUTPUT_LINES[@]}
for (( _oi = 0; _oi < _output_line_count; _oi++ )); do
    statusline_output_line "${OUTPUT_LINES[$_oi]}" "${_LINE_WIDTHS[$_oi]}"
done

# Append the last cached sub-status result below the buddy panel and refresh
# it asynchronously when stale. The statusline itself never waits on it.
append_substatus

exit 0

#!/usr/bin/env bash
# statusline/combined-status.sh
# Two-panel status line: rate-limit stats left, buddy art right.
# buddy-status.sh renders the buddy panel and shared cached sub-status below it.

[ "$BUDDY_SHELL" = "1" ] && exit 0

SCRIPT_DIR="$(dirname "${BASH_SOURCE[0]}")"
BUDDY_SCRIPT="$SCRIPT_DIR/buddy-status.sh"

if ! command -v python3 >/dev/null 2>&1; then
    exec "$BUDDY_SCRIPT"
fi

# ── Capture stdin from Claude Code ──────────────────────────────────────────
STDIN_DATA=$(cat)

# ── Parse rate-limit fields ──────────────────────────────────────────────────
STATS_JSON=$(printf '%s\n' "$STDIN_DATA" | python3 -c "
import json, sys, datetime

def fmt_session_reset(ts):
    if not ts: return '--'
    diff = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc) - datetime.datetime.now(datetime.timezone.utc)
    mins = max(0, int(diff.total_seconds() / 60))
    h, m = mins // 60, mins % 60
    return f'{h}h{m:02d}m' if h else f'{m}m'

def fmt_weekly_reset(ts):
    if not ts: return '--'
    diff = datetime.datetime.fromtimestamp(ts, tz=datetime.timezone.utc) - datetime.datetime.now(datetime.timezone.utc)
    secs = max(0, int(diff.total_seconds()))
    d = secs // 86400
    h = (secs % 86400) // 3600
    m = (secs % 3600) // 60
    return f'{d}d{h:02d}h' if d else (f'{h}h{m:02d}m' if h else f'{m}m')

try:
    data = json.load(sys.stdin)
    rl = data.get('rate_limits', {})
    fh = rl.get('five_hour', {})
    sd = rl.get('seven_day', {})
    sess_pct = fh.get('used_percentage')
    week_pct = sd.get('used_percentage')
    print(json.dumps({
        'sess_pct': sess_pct,
        'sess_reset': fmt_session_reset(fh.get('resets_at')),
        'week_pct': week_pct,
        'week_reset': fmt_weekly_reset(sd.get('resets_at')),
        'has_data': sess_pct is not None or week_pct is not None,
    }))
except Exception:
    print('{}')
" 2>/dev/null)

# ── Capture buddy art (buddy reads state files, not stdin) ───────────────────
BUDDY_OUTPUT=$(printf '%s' "$STDIN_DATA" | "$BUDDY_SCRIPT" 2>/dev/null)

# No buddy output → exit silently (muted, no state, etc.)
[ -z "$BUDDY_OUTPUT" ] && exit 0

# No rate-limit data → pass buddy output through unchanged
HAS_DATA=$(python3 -c "
import json, sys
d = json.loads('''$STATS_JSON''' or '{}')
print(d.get('has_data', False))
" 2>/dev/null)

if [ "$HAS_DATA" != "True" ]; then
    printf '%s\n' "$BUDDY_OUTPUT"
    exit 0
fi

# ── Merge stat lines into buddy output ──────────────────────────────────────
printf '%s\n' "$BUDDY_OUTPUT" | STATS_JSON="$STATS_JSON" python3 -c "
import sys, json, os, re

BRAILLE = '\u2800'
GREEN   = '\033[32m'
YELLOW  = '\033[33m'
RED     = '\033[31m'
DIM     = '\033[2m'
NC      = '\033[0m'

def color_for(pct):
    if pct is None: return DIM
    if pct < 30:   return GREEN
    if pct < 70:   return YELLOW
    return RED

def build_bar(pct, width=10):
    if pct is None:
        return DIM + '░' * width + NC
    c = color_for(pct)
    filled = max(0, min(width, round(pct / 100 * width)))
    return c + '█' * filled + NC + DIM + '░' * (width - filled) + NC

def fmt_stat(label, pct, reset):
    c = color_for(pct)
    pct_str = f'{round(pct):3d}%' if pct is not None else '  -%'
    bar = build_bar(pct)
    bar_text = f'{DIM}{label}{NC} {c}{pct_str}{NC} {bar}'
    bar_width = 2 + 1 + 4 + 1 + 10
    timer_text = f'   {c}↻{reset}{NC}'
    timer_width = 3 + 1 + len(reset)
    return (bar_text, bar_width), (timer_text, timer_width)

try:
    stats = json.loads(os.environ.get('STATS_JSON', '{}'))
except Exception:
    stats = {}

lines = sys.stdin.read().splitlines()
n = len(lines)
center = 1 

sess = fmt_stat('5h', stats.get('sess_pct'), stats.get('sess_reset', '--'))
week = fmt_stat('7d', stats.get('week_pct'), stats.get('week_reset', '--'))
stat_items = [sess[0], sess[1], week[0], week[1]]

for i, line in enumerate(lines):
    si = i - center
    if 0 <= si < 4 and line.startswith(BRAILLE):
        stat_text, stat_width = stat_items[si]
        after_braille = line[1:]
        num_spaces = len(after_braille) - len(after_braille.lstrip(' '))
        if num_spaces >= stat_width:
            remaining = ' ' * (num_spaces - stat_width)
            rest = after_braille.lstrip(' ')
            print(BRAILLE + stat_text + remaining + rest)
        else:
            print(line)
    else:
        print(line)
"

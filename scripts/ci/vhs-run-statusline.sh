#!/usr/bin/env bash
# Invoked from VHS tapes. Args: <cols> <fixture-relpath-from-repo-root>
# BUDDY_STATUSLINE_ROWS defaults to 50 (full density) so golden renders are not
# sensitive to the VHS terminal's actual row count.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cols="${1:?cols}"
fixture_rel="${2:?fixture}"
payload='{"session_id":"ci","model":{"display_name":"CI"},"workspace":{"current_dir":"."}}'

if [[ "$fixture_rel" = /* ]]; then
  cfg_dir="$fixture_rel"
else
  cfg_dir="$ROOT/$fixture_rel"
fi

rows="${BUDDY_STATUSLINE_ROWS:-50}"

cd "$ROOT"
printf '%s' "$payload" \
  | COLUMNS="$cols" \
    BUDDY_FAKE_NOW=0 \
    BUDDY_STATUSLINE_ROWS="$rows" \
    CLAUDE_CONFIG_DIR="$cfg_dir" \
    CLAUDE_CODE_SESSION_ID= \
    TMUX_PANE= \
    BUDDY_SHELL= \
    bash statusline/buddy-status.sh

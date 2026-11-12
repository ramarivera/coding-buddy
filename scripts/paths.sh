#!/usr/bin/env bash
# Path resolvers for coding-buddy shell scripts.
#
# Must stay in sync with server/path.ts. Source this file early:
#   source "$(dirname "$0")/../scripts/paths.sh"
# …and consumers get BUDDY_STATE_DIR, CLAUDE_CFG_DIR, CLAUDE_SETTINGS_FILE,
# and CLAUDE_USER_CONFIG.
#
# Resolution rules (must match server/path.ts):
#   - If CLAUDE_CONFIG_DIR is set → everything lives under it
#     (settings.json, skills/, .claude.json inside the config dir, and
#      buddy state at $CLAUDE_CONFIG_DIR/buddy-state).
#   - Else (single-profile default) → $HOME/.claude, $HOME/.claude.json,
#     $HOME/.claude-buddy.

if [[ -n "${CLAUDE_CONFIG_DIR:-}" ]]; then
  CLAUDE_CFG_DIR="$CLAUDE_CONFIG_DIR"
else
  CLAUDE_CFG_DIR="$HOME/.claude"
fi

CLAUDE_SETTINGS_FILE="$CLAUDE_CFG_DIR/settings.json"

# .claude.json: inside CLAUDE_CONFIG_DIR when set, else $HOME. We never
# fall back to $HOME when CLAUDE_CONFIG_DIR is set — doing so would break
# profile isolation (enabling buddy in one profile could mutate the
# home-level file that a different profile reads).
if [[ -n "${CLAUDE_CONFIG_DIR:-}" ]]; then
  CLAUDE_USER_CONFIG="$CLAUDE_CONFIG_DIR/.claude.json"
else
  CLAUDE_USER_CONFIG="$HOME/.claude.json"
fi

if [[ -n "${CODING_BUDDY_USER_ID:-}" ]]; then
  BUDDY_STATE_DIR="${CODING_BUDDY_STATE_DIR:-$HOME/.coding-buddy/shared}"
elif [[ -n "${CLAUDE_CONFIG_DIR:-}" ]]; then
  BUDDY_STATE_DIR="$CLAUDE_CONFIG_DIR/buddy-state"
else
  BUDDY_STATE_DIR="$HOME/.claude-buddy"
fi

# Per-session ID for namespacing transient buddy state files
# (reaction.$SID.json, .last_reaction.$SID, etc.). Precedence:
#   1. $CLAUDE_CODE_SESSION_ID — Claude Code sets a UUID per session and
#      propagates it to every child process (hooks, MCP server, statusline).
#      Shortened to first 8 chars for filename hygiene.
#   2. $TMUX_PANE — legacy tmux-pane isolation, kept as a fallback.
#   3. "default" — single-session world.
if [[ -n "${CLAUDE_CODE_SESSION_ID:-}" ]]; then
  BUDDY_SID="${CLAUDE_CODE_SESSION_ID:0:8}"
elif [[ -n "${TMUX_PANE:-}" ]]; then
  BUDDY_SID="${TMUX_PANE#%}"
else
  BUDDY_SID="default"
fi

export CLAUDE_CFG_DIR CLAUDE_SETTINGS_FILE CLAUDE_USER_CONFIG BUDDY_STATE_DIR BUDDY_SID

# Windows: Chocolatey installs a PowerShell shim for jq that doesn't work in
# Git Bash. If jq is not found on PATH, check the real Chocolatey binary path
# and common Windows locations, then prepend to PATH so all scripts find it.
if ! command -v jq >/dev/null 2>&1; then
    for _jq_candidate in \
        "/c/ProgramData/chocolatey/lib/jq/tools/jq.exe" \
        "/c/tools/jq/jq.exe" \
        "$HOME/bin/jq.exe" \
        "/usr/local/bin/jq.exe"; do
        if [ -x "$_jq_candidate" ]; then
            export PATH="$(dirname "$_jq_candidate"):$PATH"
            break
        fi
    done
fi

#!/usr/bin/env bash
# coding-buddy MCP server launcher — preflight checks bun, then execs the server.
# Failing here with a clear stderr message is much easier to debug than a silent
# "MCP tools not available" from Claude Code.

set -eu

if ! command -v bun >/dev/null 2>&1; then
  cat >&2 <<'EOF'
[coding-buddy] ERROR: 'bun' was not found on PATH.

coding-buddy's MCP server runs on bun. Install it with:

  Linux / macOS:
    curl -fsSL https://bun.sh/install | bash

  Windows (PowerShell):
    powershell -c "irm bun.sh/install.ps1 | iex"

Then open a new shell (so PATH picks up bun) and restart Claude Code.
EOF
  exit 127
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec bun "$SCRIPT_DIR/index.ts"

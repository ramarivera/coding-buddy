#!/usr/bin/env bash
set +e
SCRIPT_DIR="${BASH_SOURCE[0]%/*}"
ROOT="$(cd "$SCRIPT_DIR/.." 2>/dev/null && pwd)" || exit 0
[ -n "$ROOT" ] || exit 0
BUN="$(command -v bun 2>/dev/null || true)"
[ -x "$BUN" ] || BUN="$HOME/.bun/bin/bun"
[ -x "$BUN" ] || BUN="/opt/homebrew/bin/bun"
[ -x "$BUN" ] || BUN="/usr/local/bin/bun"
[ -x "$BUN" ] || exit 0
exec "$BUN" run "$ROOT/server/hooks/react.ts" || exit 0

# Security Policy

## Scope

coding-buddy runs locally on your machine. It consists of:
- An MCP server (stdio, local only — no network listeners)
- Shell scripts for status line and hooks
- State files in `~/.claude-buddy/`

It does **not** make external network requests, collect telemetry, or transmit any data.

## Reporting a Vulnerability

If you find a security issue, please **do not** open a public GitHub issue.

Instead, email: **85120225+1270011@users.noreply.github.com**

I'll respond within 48 hours and work with you on a fix before any public disclosure.

## What to Report

- Shell injection risks in hooks or status line scripts
- File permission issues with state files
- Anything that could leak data from `~/.claude.json` or `~/.claude-buddy/`

## What's Not in Scope

- Claude Code's own security (report to Anthropic)
- Cosmetic issues (use a regular bug report)

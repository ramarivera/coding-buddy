---
name: buddy
description: "Show, pet, or manage your coding companion. Use when the user types /buddy or mentions their companion by name."
argument-hint: "[show|pet|stats|help|off|on|rename <name>|personality <text>|achievements|summon [slot]|save [slot]|list|dismiss <slot>|pick|frequency [seconds]|style [classic|round]|position [top|left]|rarity [on|off]|rainbow [#hex ...]|statusline [on|off]|uninstall]"
allowed-tools: mcp__claude_buddy__*, Bash
---

# Buddy — Your Coding Companion

Handle the user's `/buddy` command. Typed commands run through the LLM-free CLI
dispatcher (see **Routing** below); only `buddy_react`, `buddy_suggest` and the
`uninstall` sequence need the coding-buddy MCP tools.

## Fallback: MCP Tools Unavailable

**Before calling any MCP buddy tool, check whether `mcp__claude_buddy__*` tools are registered in this session.** If they are NOT — Claude Code was unable to start the coding-buddy MCP server — do not attempt to call any buddy tool. Typed commands in the **Routing** table still work through the dispatcher; the diagnostic below is for the MCP-only paths. The tool calls will fail with an unhelpful "tool not found" error. Instead, run this diagnostic and report the result to the user so they can fix the underlying cause:

1. Check bun availability:
   ```bash
   command -v bun && bun --version
   ```
   The MCP launcher (`server/mcp-launcher.sh`) requires `bun` on PATH. If this command prints nothing, bun is missing — tell the user to install it (`curl -fsSL https://bun.sh/install | bash`), open a new terminal so PATH picks it up, and restart Claude Code. That is almost always the fix.

2. If bun IS present, run the launcher directly to capture whatever error it emits. The launcher path depends on which marketplace installed the plugin; locate it first:
   ```bash
   find ~/.claude/plugins/cache -name mcp-launcher.sh -path '*coding-buddy*' 2>/dev/null
   ```
   Then execute the first result with stdin closed so it exits cleanly:
   ```bash
   <launcher-path> < /dev/null; echo "exit=$?"
   ```
   Common causes: missing `bun`, corrupted plugin cache (suggest `claude plugin uninstall coding-buddy@coding-buddy && claude plugin install coding-buddy@coding-buddy`), or a `bun`-level error loading `server/index.ts`.

3. If `$CLAUDE_CONFIG_DIR` is set in the environment, use that directory instead of `~/.claude` when searching for the launcher.

4. **Do not call MCP-only paths (`buddy_react`, `buddy_suggest`, `uninstall` / `buddy_uninstall`) in this session.** Typed commands from the Routing table can still run via the dispatcher. Tell the user: the MCP server is not running, here is what the diagnostic found, here is the recommended fix, and Claude Code must be restarted after the fix before the MCP-only paths will be available.

## Routing: run the LLM-free dispatcher

**Every typed `/buddy` command is a pure config/state operation — route it to the
CLI dispatcher, not an MCP tool.** The dispatcher (`cli/buddy.ts`) calls the
same shared handlers (`server/commands/`) the MCP tools use, so output, status
line, events, XP, achievements and first-run hatching are identical. It runs as
plain bun with no model round-trip. Resolve it from the plugin root so it
works from any project directory, and output its result verbatim (CRITICAL
OUTPUT RULES below still apply):

```bash
bun run "${CLAUDE_PLUGIN_ROOT}/cli/buddy.ts" <command> [args]
```

Argument mapping (pass args positionally after the command):

| Input                    | Dispatcher command                          |
| ------------------------ | ------------------------------------------- |
| _(empty)_ or `show`      | `buddy.ts show`                             |
| `help`                   | `buddy.ts help`                             |
| `pet`                    | `buddy.ts pet`                             |
| `stats`                  | `buddy.ts stats`                           |
| `off` / `on`             | `buddy.ts off` / `buddy.ts on`             |
| `mute` / `unmute`        | `buddy.ts mute` / `buddy.ts unmute`        |
| `rename <name>`          | `buddy.ts rename <name>`                   |
| `personality <text>`     | `buddy.ts personality <text>`             |
| `achievements`           | `buddy.ts achievements`                    |
| `xp`                     | `buddy.ts xp`                             |
| `upgrades [id]`          | `buddy.ts upgrades [id]`                   |
| `mood`                   | `buddy.ts mood`                           |
| `memory`                 | `buddy.ts memory` (flags: `--project <p>`, `--type <t>`, `--resolved`, `--unresolved`, `--resolve-bug <id>`) |
| `summon [slot]`          | `buddy.ts summon [slot]`                   |
| `save [slot]`            | `buddy.ts save [slot]`                     |
| `list`                   | `buddy.ts list`                           |
| `dismiss <slot>`         | `buddy.ts dismiss <slot>`                 |
| `frequency [seconds]`    | `buddy.ts frequency [seconds]`            |
| `style [classic/round]` | `buddy.ts style [classic/round]`         |
| `position [top/left]`   | `buddy.ts position [top/left]`           |
| `rarity [on/off]`       | `buddy.ts rarity [on/off]`               |
| `width <10-60>`          | `buddy.ts width <n>`                       |
| `margin <0-20>`          | `buddy.ts margin <n>`                      |
| `rainbow [#hex.../reset]`| `buddy.ts rainbow [#hex.../reset]`       |
| `statusline [on/off/combined/basic]` | `buddy.ts statusline [on/off/combined/basic]` |
| `theme [dark/light/auto]` | `buddy.ts theme [dark/light/auto]`   |
| `pick`                   | Tell user to run `! bun run "${CLAUDE_PLUGIN_ROOT}/cli/pick.ts"` (interactive TUI) |
| `uninstall`              | Run the uninstall sequence (see **Uninstall Orchestration** below) |

Only two things still use the model, and neither is a typed command:
- **Name mention** — if the user says the buddy's name in normal conversation,
  call `buddy_react` (reason `turn`) and display it verbatim. This reads the
  conversation, so it stays an MCP tool.
- **Proactive suggestions** — `buddy_suggest` on a teachable moment, and the
  end-of-turn `<!-- buddy: -->` comment. These read your code/turn.

If the MCP server is unavailable (see fallback above) the dispatcher still works
— it does not depend on the MCP server, only on `bun`.

## CRITICAL OUTPUT RULES

The MCP tools return pre-formatted ASCII art with ANSI colors, box-drawing characters, stat bars, and species art. This is the companion's visual identity.

**You MUST output the tool result text EXACTLY as returned — character for character, line for line.** Do NOT:

- Summarize or paraphrase the ASCII art
- Describe what the companion looks like in prose
- Add commentary before or after the card
- Reformat, rephrase, or interpret the output
- Strip ANSI escape codes

**Just output the raw text content from the tool result. Nothing else.** The ASCII art IS the response.

If the user mentions the buddy's name in normal conversation, call `buddy_react` with reason "turn". Do NOT echo or quote the tool result — the reaction reaches the user only via the statusline speech bubble.

## Uninstall Orchestration

When the user invokes `/buddy uninstall`, run this sequence **in order** — do not skip steps, do not ask for confirmation between steps:

1. Call the MCP tool `buddy_uninstall`. Display its output verbatim.
2. Run via Bash tool: `claude plugin uninstall coding-buddy@coding-buddy`
3. Run via Bash tool: `claude plugin marketplace remove coding-buddy`
4. Run via Bash tool: `rm -rf ~/.claude/plugins/cache/coding-buddy`
5. Tell the user: uninstall is complete; companion data is kept at `~/.claude-buddy/`; restart Claude Code to release the plugin.

If any Bash step fails (non-zero exit), report the error but continue with the remaining steps — each step is independent and always-safe to run.

Do not call `buddy_uninstall` for any other command than `/buddy uninstall`. Never call it proactively.

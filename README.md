<div align="center">

<!-- ============================================================ -->
<!-- LOGO / HERO                                                  -->
<!-- Later replace with: docs/logo.png                            -->
<!-- ============================================================ -->
<img src="https://placehold.co/120x120/6366f1/ffffff?text=%F0%9F%A6%89" alt="coding-buddy logo" width="120" />

# Coding Buddy
### Your persistent coding companion — for Claude Code, Pi, and Oh My Pi. Survives every update.

<!-- ============================================================ -->
<!-- BADGES                                                        -->
<!-- ============================================================ -->

[![Version](https://img.shields.io/github/v/release/ramarivera/coding-buddy?style=flat-square&color=6366f1)](https://github.com/ramarivera/coding-buddy/releases)
[![License](https://img.shields.io/github/license/ramarivera/coding-buddy?style=flat-square&color=10b981)](LICENSE)
[![Stars](https://img.shields.io/github/stars/ramarivera/coding-buddy?style=flat-square&color=f59e0b)](https://github.com/ramarivera/coding-buddy/stargazers)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-v2.1.80%2B-8b5cf6?style=flat-square)](https://claude.ai/code)
[![Platform](https://img.shields.io/badge/platform-linux%20%7C%20macOS-blue?style=flat-square)](#requirements)
[![MCP](https://img.shields.io/badge/powered%20by-MCP-ec4899?style=flat-square)](https://modelcontextprotocol.io)

<!-- ============================================================ -->
<!-- HERO GIF — the most important asset                          -->
<!-- ============================================================ -->

<br>

<img src="docs/hero.gif" alt="coding-buddy in action" width="800" />

<br><br>

> **Anthropic removed `/buddy` in Claude Code v2.1.97.** This brings it back — *forever*. Same species, same stats, same personality. Now powered by MCP, so no update can ever take it away again.

<br>

<!-- ============================================================ -->
<!-- FEATURE HIGHLIGHTS — 4-column grid, no borders               -->
<!-- ============================================================ -->

<table>
<tr>
<td align="center" width="25%">
<h3>🛡️</h3>
<b>Survives Updates</b><br>
<sub>MCP-based, not binary-patched. Your buddy lives through every Claude Code release.</sub>
</td>
<td align="center" width="25%">
<h3>🎨</h3>
<b>19 Species</b><br>
<sub>From ducks to dragons — each with animated ASCII art and rarity colors.</sub>
</td>
<td align="center" width="25%">
<h3>💬</h3>
<b>Speech Bubbles</b><br>
<sub>End-of-turn reactions come from the model by default (MCP tool call). When that doesn't fire — older Claude Code, no MCP, a turn where the model didn't react — a Stop hook falls back to a tagged canned pool line so the bubble is never silent.</sub>
</td>
<td align="center" width="25%">
<h3>⚡</h3>
<b>One-Command Install</b><br>
<sub>Zero config. Works on any Claude Code v2.1.80+. Uninstall anytime.</sub>
</td>
</tr>
</table>

<br>

</div>

<!-- ============================================================ -->
<!-- QUICK START                                                  -->
<!-- ============================================================ -->

<!-- ============================================================ -->
<!-- CONTINUITY / MIGRATION                                      -->
<!-- ============================================================ -->

## 📦 Continuity / Migration

The `claude-buddy` package ended at **v0.5.2**.  
**`@ramarivera/coding-buddy` begins at v0.6.0** and is its continuation.

- Your existing buddy identity, menagerie, stats, and unlocks remain fully compatible.
- Legacy state and config identifiers (for example `~/.claude-buddy/`, `mcpServers["claude-buddy"]`) are intentionally preserved so current installs keep working without reconfiguration.

<!-- ============================================================ -->
## 📋 Requirements

- **[bun](https://bun.sh/install)** on `PATH` — the MCP server and extension runtime require Bun. Install once: `curl -fsSL https://bun.sh/install | bash`
- **Linux or macOS** (Windows is experimental)

| Host | Minimum version | Identity source |
|---|---|---|
| **Claude Code** | v2.1.80+ | `accountUuid` from `~/.claude.json` |
| **Pi** | `mariozechner/pi-coding-agent` workspace | Stable random UUID persisted in `~/.pi/agent/buddy/identity.json` |
| **Oh My Pi (OMP)** | OMP harness with `omp.extensions` support | Stable random UUID persisted in `~/.omp/agent/buddy/identity.json` |

All three surfaces use the same hero composition: the dashed speech bubble is on the left, its `--` tail points toward the rarity-colored sprite on the right, and the companion name is centered underneath the sprite. The card recomputes against the current terminal width on every render.

## 🚀 Quick Start

### Claude Code

```bash
npx -y @ramarivera/coding-buddy
```

This installs the MCP server, skill, hooks, and status line. Claude Code hooks are registered as thin bash wrappers with 15s timeouts; the wrappers locate Bun in bare hook environments and delegate behavior to TypeScript or the phase-2 legacy bash bridge. Restart Claude Code and type `/buddy`.

### Pi

```bash
pi install npm:@ramarivera/coding-buddy
```

Pi registers the package's native extension and stores companion state under `~/.pi/agent/buddy`.

### Oh My Pi

```bash
omp plugin install @ramarivera/coding-buddy
```

OMP registers the package's native extension and stores companion state under `~/.omp/agent/buddy`.

### From source

```bash
git clone https://github.com/ramarivera/coding-buddy coding-buddy
cd coding-buddy
bun install
bun run install-buddy
```

<sub>💡 Want a global `coding-buddy` command? → `bun link`</sub>
<br>
<sub>💡 Need help? → `bun run help`, `npx -y @ramarivera/coding-buddy help`, or `coding-buddy help` (if linked) · `/buddy help` in Claude Code</sub>




### Multiple Claude profiles?

If you run Claude Code with `CLAUDE_CONFIG_DIR` set (e.g. separate work and personal accounts), pass the same env var to install so buddy lands in the active profile and gets its own menagerie:

```bash
CLAUDE_CONFIG_DIR=~/.claude-personal npx -y @ramarivera/coding-buddy install
CLAUDE_CONFIG_DIR=~/.claude-personal npx -y @ramarivera/coding-buddy uninstall
```

The installer prints `Target profile: <path>` at the top so you can see at a glance which profile you're targeting. Each profile gets its own MCP entry, skill, hooks, status line, and `$CLAUDE_CONFIG_DIR/buddy-state/` menagerie — installs in one profile don't touch another. With `CLAUDE_CONFIG_DIR` unset, behaviour is identical to single-profile (`~/.claude/`, `~/.claude-buddy/`).

### One companion across harnesses

To opt into one identity and one menagerie across Claude Code, Pi, and OMP, set the same variable before launching each harness:

```bash
export CODING_BUDDY_USER_ID="ramiro"
```

This opt-in uses `~/.coding-buddy/shared` for the companion, XP, achievements, and reaction state. Set `CODING_BUDDY_STATE_DIR` when you need a different shared root. Sharing the state directory is intentional: it makes the companion actually follow you, at the cost of giving up separate per-harness progress. Without `CODING_BUDDY_USER_ID`, the existing Claude account identity and Pi/OMP per-harness `identity.json` behavior remain unchanged.

<br>

---

<!-- ============================================================ -->
<!-- COLLAPSIBLE SECTIONS START HERE                              -->
<!-- ============================================================ -->

<details>
<summary><b>🐙 &nbsp; Meet the 19 Species</b></summary>

<br>

Every buddy is uniquely generated — same species, same stats, same personality every time. On **Claude Code** the seed is derived from your `accountUuid` in `~/.claude.json`; on **Pi** and **Oh My Pi** a stable random UUID is generated once and persisted in `~/.pi/agent/buddy/identity.json` or `~/.omp/agent/buddy/identity.json` (unless `CODING_BUDDY_USER_ID` is set). 19 species, each with 3 idle animation frames + a blink.

<!-- Later replace with: docs/species-grid.png -->
<p align="center">
<img src="https://placehold.co/800x500/1e1e2e/cdd6f4?text=%F0%9F%90%99+SPECIES+GRID+IMAGE+%F0%9F%90%99%0A%2818+species+in+a+visual+grid%29" alt="all 18 species" width="800" />
</p>

```
 duck        goose       blob        cat         dragon      octopus
   __         (°>        .----.       /\_/\      /^\  /^\     .----.
 <(° )___      ||       ( °  ° )    ( °   °)   <  °  °  >   ( °  ° )
  (  ._>     _(__)_     (      )    (  ω  )    (   ~~   )   (______)
   `--'       ^^^^       `----'     (")_(")     `-vvvv-'    /\/\/\/\

 owl         penguin     turtle      snail       ghost       axolotl
  /\  /\      .---.       _,--._    °    .--.    .----.    }~(______)~{
 ((°)(°))    (°>°)       ( °  ° )    \  ( @ )   / °  ° \  }~(° .. °)~{
 (  ><  )   /(   )\      [______]     \_`--'    |      |    ( .--. )
  `----'     `---'       ``    ``    ~~~~~~~    ~`~``~`~     (_/  \_)

 capybara    cactus      robot       rabbit      mushroom    chonk
 n______n   n  ____  n    .[||].      (\__/)    .-o-OO-o-.  /\    /\
( °    ° )  | |°  °| |   [ °  ° ]    ( °  ° )  (__________)( °    ° )
(   oo   )  |_|    |_|   [ ==== ]   =(  ..  )=    |°  °|   (   ..   )
 `------'     |    |      `------'   (")__(")      |____|    `------'
```

### Rarities

| Rarity | Chance | Stars | Color |
|:---|:---:|:---:|:---|
| Common | 60% | ★ | Gray |
| Uncommon | 25% | ★★ | Green |
| Rare | 10% | ★★★ | Blue |
| Epic | 4% | ★★★★ | Purple |
| Legendary | 1% | ★★★★★ | Gold |

Colors use **24-bit true color** matching Claude Code's dark theme exactly.

### Stats

Every buddy has **5 core stats**: `DEBUGGING` · `PATIENCE` · `CHAOS` · `WISDOM` · `SNARK`

High SNARK buddies are sarcastic. High WISDOM ones are insightful. High CHAOS ones are unpredictable. Each buddy has a peak stat and a dump stat.

</details>

---

<details>
<summary><b>🏗️ &nbsp; How It Works</b></summary>

<br>

Five integration points, zero binary dependencies. When Claude Code, Pi, or Oh My Pi updates, your buddy stays.

```
┌────────────── Claude Code (any version) ──────────────┐
│                                                        │
│   MCP Server    Skill       Status Line    Hooks       │
│  (buddy tools) (/buddy)    (animated art) (comments)   │
└───────────────────────┬────────────────────────────────┘
                        │ stable extension points
             ┌──────────┴──────────┐
             │    coding-buddy     │
             │                     │
             │  wyhash + mulberry32│
             │  18 species, 3 anim │
             │  rarity colors      │
             │  speech bubbles     │
             │  ~/.claude-buddy/   │
             └─────────────────────┘
```

- **MCP Server** — companion tools + system prompt that tells Claude to call `buddy_react` at the end of every turn. The tool call writes the reaction with `source: "tool"` — model-authored, renders nowhere in the transcript.
- **Skill** — routes `/buddy`, `/buddy pet`, `/buddy stats`, `/buddy off`, `/buddy rename`
- **Status Line** — animated ASCII art, right-aligned, with rarity color and speech bubble
- **PostToolUse Hook** — detects errors, test failures, large diffs in Bash output
- **Stop Hook** — backward-compat fallback chain. Skips if a fresh `buddy_react` (primary channel) just ran; otherwise extracts a legacy `<!-- buddy: ... -->` comment if Claude happens to emit one (older Claude Code builds), and otherwise picks a canned pool line via `server/turn-reaction.ts`. Every write carries a `source` tag (`tool`/`comment`/`fallback`) so `/buddy stats` can prove what produced the bubble.

### Why MCP Instead of Binary Patching?

| Approach | Survives Updates | Animated | Comments | Risk |
|---|:---:|:---:|:---:|---|
| Binary patching | ❌ | ❌ | ❌ | Breaks on update |
| Pin old version | ❌ | ✅ | ✅ | No security fixes |
| **coding-buddy** | **✅** | **✅** | **✅** | **None** |

MCP is an industry-standard protocol. Skills are Markdown files. Hooks and status line are shell scripts. Nothing depends on Claude Code's binary internals.

### Repository Layout

```
coding-buddy/
├── server/          # MCP server — tools, engine, art, reactions, state
├── skills/buddy/    # /buddy slash command
├── hooks/           # Thin Claude Code hook wrappers and phase-2 legacy bash hooks
├── server/hooks/    # Hook behavior implemented in TypeScript
├── statusline/      # Animated right-aligned buddy display
└── cli/             # install, show, hunt, verify, doctor, backup, uninstall
```

</details>

---

<details>
<summary><b>🛠️ &nbsp; Commands Reference</b></summary>

<br>

### In Claude Code

| Command | Description |
|---|---|
| `/buddy` | Show companion card with ASCII art and stats |
| `/buddy pet` | Pet your companion |
| `/buddy stats` | Stats-only card |
| `/buddy off` / `on` | Mute / unmute reactions |
| `/buddy rename <name>` | Rename (1–14 chars) |
| `/buddy personality <text>` | Set custom personality |
| `/buddy summon [slot]` | Summon a saved buddy (omit slot for random) |
| `/buddy save [slot]` | Save current buddy to a named slot |
| `/buddy list` | List all saved buddies |
| `/buddy dismiss <slot>` | Remove a saved buddy slot |
| `/buddy pick` | Launch interactive TUI picker (`! npx -y @ramarivera/coding-buddy pick`) |
| `/buddy frequency [seconds]` | Show or set comment cooldown |
| `/buddy style [classic\|round]` | Bubble border style (tmux only) |
| `/buddy position [top\|left]` | Bubble position (tmux only) |
| `/buddy rarity [on\|off]` | Show or hide stars + rarity line (tmux only) |
| `/buddy width [10-60]` | Set bubble text width in chars (tmux only) |
| `/buddy margin [0-20]` | Set right-side margin (tmux only) |
| `/buddy statusline [on\|off]` | Enable or disable buddy in the status line |
| `/buddy statusline combined` | Show rate-limit usage bars alongside buddy (needs python3) |
| `/buddy statusline basic` | Switch back to buddy-only status line |
| `/buddy help` | Show all buddy commands |

### CLI
You can run any command with `npx -y @ramarivera/coding-buddy <command>` from anywhere, or `bun run <script>` from a local clone.


| Command | Description |
|---|---|
| `bun run install-buddy` | Automated setup |
| `bun run upgrade` | Pull latest version and reinstall integrations |
| `bun run show` | Show buddy in terminal |
| `bun run pick` | Interactive TUI to find and save your dream buddy |
| `bun run hunt` | Legacy search (use `pick` instead) |
| `bun run doctor` | Full diagnostic report |
| `bun run verify` | Verify buddy generation matches expected output |
| `bun run backup` | Snapshot / restore state |
| `bun run settings` | View / change buddy settings — cooldown, TTL (TUI coming soon) |
| `bun run disable` | Temporarily deactivate buddy |
| `bun run enable` | Re-enable buddy |
| `bun run help` | Full CLI reference |

| `bun run uninstall` | Clean removal |

### Statusline width and reaction lifetime

The statusline reserves 14 columns for Claude Code's content-box chrome before laying out the buddy (two columns for `padding: 1` and twelve for internal margins, calibrated against the reported ~74-column content box). If your harness uses different padding or margins, set the signed `statuslineWidthAdjust` value in `buddy-state/config.json` (for example, `-4` makes the usable width four columns narrower; `+4` widens it). Width is resolved in this order: `BUDDY_STATUSLINE_COLS`, exported `COLUMNS`, Linux `/proc` PTY, macOS `ps` + `stty`, PowerShell, then a final default of `125`; `statuslineWidthAdjust` is applied to the detected width. Both environment overrides must be positive integers to take effect. The width regression fixture renders at 60, 80, and 120 columns and asserts that every ANSI-stripped row fits the resulting budget. `reactionTTL` defaults to 900 seconds (15 minutes); set it to `0` only to keep reactions permanently. Expired per-session reaction and comment-throttle files are removed automatically, so stale bubbles don't accumulate. The final ANSI safety pass does one Unicode-width profile per row rather than spawning subprocesses per character.

<sub>💡 Want a global `coding-buddy` command? → `cd coding-buddy && bun link`</sub>

### 🎯 Buddy Pick

Want a specific species, rarity, or stat distribution?

```bash
npx -y @ramarivera/coding-buddy pick
```

Interactive TUI with saved buddies, criteria search, vim keys, and two-pane preview. Uses the exact same `wyhash + mulberry32` algorithm as Claude Code.

</details>

---

<details>
<summary><b>🔍 &nbsp; Diagnostic Tools</b></summary>

<br>

coding-buddy ships with built-in diagnostics for debugging across terminals and platforms.

### `bun run doctor`
Complete diagnostic — environment, terminal info, state, settings, padding test, live status line output. **Always run this first when filing a bug report.**

### `bun run test-statusline`
Temporarily replaces your status line with a multi-line diagnostic. Shows padding strategies side-by-side, color support, Unicode handling.

```bash
bun run test-statusline          # install test
# restart Claude Code, screenshot
bun run test-statusline restore  # restore buddy
```

### `bun run backup`
Snapshot all coding-buddy state to a timestamped backup. Use before experiments.

```bash
bun run backup              # create snapshot
bun run backup list         # list snapshots
bun run backup restore      # restore latest
bun run backup restore <ts> # restore specific
```

</details>

---

<details>
<summary><b>🐛 &nbsp; Troubleshooting</b></summary>

<br>

### Buddy not appearing in status line

1. Run `bun run doctor` — does the script work directly?
2. Restart Claude Code completely — `instructions` are loaded once at session start
3. Check `~/.claude/settings.json` has the `statusLine` block
4. Make sure `bun` and `jq` are in `$PATH`

### Buddy comments not showing

The buddy comment mechanism uses an MCP server `instructions` field that Claude only reads at **session start**. If you installed coding-buddy in an existing session, restart Claude Code.

```bash
jq '.mcpServers["claude-buddy"]' ~/.claude.json
```

### Buddy art looks broken or misaligned

Known MVP issue on some terminal/platform combos — different terminals render Braille Pattern Blank (U+2800) at different widths.

To help us fix it:
1. Run `bun run doctor` and paste output in a [new issue](https://github.com/ramarivera/coding-buddy/issues/new)
2. Run `bun run test-statusline` and screenshot the result
3. Then `bun run test-statusline restore`

### Recovery from a broken state

```bash
bun run backup restore      # restore latest backup
bun run uninstall           # full clean removal
```

</details>

---

<details>
<summary><b>📋 &nbsp; Requirements</b></summary>

<br>

| Requirement | Install |
|---|---|
| **[Bun](https://bun.sh)** | `curl -fsSL https://bun.sh/install \| bash` |
| **Claude Code** v2.1.80+ | Any version with MCP support |
| **jq** | `apt install jq` / `brew install jq` / [`windows: download and add 'jq.exe' from jqlang/jq to path`](https://github.com/jqlang/jq/releases/latest)|

> **Will I get the same buddy I had?** Yes. coding-buddy uses the exact same algorithm as the original (`wyhash + mulberry32`, same salt, same identity resolution). For Claude Code, if your `~/.claude.json` still has your `accountUuid`, you'll get the identical species, rarity, stats, and cosmetics. For Pi/OMP, keep `~/.pi/agent/buddy/identity.json` or `~/.omp/agent/buddy/identity.json`; the same stable UUID produces the same buddy. Resetting (deleting) that identity file generates a new random UUID and changes your buddy.

</details>

<br>

---

## 🗺️ Roadmap

- [x] **Multi-buddy support** — menagerie system with named slots, interactive TUI picker 💜[@doctor-ew](https://github.com/doctor-ew)💜
- [ ] **Leveling system** — XP from coding sessions, unlockable reactions and upgrades
- [ ] **Buddy pair-programming** — active help during sessions, pattern detection
- [ ] **Cross-session memory** — remembers past projects and earlier conversations
- [ ] **Mood system** — shifts based on code quality, tests, time of day
- [x] **Achievement badges** — "1000 lines reviewed", "week streak", etc. 💜[ndcorder](https://github.com/ndcorder)💜
- [ ] **Light theme colors** — auto-detect and match light theme RGB
- [x] **New species + community art** — wyvern added 💜[@jpmalone0](https://github.com/jpmalone0)💜 (community contributions welcome)
- [ ] **`npx -y @ramarivera/coding-buddy <command>`** — one-command usage without cloning

<br>

---

## 💜 Contributors

Thank you to everyone who helped bring buddies back to life.

<a href="https://github.com/ramarivera/coding-buddy/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=ramarivera/coding-buddy" alt="Contributors" />
</a>

<sub>Automatically generated from the [contributors graph](https://github.com/ramarivera/coding-buddy/graphs/contributors) via [contrib.rocks](https://contrib.rocks).</sub>

<br>

Want to help? New species, better reactions, bugfixes, wild new features — [PRs welcome](https://github.com/ramarivera/coding-buddy/pulls).

<br>

---

## 🙏 Credits

- Original buddy concept by **Anthropic** (Claude Code v2.1.89 — v2.1.94)
- Inspired by [any-buddy](https://github.com/cpaczek/any-buddy), [buddy-reroll](https://github.com/grayashh/buddy-reroll), [ccbuddyy](https://github.com/vibenalytics/ccbuddyy)
- Built with the [Model Context Protocol](https://modelcontextprotocol.io)

<br>

---

<div align="center">

### 📜 License

MIT — do whatever you want, just don't take my buddy away again.

<br>

<sub><b>Keywords:</b> claude code buddy · claude code companion · claude code pet · terminal pet · coding companion · tamagotchi · MCP companion · /buddy command · claude buddy removed · bring back buddy · ASCII art pet</sub>

</div>

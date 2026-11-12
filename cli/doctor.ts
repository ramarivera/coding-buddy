#!/usr/bin/env bun
/**
 * coding-buddy doctor — comprehensive diagnostic report
 *
 * Run: bun run doctor
 *
 * Outputs a complete environment report for bug reports.
 * Copy the entire output and paste it in a GitHub issue.
 */

import { readFileSync, existsSync, statSync } from "fs";
import { execSync } from "child_process";
import { join, resolve, dirname } from "path";
import {
  buddyStateDir,
  claudeConfigDir,
  claudeSettingsPath,
  claudeSkillDir,
  claudeUserConfigPath,
} from "../server/path.ts";

const PROJECT_ROOT = resolve(dirname(import.meta.dir));
const CLAUDE_DIR = claudeConfigDir();
const CLAUDE_JSON = claudeUserConfigPath();
const STATE_DIR = buddyStateDir();
const SETTINGS = claudeSettingsPath();
const SKILL_DIR = claudeSkillDir("buddy");
const STATUS_SCRIPT = join(PROJECT_ROOT, "statusline", "buddy-status.sh");

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const NC = "\x1b[0m";

function section(title: string) {
  console.log(`\n${CYAN}${BOLD}━━━ ${title} ${"━".repeat(Math.max(0, 60 - title.length))}${NC}`);
}

function row(label: string, value: string) {
  console.log(`  ${DIM}${label.padEnd(28)}${NC} ${value}`);
}

function ok(msg: string) { console.log(`  ${GREEN}✓${NC} ${msg}`); }
function warn(msg: string) { console.log(`  ${YELLOW}⚠${NC} ${msg}`); }
function err(msg: string) { console.log(`  ${RED}✗${NC} ${msg}`); }

function tryExec(cmd: string, fallback = "(failed)"): string {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return fallback;
  }
}

function tryRead(path: string): string | null {
  try { return readFileSync(path, "utf8"); } catch { return null; }
}

function tryParseJson(text: string | null): any | null {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

// ─── Header ─────────────────────────────────────────────────────────────────

console.log(`${CYAN}${BOLD}
╔══════════════════════════════════════════════════════════╗
║  coding-buddy doctor — diagnostic report                 ║
╚══════════════════════════════════════════════════════════╝${NC}`);

console.log(`\n${DIM}Copy this entire output into your GitHub issue.${NC}`);

// ─── Environment ────────────────────────────────────────────────────────────

section("Environment");
row("OS", tryExec("uname -srm"));
row("Hostname", tryExec("uname -n"));
row("User shell", process.env.SHELL ?? "(unset)");
row("Bash version", tryExec("bash --version | head -1"));
row("Bun version", tryExec("bun --version"));
row("Node version", tryExec("node --version", "(not installed)"));
row("jq version", tryExec("jq --version", "(not installed)"));
row("Claude Code version", tryExec("claude --version", "(not in PATH)"));

// ─── Terminal ───────────────────────────────────────────────────────────────

section("Terminal");
row("TERM", process.env.TERM ?? "(unset)");
row("COLORTERM", process.env.COLORTERM ?? "(unset)");
row("TERM_PROGRAM", process.env.TERM_PROGRAM ?? "(unset)");
row("LANG", process.env.LANG ?? "(unset)");
row("COLUMNS env var", process.env.COLUMNS ?? "(unset in subprocess)");
row("stty size", tryExec("stty size 2>/dev/null", "(no tty)"));
row("tput cols", tryExec("tput cols 2>/dev/null", "(failed)"));

// ─── Filesystem checks ──────────────────────────────────────────────────────

section("Filesystem");
const procExists = existsSync("/proc");
row("/proc exists", procExists ? `${GREEN}yes${NC} (Linux)` : `${RED}no${NC} (macOS/BSD)`);
row("CLAUDE_CONFIG_DIR", process.env.CLAUDE_CONFIG_DIR ?? "(unset)");
row(`${CLAUDE_DIR} exists`, existsSync(CLAUDE_DIR) ? "yes" : "no");
row(`${CLAUDE_JSON} exists`, existsSync(CLAUDE_JSON) ? "yes" : "no");
row(`${STATE_DIR} exists`, existsSync(STATE_DIR) ? "yes" : "no");
row("Project root", PROJECT_ROOT);
row("Status script exists", existsSync(STATUS_SCRIPT) ? "yes" : `${RED}no${NC}`);

// ─── coding-buddy state ─────────────────────────────────────────────────────

section("coding-buddy state");
const menagerie = tryParseJson(tryRead(join(STATE_DIR, "menagerie.json")));
const status = tryParseJson(tryRead(join(STATE_DIR, "status.json")));

if (menagerie) {
  const activeSlot = menagerie.active ?? "buddy";
  const companion = menagerie.companions?.[activeSlot];
  row("Active slot", activeSlot);
  row("Total slots", String(Object.keys(menagerie.companions ?? {}).length));
  if (companion) {
    row("Companion name", companion.name ?? "(none)");
    row("Species", companion.bones?.species ?? "(none)");
    row("Rarity", companion.bones?.rarity ?? "(none)");
    row("Hat", companion.bones?.hat ?? "(none)");
    row("Eye", companion.bones?.eye ?? "(none)");
    row("Shiny", String(companion.bones?.shiny ?? false));
  } else {
    err(`No companion found in active slot "${activeSlot}"`);
  }
} else {
  err(`No manifest found at ${join(STATE_DIR, "menagerie.json")}`);
}

if (status) {
  row("Status muted", String(status.muted ?? false));
  row("Current reaction", status.reaction || "(none)");
} else {
  warn(`No status state at ${join(STATE_DIR, "status.json")}`);
}

// ─── settings.json ──────────────────────────────────────────────────────────

section("Claude Code config");
const settings = tryParseJson(tryRead(SETTINGS));
const claudeJson = tryParseJson(tryRead(CLAUDE_JSON));

if (settings?.statusLine) {
  console.log(`  ${DIM}statusLine:${NC}`);
  console.log(`    ${JSON.stringify(settings.statusLine, null, 2).split("\n").join("\n    ")}`);
} else {
  warn(`No statusLine in ${SETTINGS}`);
}

if (settings?.hooks) {
  console.log(`  ${DIM}hooks:${NC}`);
  for (const event of Object.keys(settings.hooks)) {
    const count = settings.hooks[event]?.length ?? 0;
    row(`  ${event}`, `${count} entr${count === 1 ? "y" : "ies"}`);
  }
} else {
  warn("No hooks configured");
}

if (claudeJson?.mcpServers?.["claude-buddy"]) {
  ok(`MCP server registered in ${CLAUDE_JSON}`);
  console.log(`    ${JSON.stringify(claudeJson.mcpServers["claude-buddy"], null, 2).split("\n").join("\n    ")}`);
} else {
  err(`MCP server NOT registered in ${CLAUDE_JSON}`);
}

const skillPath = join(SKILL_DIR, "SKILL.md");
if (existsSync(skillPath)) {
  ok(`Skill installed: ${skillPath}`);
} else {
  err(`Skill missing: ${skillPath}`);
}

// ─── Live status line test ──────────────────────────────────────────────────

section("Live status line output");
console.log(`  ${DIM}(running: echo '{}' | ${STATUS_SCRIPT})${NC}\n`);
const liveOutput = tryExec(`echo '{}' | bash "${STATUS_SCRIPT}" 2>&1`, "(script failed)");
const lines = liveOutput.split("\n");
console.log(lines.map(l => `  │ ${l}`).join("\n"));
console.log(`  ${DIM}(${lines.length} lines, total ${liveOutput.length} bytes)${NC}`);

// ─── Padding strategy test ──────────────────────────────────────────────────

section("Padding strategy test");
console.log(`  ${DIM}Each row should appear right-aligned with marker '|END'.${NC}`);
console.log(`  ${DIM}If a row is misaligned, that strategy is broken in this terminal.${NC}\n`);

const PAD = 40;
const strategies: [string, string][] = [
  ["space (will be trimmed!)", " "],
  ["braille blank U+2800", "\u2800"],
  ["non-breaking space U+00A0", "\u00A0"],
  ["dot .", "."],
  ["middle dot ·", "\u00B7"],
];

for (const [name, ch] of strategies) {
  const padding = ch.repeat(PAD);
  console.log(`  ${padding}|END  ${DIM}← ${name}${NC}`);
}

// ─── string-width comparison ────────────────────────────────────────────────

section("Display width vs string-width (npm)");
console.log(`  ${DIM}Most terminals render Braille Blank as 2 columns.${NC}`);
console.log(`  ${DIM}But the npm 'string-width' package counts it as 1.${NC}`);
console.log(`  ${DIM}Claude Code uses string-width for layout calculations.${NC}\n`);

try {
  // Try to load string-width if available
  const sw = require("string-width");
  row("string-width(' ')", String(sw(" ")));
  row("string-width('\\u2800')", String(sw("\u2800")));
  row("string-width('\\u00A0')", String(sw("\u00A0")));
  row("string-width('-o-OO-o-')", String(sw("-o-OO-o-")));
  row("string-width('⠀⠀⠀⠀⠀-o-OO-o-')", String(sw("\u2800\u2800\u2800\u2800\u2800-o-OO-o-")));
} catch {
  warn("string-width not installed in project — skipping comparison");
}

// ─── Footer ─────────────────────────────────────────────────────────────────

console.log(`\n${CYAN}${BOLD}━━━ End of report ${"━".repeat(46)}${NC}\n`);
console.log(`${DIM}Copy everything above into your GitHub issue.${NC}\n`);

#!/usr/bin/env bun
/**
 * coding-buddy disable — temporarily deactivate buddy without losing data
 *
 * Removes: MCP server, status line, hooks
 * Keeps: companion data, backups, skill files
 *
 * Re-enable with: bun run install-buddy
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import {
  buddyStateDir,
  claudeSettingsPath,
  claudeUserConfigPath,
} from "../server/path.ts";

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const NC = "\x1b[0m";

function ok(msg: string) { console.log(`${GREEN}✓${NC}  ${msg}`); }
function warn(msg: string) { console.log(`${YELLOW}⚠${NC}  ${msg}`); }

const CLAUDE_JSON = claudeUserConfigPath();
const SETTINGS = claudeSettingsPath();
const STATE_DIR = buddyStateDir();

console.log(`\n${BOLD}Disabling coding-buddy...${NC}\n`);

// 1. Remove MCP server from ~/.claude.json
try {
  const claudeJson = JSON.parse(readFileSync(CLAUDE_JSON, "utf8"));
  if (claudeJson.mcpServers?.["claude-buddy"]) {
    delete claudeJson.mcpServers["claude-buddy"];
    if (Object.keys(claudeJson.mcpServers).length === 0) delete claudeJson.mcpServers;
    writeFileSync(CLAUDE_JSON, JSON.stringify(claudeJson, null, 2));
    ok(`MCP server removed from ${CLAUDE_JSON}`);
  } else {
    warn("MCP server was not registered");
  }
} catch {
  warn(`Could not update ${CLAUDE_JSON}`);
}

// 2. Remove status line + hooks from settings.json
try {
  const settings = JSON.parse(readFileSync(SETTINGS, "utf8"));
  let changed = false;

  if (settings.statusLine?.command?.includes("buddy")) {
    delete settings.statusLine;
    ok("Status line removed");
    changed = true;
  }

  if (settings.hooks) {
    for (const hookType of ["PostToolUse", "Stop", "SessionStart", "SessionEnd", "UserPromptSubmit"]) {
      if (settings.hooks[hookType]) {
        const before = settings.hooks[hookType].length;
        settings.hooks[hookType] = settings.hooks[hookType].filter(
          (h: any) => !h.hooks?.some((hh: any) => hh.command?.includes("coding-buddy") || hh.command?.includes("claude-buddy")),
        );
        if (settings.hooks[hookType].length < before) changed = true;
        if (settings.hooks[hookType].length === 0) delete settings.hooks[hookType];
      }
    }
    if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
  }

  if (changed) {
    writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + "\n");
    ok("Hooks and status line removed from settings.json");
  }
} catch {
  warn("Could not update settings.json");
}

// 3. Stop tmux popup if running
try {
  if (process.env.TMUX) {
    const { execSync } = await import("child_process");
    execSync("tmux display-popup -C 2>/dev/null", { stdio: "ignore" });
  }
} catch { /* not in tmux */ }

console.log(`
${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
${GREEN}  Buddy disabled.${NC}
${GREEN}  Companion data is preserved at ${STATE_DIR}${NC}
${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}

${DIM}  Restart Claude Code for changes to take effect.
  Re-enable anytime with: bun run install-buddy${NC}
`);

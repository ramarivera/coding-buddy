/**
 * coding-buddy uninstall — remove all integrations
 */

import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from "fs";
import { join } from "path";
import {
  buddyStateDir,
  claudeSettingsPath,
  claudeSkillDir,
  claudeUserConfigPath,
} from "../server/path.ts";

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const NC = "\x1b[0m";

function ok(msg: string) { console.log(`${GREEN}✓${NC}  ${msg}`); }
function warn(msg: string) { console.log(`${YELLOW}⚠${NC}  ${msg}`); }

const SETTINGS_FILE = claudeSettingsPath();
const SKILL_DIR = claudeSkillDir("buddy");
const STATE_DIR = buddyStateDir();
const CLAUDE_JSON_PATH = claudeUserConfigPath();

console.log("\ncoding-buddy uninstall\n");

// Stop all popup reopen loops and close any running popup
try {
  if (existsSync(STATE_DIR)) {
    // Kill all session popup loops (popup-reopen-pid.*)
    for (const f of readdirSync(STATE_DIR).filter(f => f.startsWith("popup-reopen-pid."))) {
      const pidPath = join(STATE_DIR, f);
      const pid = parseInt(readFileSync(pidPath, "utf8").trim(), 10);
      if (pid > 0) { try { process.kill(pid); } catch { /* already dead */ } }
      rmSync(pidPath, { force: true });
    }
    // Clean up all session-scoped files
    const patterns = ["popup-stop.", "popup-resize.", "popup-env.", "popup-scroll.",
                      "reaction.", ".last_reaction.", ".last_comment."];
    for (const f of readdirSync(STATE_DIR)) {
      if (patterns.some(p => f.startsWith(p))) {
        rmSync(join(STATE_DIR, f), { force: true });
      }
    }
  }
  // Close any open popup
  if (process.env.TMUX) {
    const { execSync } = await import("child_process");
    execSync("tmux display-popup -C 2>/dev/null", { stdio: "ignore" });
  }
  ok("Popup stopped");
} catch { /* not in tmux or no popup */ }

// Remove MCP server from Claude's user config
try {
  const claudeJson = JSON.parse(readFileSync(CLAUDE_JSON_PATH, "utf8"));
  if (claudeJson.mcpServers?.["claude-buddy"]) {
    delete claudeJson.mcpServers["claude-buddy"];
    if (Object.keys(claudeJson.mcpServers).length === 0) delete claudeJson.mcpServers;
    writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(claudeJson, null, 2));
    ok(`MCP server removed from ${CLAUDE_JSON_PATH}`);
  }
} catch {
  warn(`Could not update ${CLAUDE_JSON_PATH}`);
}

// Remove hooks and statusline from settings.json
try {
  const settings = JSON.parse(readFileSync(SETTINGS_FILE, "utf8"));
  let changed = false;

  if (settings.statusLine?.command?.includes("buddy")) {
    delete settings.statusLine;
    ok("Status line removed");
    changed = true;
  }

  for (const hookType of ["PostToolUse", "Stop", "SessionStart", "SessionEnd", "UserPromptSubmit"] as const) {
    if (settings.hooks?.[hookType]) {
      const before = settings.hooks[hookType].length;
      settings.hooks[hookType] = settings.hooks[hookType].filter(
        (h: any) => !h.hooks?.some((hh: any) => hh.command?.includes("coding-buddy") || hh.command?.includes("claude-buddy")),
      );
      if (settings.hooks[hookType].length < before) {
        ok(`${hookType} hooks removed`);
        changed = true;
      }
      if (settings.hooks[hookType].length === 0) delete settings.hooks[hookType];
    }
  }
  if (settings.hooks && Object.keys(settings.hooks).length === 0) delete settings.hooks;

  if (changed) {
    writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n");
  }
} catch {
  warn("Could not update settings.json");
}

// Remove skill
if (existsSync(SKILL_DIR)) {
  rmSync(SKILL_DIR, { recursive: true });
  ok("Skill removed");
} else {
  warn("Skill not found (already removed)");
}

// Keep state dir (companion data) — user might want it back.
// This is profile-scoped when CLAUDE_CONFIG_DIR is set, so other
// profiles' buddies are unaffected.
if (existsSync(STATE_DIR)) {
  warn(`Companion data kept at ${STATE_DIR} — delete manually if not needed`);
}

console.log(`\n${GREEN}Done.${NC} Restart Claude Code to apply changes.\n`);

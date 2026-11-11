/**
 * coding-buddy installer
 *
 * Registers: MCP server (in Claude's user config), skill, hooks, status line
 * (in settings.json). All paths resolve via server/paths.ts, so the installer
 * targets the active Claude profile ($CLAUDE_CONFIG_DIR) or the default
 * ~/.claude/ layout when the env var is unset.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync } from "fs";
import { execFileSync, execSync } from "child_process";
import { resolve, dirname, join } from "path";

import { generateBones, renderBuddy, renderFace, RARITY_STARS } from "../core/engine.ts"
import {
  claudeConfigDir,
  buddyStateDir,
  claudeSettingsPath,
  claudeSkillDir,
  claudeUserConfigPath,
  toUnixPath,
} from "../server/path.ts";
import { loadCompanion, saveCompanion, resolveUserId, writeStatusState } from "../server/state.ts";
import { generateFallbackName } from "../core/reactions.ts"
import { copyRuntimeApp, stableRuntimePaths } from "./runtime-app.ts";

/** Recognise any buddy-owned hook command, however it is pathed. */
function isBuddyHookCommand(command: unknown): boolean {
  if (typeof command !== "string") return false;
  return (
    command.includes("coding-buddy") ||
    command.includes("claude-buddy") ||
    command.includes("buddy-state") ||
    /\/(buddy-comment|suggest|react|mood-react|name-react|file-type-react)\.(sh|ts)\b/.test(command)
  );
}

const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const NC = "\x1b[0m";

const CLAUDE_DIR = claudeConfigDir();
const SETTINGS_FILE = claudeSettingsPath();
const BUDDY_DIR = claudeSkillDir("buddy");
const CLAUDE_JSON_PATH = claudeUserConfigPath();
const PROJECT_ROOT = resolve(dirname(import.meta.dir));
const HOOK_TIMEOUT_SECONDS = 15;

function banner() {
  console.log(`
${CYAN}╔══════════════════════════════════════════════════════════╗${NC}
${CYAN}║${NC}  ${BOLD}coding-buddy${NC} — permanent coding companion              ${CYAN}║${NC}
${CYAN}║${NC}  ${DIM}MCP + Skill + StatusLine + Hooks${NC}                        ${CYAN}║${NC}
${CYAN}╚══════════════════════════════════════════════════════════╝${NC}
`);
}

function ok(msg: string) { console.log(`${GREEN}✓${NC}  ${msg}`); }
function info(msg: string) { console.log(`${CYAN}→${NC}  ${msg}`); }
function warn(msg: string) { console.log(`${YELLOW}⚠${NC}  ${msg}`); }
function err(msg: string) { console.log(`${RED}✗${NC}  ${msg}`); }

// ─── Preflight checks ──────────────────────────────────────────────────────

function preflight(): boolean {
  let pass = true;

  // Check bun
  try {
    execSync("bun --version", { stdio: "ignore" });
    ok("bun found");
  } catch {
    err("bun not found. Install: curl -fsSL https://bun.sh/install | bash");
    pass = false;
  }

  // Check jq (needed for status line + hooks)
  try {
    execSync("jq --version", { stdio: "ignore" });
    ok("jq found");
  } catch {
    warn("jq not found — installing...");
    try {
      execSync("sudo apt-get install -y jq 2>/dev/null || brew install jq 2>/dev/null", { stdio: "ignore" });
      ok("jq installed");
    } catch {
      err("Could not install jq. Install manually: apt install jq / brew install jq / windows: install from https://github.com/jqlang/jq/releases/latest and add to PATH");
      pass = false;
    }
  }

  // Check Claude config dir exists
  if (!existsSync(CLAUDE_DIR)) {
    err(`${CLAUDE_DIR} not found. Start Claude Code once first, then re-run.`);
    pass = false;
  } else {
    ok(`${CLAUDE_DIR} found`);
  }

  // Check Claude user config (.claude.json) exists
  if (!existsSync(CLAUDE_JSON_PATH)) {
    err(`${CLAUDE_JSON_PATH} not found. Start Claude Code once first, then re-run.`);
    pass = false;
  } else {
    ok(`${CLAUDE_JSON_PATH} found`);
  }

  return pass;
}

// ─── Load / update settings.json ────────────────────────────────────────────

function loadSettings(): Record<string, any> {
  try {
    return JSON.parse(readFileSync(SETTINGS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveSettings(settings: Record<string, any>) {
  mkdirSync(CLAUDE_DIR, { recursive: true });
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + "\n");
}

// ─── Step 1: Register MCP server (in ~/.claude.json) ────────────────────────

function installMcp(appDir: string) {
  const serverPath = stableRuntimePaths(appDir).mcpServer;

  let claudeJson: Record<string, any> = {};
  try {
    claudeJson = JSON.parse(readFileSync(CLAUDE_JSON_PATH, "utf8"));
  } catch { /* fresh config */ }

  if (!claudeJson.mcpServers) claudeJson.mcpServers = {};

  claudeJson.mcpServers["claude-buddy"] = {
    command: "bun",
    args: [toUnixPath(serverPath)],
    cwd: toUnixPath(appDir),
  };

  writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(claudeJson, null, 2));
  ok(`MCP server registered in ${CLAUDE_JSON_PATH}`);
}

// ─── Step 2: Install skill ──────────────────────────────────────────────────

function installSkill() {
  const srcSkill = join(PROJECT_ROOT, "skills", "buddy", "SKILL.md");
  mkdirSync(BUDDY_DIR, { recursive: true });
  cpSync(srcSkill, join(BUDDY_DIR, "SKILL.md"), { force: true });
  ok(`Skill installed: ${join(BUDDY_DIR, "SKILL.md")}`);
}

// ─── Step 3: Configure status line (with animation refresh) ─────────────────

function installStatusLine(settings: Record<string, any>, appDir: string) {
  const statusScript = stableRuntimePaths(appDir).statusline;

  settings.statusLine = {
    type: "command",
    command: toUnixPath(statusScript),
    padding: 1,
    refreshInterval: 1,  // 1 second — drives the buddy animation
  };

  ok("Status line configured (with animation refresh)");
}

// The tmux popup mode was removed in favour of the status line / buddy-shell
// — its modal `tmux display-popup` intercepted the `Ctrl+b` prefix, breaking
// every tmux binding while the buddy was visible (issue #57). For backwards
// compatibility any legacy SessionStart/SessionEnd hooks that reference the
// popup manager are stripped out below when re-installing.

function stripLegacyPopupHooks(settings: Record<string, any>) {
  if (!settings.hooks) return;
  for (const hookType of ["SessionStart", "SessionEnd"] as const) {
    if (!settings.hooks[hookType]) continue;
    settings.hooks[hookType] = settings.hooks[hookType].filter(
      (h: any) => !h.hooks?.some((hh: any) =>
        hh.command?.includes("popup-manager") || hh.command?.includes("claude-buddy/popup"),
      ),
    );
    if (settings.hooks[hookType].length === 0) delete settings.hooks[hookType];
  }
}

// ─── Step 4: Register hooks ─────────────────────────────────────────────────

function installHooks(settings: Record<string, any>, appDir: string) {
  const hooksDir = stableRuntimePaths(appDir).hooks;
  const reactHook     = join(hooksDir, "react.sh");
  const fileTypeHook  = join(hooksDir, "file-type-react.sh");
  const commentHook   = join(hooksDir, "buddy-comment.sh");
  const suggestHook   = join(hooksDir, "suggest.sh");
  const nameHook      = join(hooksDir, "name-react.sh");
  const moodHook      = join(hooksDir, "mood-react.sh");
  const commandHook = (command: string) => ({
    type: "command",
    command: toUnixPath(command),
    timeout: HOOK_TIMEOUT_SECONDS,
  });

  if (!settings.hooks) settings.hooks = {};

  // PostToolUse: detect errors/test failures/successes in Bash output,
  // plus file-type specific reactions on Write/Edit.
  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];
  settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(
    (h: any) => !h.hooks?.some((hh: any) => isBuddyHookCommand(hh.command)),
  );
  settings.hooks.PostToolUse.push({
    matcher: "Bash",
    hooks: [commandHook(reactHook)],
  });
  settings.hooks.PostToolUse.push({
    matcher: "Write|Edit",
    hooks: [commandHook(fileTypeHook)],
  });

  // Stop: extract <!-- buddy: --> comment from Claude's response
  if (!settings.hooks.Stop) settings.hooks.Stop = [];
  // Match on the hook script filenames, not the package name: the installed
  // path is <state>/app/hooks/buddy-comment.sh, which contains neither
  // "coding-buddy" nor "claude-buddy". The old filter therefore never matched
  // and every install appended another pair — observed at 8 Stop entries on a
  // dogfooding machine. Duplicates are not harmless: the first invocation
  // adopts a buddy_react reaction and stamps the stop marker, then the rest
  // see it as stale and overwrite the bubble with a canned pool line.
  settings.hooks.Stop = settings.hooks.Stop.filter(
    (h: any) => !h.hooks?.some((hh: any) => isBuddyHookCommand(hh.command)),
  );
  settings.hooks.Stop.push({
    hooks: [commandHook(commentHook)],
  });
  settings.hooks.Stop.push({
    hooks: [commandHook(suggestHook)],
  });

  // UserPromptSubmit: detect buddy's name in user message → instant status line
  // reaction, plus mood-react based on prompt content.
  if (!settings.hooks.UserPromptSubmit) settings.hooks.UserPromptSubmit = [];
  settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit.filter(
    (h: any) => !h.hooks?.some((hh: any) => isBuddyHookCommand(hh.command)),
  );
  settings.hooks.UserPromptSubmit.push({
    hooks: [commandHook(nameHook)],
  });
  settings.hooks.UserPromptSubmit.push({
    hooks: [commandHook(moodHook)],
  });

  ok("Hooks registered: PostToolUse (Bash + Write/Edit) + Stop (comment + suggest) + UserPromptSubmit (name + mood)");
}

function installRuntimeApp(): string {
  const appDir = copyRuntimeApp(PROJECT_ROOT, buddyStateDir());
  const installArgs = ["install", "--production", "--ignore-scripts"];
  if (existsSync(join(appDir, "bun.lock"))) installArgs.push("--frozen-lockfile");
  execFileSync("bun", installArgs, { cwd: appDir, stdio: "ignore" });
  ok(`Stable runtime installed: ${appDir}`);
  return appDir;
}

// ─── Step 5: Ensure MCP tools are allowed ───────────────────────────────────

function ensurePermissions(settings: Record<string, any>) {
  if (!settings.permissions) settings.permissions = {};
  if (!settings.permissions.allow) settings.permissions.allow = [];

  const allow: string[] = settings.permissions.allow;
  if (!allow.includes("mcp__*") && !allow.some((p: string) => p.startsWith("mcp__claude_buddy"))) {
    allow.push("mcp__claude_buddy__*");
    ok("Permission added: mcp__claude_buddy__*");
  } else {
    ok("MCP permissions already configured");
  }
}

// ─── Step 6: Initialize companion ───────────────────────────────────────────

function initCompanion() {
  let companion = loadCompanion();
  if (companion) {
    info(`Existing companion found: ${companion.name} (${companion.bones.rarity} ${companion.bones.species})`);
    return companion;
  }

  const userId = resolveUserId();
  info(`Generating companion from user ID: ${userId.slice(0, 12)}...`);

  const bones = generateBones(userId);
  companion = {
    bones,
    name: generateFallbackName(),
    personality: `A ${bones.rarity} ${bones.species} who watches code with quiet intensity.`,
    hatchedAt: Date.now(),
    userId,
  };

  saveCompanion(companion);
  writeStatusState(companion);
  ok(`Companion hatched: ${companion.name}`);

  return companion;
}

// ─── Main ───────────────────────────────────────────────────────────────────

banner();

const profileSource = process.env.CLAUDE_CONFIG_DIR
  ? "from CLAUDE_CONFIG_DIR"
  : "CLAUDE_CONFIG_DIR unset — single-profile default";
info(`Target profile: ${CLAUDE_DIR}  ${DIM}(${profileSource})${NC}\n`);

info("Checking requirements...\n");
if (!preflight()) {
  console.log(`\n${RED}Installation aborted. Fix the issues above and retry.${NC}\n`);
  process.exit(1);
}

console.log("");
info("Installing coding-buddy...\n");

const settings = loadSettings();
const appDir = installRuntimeApp();

installMcp(appDir);
installSkill();

stripLegacyPopupHooks(settings);
installStatusLine(settings, appDir);

installHooks(settings, appDir);
ensurePermissions(settings);
saveSettings(settings);

console.log("");
const companion = initCompanion();

console.log("");
console.log(renderBuddy(companion.bones));
console.log("");
console.log(`  ${BOLD}${companion.name}${NC} -- ${companion.personality}`);
console.log("");

console.log(`${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}`);
console.log(`${GREEN}  Done! Restart Claude Code and type /buddy${NC}`);
console.log(`${GREEN}  Display mode: status line${NC}`);
console.log(`${GREEN}  Your companion is now permanent -- survives any update.${NC}`);
console.log(`${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}`);
console.log("");
console.log(`${DIM}  /buddy        show your companion`);
console.log(`  /buddy pet    pet your companion`);
console.log(`  /buddy stats  detailed stat card`);
console.log(`  /buddy off    mute reactions`);
console.log(`  /buddy on     unmute reactions${NC}`);
console.log("");

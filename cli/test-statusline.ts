#!/usr/bin/env bun
/**
 * coding-buddy test-statusline — temporarily install a test status line
 *
 * Run: bun run test-statusline           # install test
 *      bun run test-statusline restore   # restore original
 *
 * The test status line outputs multiple padding strategies side-by-side
 * so you can see in actual Claude Code which one renders correctly.
 *
 * Your original statusLine config is backed up to <state-dir>/statusline.bak
 * (state dir resolves via server/paths.ts).
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync, chmodSync, mkdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { buddyStateDir, claudeSettingsPath } from "../server/path.ts";

const SETTINGS = claudeSettingsPath();
const STATE_DIR = buddyStateDir();
const BACKUP = join(STATE_DIR, "statusline.bak");
const TEST_SCRIPT = join(STATE_DIR, "test-statusline.sh");
const SOURCE_SCRIPT = resolve(import.meta.dir, "test-statusline.sh");

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const NC = "\x1b[0m";

function ok(msg: string) { console.log(`${GREEN}✓${NC}  ${msg}`); }
function info(msg: string) { console.log(`${CYAN}→${NC}  ${msg}`); }
function warn(msg: string) { console.log(`${YELLOW}⚠${NC}  ${msg}`); }
function err(msg: string) { console.log(`${RED}✗${NC}  ${msg}`); }

const action = process.argv[2] || "install";

// ─── Install ────────────────────────────────────────────────────────────────

if (action === "install") {
  console.log(`\n${BOLD}coding-buddy test status line installer${NC}\n`);

  if (!existsSync(SETTINGS)) {
    err(`${SETTINGS} not found`);
    process.exit(1);
  }
  if (!existsSync(SOURCE_SCRIPT)) {
    err(`Source test script missing: ${SOURCE_SCRIPT}`);
    process.exit(1);
  }

  // Backup
  if (existsSync(BACKUP)) {
    warn(`Backup already exists at ${BACKUP}`);
    warn("Run 'bun run test-statusline restore' first to revert");
    process.exit(1);
  }

  mkdirSync(dirname(BACKUP), { recursive: true });
  copyFileSync(SETTINGS, BACKUP);
  ok(`Backed up settings to ${BACKUP}`);

  // Copy the test script (no inline TS interpolation issues)
  copyFileSync(SOURCE_SCRIPT, TEST_SCRIPT);
  chmodSync(TEST_SCRIPT, 0o755);
  ok(`Test script copied to ${TEST_SCRIPT}`);

  // Update settings to use test script
  const settings = JSON.parse(readFileSync(SETTINGS, "utf8"));
  settings.statusLine = {
    type: "command",
    command: TEST_SCRIPT,
    padding: 1,
  };
  writeFileSync(SETTINGS, JSON.stringify(settings, null, 2));
  ok("settings.json updated");

  console.log(`
${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
${CYAN}  NEXT STEPS:${NC}

  ${BOLD}1.${NC} Restart Claude Code completely
  ${BOLD}2.${NC} Take a screenshot of the status line area
  ${BOLD}3.${NC} Note which lines are visible and which markers align
  ${BOLD}4.${NC} Restore your original config:

     ${GREEN}bun run test-statusline restore${NC}

  ${BOLD}What to look for:${NC}
  - Are all 12 lines visible? (or only some?)
  - Do SPACE_30_END, BRAILLE_30_END, NBSP_30_END align?
  - Does the mushroom art appear in gold color?
${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}
`);
  process.exit(0);
}

// ─── Restore ────────────────────────────────────────────────────────────────

if (action === "restore") {
  console.log(`\n${BOLD}coding-buddy test status line restore${NC}\n`);

  if (!existsSync(BACKUP)) {
    err(`No backup found at ${BACKUP}`);
    err("Nothing to restore");
    process.exit(1);
  }

  copyFileSync(BACKUP, SETTINGS);
  ok("Original settings.json restored");

  const { unlinkSync } = require("fs");
  try { unlinkSync(BACKUP); ok("Backup file removed"); } catch { /* noop */ }
  try { unlinkSync(TEST_SCRIPT); ok("Test script removed"); } catch { /* noop */ }

  console.log(`\n${GREEN}Done.${NC} Restart Claude Code to apply.\n`);
  process.exit(0);
}

err(`Unknown action: ${action}`);
console.log(`Usage: bun run test-statusline [install|restore]`);
process.exit(1);

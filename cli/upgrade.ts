#!/usr/bin/env bun

import { readFileSync } from "fs";
import { execSync, spawnSync } from "child_process";
import { join, resolve, dirname } from "path";

const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const NC = "\x1b[0m";

const PROJECT_ROOT = resolve(dirname(import.meta.dir));

function ok(msg: string) { console.log(`${GREEN}✓${NC}  ${msg}`); }
function info(msg: string) { console.log(`${CYAN}→${NC}  ${msg}`); }
function warn(msg: string) { console.log(`${YELLOW}⚠${NC}  ${msg}`); }
function err(msg: string) { console.log(`${RED}✗${NC}  ${msg}`); }

function tryExec(cmd: string, fallback = ""): string {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return fallback;
  }
}

function trySpawn(
  command: string,
  args: string[],
  fallback = "",
  cwd: string = PROJECT_ROOT,
): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (result.status !== 0) return fallback;
  return result.stdout.trim();
}

function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    stdio?: "ignore" | "inherit";
  } = {},
): boolean {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? PROJECT_ROOT,
    encoding: "utf8",
    stdio: ["ignore", options.stdio ?? "ignore", options.stdio ?? "ignore"],
  });
  return result.status === 0;
}

function getCurrentVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(PROJECT_ROOT, "package.json"), "utf8"));
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function banner() {
  console.log(`
${CYAN}╔══════════════════════════════════════════════════════════╗${NC}
${CYAN}║${NC}  ${BOLD}coding-buddy upgrade${NC}                                    ${CYAN}║${NC}
${CYAN}╚══════════════════════════════════════════════════════════╝${NC}
`);
}

function checkGitRepo(): boolean {
  const isRepo = tryExec("git rev-parse --is-inside-work-tree 2>/dev/null");
  if (isRepo !== "true") {
    err("Not inside a git repository. Upgrade requires a git clone of coding-buddy.");
    return false;
  }
  return true;
}

function getRemoteBranch(): string {
  const branch = tryExec("git rev-parse --abbrev-ref HEAD 2>/dev/null", "main");
  return branch === "HEAD" ? "main" : branch;
}

function checkForUpdates(branch: string): { hasUpdate: boolean; local: string; remote: string; commits: string[] } {
  info("Fetching latest from remote...\n");
  if (!runCommand("git", ["fetch", "--quiet"])) {
    warn("git fetch failed — proceeding with cached remote state");
  }

  const local = tryExec("git rev-parse HEAD 2>/dev/null");
  const upstream = tryExec(`git rev-parse '@{upstream}' 2>/dev/null`);
  const remote = upstream || trySpawn("git", ["rev-parse", `origin/${branch}`]);

  if (!local || !remote) {
    warn("Could not determine remote HEAD — no tracking branch configured");
    info(`To set one: git branch --set-upstream-to=origin/${branch} ${branch}`);
    return { hasUpdate: false, local, remote, commits: [] };
  }

  if (local === remote) {
    return { hasUpdate: false, local, remote, commits: [] };
  }

  const commits = trySpawn(
    "git",
    ["log", "--oneline", `${local}..origin/${branch}`],
  ).split("\n").filter(Boolean);

  return { hasUpdate: true, local, remote, commits };
}

function pullLatest(branch: string): boolean {
  info(`Pulling latest from origin/${branch}...`);
  try {
    const result = spawnSync("git", ["pull", "--ff-only", "origin", branch], {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || "unknown error");
    ok("Git pull successful");
    return true;
  } catch (e: any) {
    err("git pull failed — you may have local changes that conflict");
    err(e.message?.split("\n")[0] || "unknown error");
    info("Stash or commit your local changes, then re-run upgrade");
    return false;
  }
}

function installDeps(): boolean {
  info("Installing dependencies...");
  try {
    if (!runCommand("bun", ["install"])) throw new Error("bun install failed");
    ok("Dependencies installed");
    return true;
  } catch {
    err("bun install failed");
    return false;
  }
}

function reinstallBuddy(): boolean {
  info("Re-running install-buddy to update integrations...\n");
  try {
    if (!runCommand("bun", ["run", "install-buddy"], { stdio: "inherit" })) {
      throw new Error("install-buddy failed");
    }
    return true;
  } catch {
    err("install-buddy failed");
    return false;
  }
}

function printSummary(oldVersion: string, commits: string[]) {
  const newVersion = getCurrentVersion();

  console.log("");
  console.log(`${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}`);
  console.log(`${GREEN}  Upgrade complete!${NC}`);
  console.log(`${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}`);
  console.log("");
  console.log(`  ${BOLD}Version:${NC}  ${oldVersion} → ${BOLD}${newVersion}${NC}`);

  if (commits.length > 0) {
    console.log(`  ${BOLD}Changes:${NC}`);
    const display = commits.slice(0, 15);
    for (const c of display) {
      console.log(`    ${DIM}${c}${NC}`);
    }
    if (commits.length > 15) {
      console.log(`    ${DIM}... and ${commits.length - 15} more${NC}`);
    }
  }

  console.log("");
  console.log(`${DIM}  Restart Claude Code for changes to take effect.${NC}`);
  console.log("");
}

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");

banner();

const oldVersion = getCurrentVersion();
info(`Current version: ${oldVersion}\n`);

if (!checkGitRepo()) {
  process.exit(1);
}

const branch = getRemoteBranch();
const { hasUpdate, commits } = checkForUpdates(branch);

if (!hasUpdate) {
  ok(`Already up to date (v${oldVersion})`);
  console.log("");
  process.exit(0);
}

if (checkOnly) {
  warn(`Update available! ${commits.length} new commit${commits.length === 1 ? "" : "s"}:`);
  for (const c of commits.slice(0, 10)) {
    console.log(`  ${DIM}${c}${NC}`);
  }
  if (commits.length > 10) {
    console.log(`  ${DIM}... and ${commits.length - 10} more${NC}`);
  }
  console.log("");
  info("Run without --check to apply the update");
  console.log("");
  process.exit(0);
}

info(`${commits.length} new commit${commits.length === 1 ? "" : ""} available:`);
for (const c of commits.slice(0, 10)) {
  console.log(`  ${DIM}${c}${NC}`);
}
if (commits.length > 10) {
  console.log(`  ${DIM}... and ${commits.length - 10} more${NC}`);
}
console.log("");

if (!pullLatest(branch)) {
  process.exit(1);
}

if (!installDeps()) {
  process.exit(1);
}

if (!reinstallBuddy()) {
  process.exit(1);
}

printSummary(oldVersion, commits);

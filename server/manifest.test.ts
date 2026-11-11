/**
 * Regression tests for shipped plugin manifests. These exist because a
 * single misplaced "./" relative path in hooks.json or plugin.json silently
 * breaks `claude plugin install` — Claude Code runs those commands from the
 * user's project cwd, not the plugin cache dir, so every lookup fails. The
 * tests below pin the invariants that prevent that class of bug from
 * returning.
 */

import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync, statSync } from "fs";
import { join } from "path";

const REPO_ROOT = join(import.meta.dir, "..");

describe("shipped plugin manifests", () => {
  test("hooks/hooks.json: every hook command uses ${CLAUDE_PLUGIN_ROOT}", () => {
    const manifest = JSON.parse(
      readFileSync(join(REPO_ROOT, "hooks", "hooks.json"), "utf8"),
    );

    const commands: string[] = [];
    for (const hookType of Object.keys(manifest.hooks ?? {})) {
      for (const entry of manifest.hooks[hookType]) {
        for (const hook of entry.hooks ?? []) {
          if (hook.type === "command" && hook.command) commands.push(hook.command);
        }
      }
    }

    expect(commands.length).toBeGreaterThan(0);
    for (const cmd of commands) {
      expect(cmd).toContain("${CLAUDE_PLUGIN_ROOT}");
    }
  });

  test("hooks/hooks.json: every hook command has a 15s timeout", () => {
    const manifest = JSON.parse(
      readFileSync(join(REPO_ROOT, "hooks", "hooks.json"), "utf8"),
    );

    const timeouts: unknown[] = [];
    for (const hookType of Object.keys(manifest.hooks ?? {})) {
      for (const entry of manifest.hooks[hookType]) {
        for (const hook of entry.hooks ?? []) {
          if (hook.type === "command") timeouts.push(hook.timeout);
        }
      }
    }

    expect(timeouts.length).toBeGreaterThan(0);
    for (const timeout of timeouts) expect(timeout).toBe(15);
  });

  test(".claude-plugin/plugin.json: MCP server command resolves plugin-root-absolute", () => {
    const manifest = JSON.parse(
      readFileSync(join(REPO_ROOT, ".claude-plugin", "plugin.json"), "utf8"),
    );
    const entry = manifest.mcpServers?.["claude-buddy"];
    expect(entry).toBeDefined();

    // Either the command itself is plugin-root-anchored (the launcher path),
    // or every positional arg must be — a relative path would break install.
    const command: string = entry.command;
    const args: string[] = entry.args ?? [];
    const isRooted = (p: string) => p.startsWith("${CLAUDE_PLUGIN_ROOT}") || p.startsWith("/");

    if (isRooted(command)) {
      // Args may be empty or flags — no file-path args expected.
      return;
    }

    expect(args.length).toBeGreaterThan(0);
    for (const arg of args) expect(isRooted(arg)).toBe(true);
  });

  test("server/mcp-launcher.sh: exists, is executable, and contains the bun preflight", () => {
    const launcher = join(REPO_ROOT, "server", "mcp-launcher.sh");

    expect(existsSync(launcher)).toBe(true);

    const mode = statSync(launcher).mode;
    // Owner, group, and other must all have the execute bit.
    expect(mode & 0o111).toBe(0o111);

    const contents = readFileSync(launcher, "utf8");
    expect(contents).toContain("command -v bun");
    expect(contents).toMatch(/exec\s+bun\b/);
  });
});

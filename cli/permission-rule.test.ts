import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

import { addBuddyPermission, BUDDY_PERMISSION, LEGACY_BUDDY_PERMISSION } from "./permissions.ts";

// Claude Code names MCP tools mcp__<server key>__<tool> and matches permission
// rules against that name literally, so every rule we write must use the exact
// key the server is registered under. A plugin install scopes the key as
// plugin_<plugin name>_<server key>.
const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
const pluginKeys = Object.keys(plugin.mcpServers);
const installerKey = read("cli/install.ts").match(/claudeJson\.mcpServers\["([^"]+)"\]/)?.[1];

describe("MCP permission rule", () => {
  test("installer and plugin register the server under the same key", () => {
    expect(installerKey).toBeDefined();
    expect(pluginKeys).toEqual([installerKey!]);
  });

  test("the rule the installer writes matches the registered server", () => {
    expect(BUDDY_PERMISSION).toBe(`mcp__${installerKey}__*`);
  });

  test("buddy skill allows the tools of both installer and plugin installs", () => {
    const allowedTools = read("skills/buddy/SKILL.md").match(/^allowed-tools: (.+)$/m)?.[1]?.split(/,\s*/);
    expect(allowedTools).toContain(`mcp__${installerKey}__*`);
    expect(allowedTools).toContain(`mcp__plugin_${plugin.name}_${installerKey}__*`);
  });
});

describe("addBuddyPermission", () => {
  test("adds the rule to an empty list", () => {
    const allow: string[] = [];
    expect(addBuddyPermission(allow)).toBe(true);
    expect(allow).toEqual([BUDDY_PERMISSION]);
  });

  test("replaces the legacy underscore rule and keeps other rules", () => {
    const allow = ["Bash(ls:*)", LEGACY_BUDDY_PERMISSION];
    addBuddyPermission(allow);
    expect(allow).toEqual(["Bash(ls:*)", BUDDY_PERMISSION]);
  });

  test("a rule for a single buddy tool does not count as full coverage", () => {
    const allow = ["mcp__claude-buddy__buddy_show"];
    expect(addBuddyPermission(allow)).toBe(true);
    expect(allow).toEqual(["mcp__claude-buddy__buddy_show", BUDDY_PERMISSION]);
  });

  test("a similarly named server does not count either", () => {
    const allow = ["mcp__claude-buddy-extra__*"];
    addBuddyPermission(allow);
    expect(allow).toContain(BUDDY_PERMISSION);
  });

  test.each(["mcp__*", "mcp__claude-buddy", BUDDY_PERMISSION])("server-wide rule %s is enough", (rule) => {
    const allow = [rule];
    expect(addBuddyPermission(allow)).toBe(false);
    expect(allow).toEqual([rule]);
  });

  test("running twice adds the rule only once", () => {
    const allow: string[] = [];
    addBuddyPermission(allow);
    addBuddyPermission(allow);
    expect(allow).toEqual([BUDDY_PERMISSION]);
  });
});

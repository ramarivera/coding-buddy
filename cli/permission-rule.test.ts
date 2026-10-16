import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

// Claude Code names MCP tools mcp__<server key>__<tool> and matches permission
// rules against that name literally, so every rule we write must use the exact
// key the server is registered under.
const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

const pluginKeys = Object.keys(JSON.parse(read(".claude-plugin/plugin.json")).mcpServers);
const installer = read("cli/install.ts");
const installerKey = installer.match(/claudeJson\.mcpServers\["([^"]+)"\]/)?.[1];
const toolPrefix = `mcp__${installerKey}__`;

describe("MCP permission rule", () => {
  test("installer and plugin register the server under the same key", () => {
    expect(installerKey).toBeDefined();
    expect(pluginKeys).toEqual([installerKey!]);
  });

  test("installer allows the registered server's tools", () => {
    expect(installer).toContain(`allow.push("${toolPrefix}*")`);
  });

  test("buddy skill allows the registered server's tools", () => {
    const allowedTools = read("skills/buddy/SKILL.md").match(/^allowed-tools: (.+)$/m)?.[1];
    expect(allowedTools?.split(/,\s*/)).toContain(`${toolPrefix}*`);
  });
});

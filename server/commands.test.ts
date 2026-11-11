import { afterEach, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateBones, type Companion } from "../core/engine.ts";

const roots: string[] = [];
const commandsUrl = new URL("./commands/index.ts", import.meta.url).href;

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function sandbox(seed = false): string {
  const root = mkdtempSync(join(tmpdir(), "buddy-command-"));
  roots.push(root);
  writeFileSync(join(root, "settings.json"), "{}");
  if (seed) {
    const companion: Companion = {
      bones: generateBones("shared-handler-test"),
      name: "TestBuddy",
      personality: "curious",
      hatchedAt: 1,
      userId: "shared-handler-test",
    };
    mkdirSync(join(root, "buddy-state"));
    writeFileSync(join(root, "buddy-state", "menagerie.json"), JSON.stringify({
      active: "test-buddy", companions: { "test-buddy": companion },
    }));
  }
  return root;
}

function environment(root: string): Record<string, string> {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    )),
    CLAUDE_CONFIG_DIR: root,
    CODING_BUDDY_USER_ID: "",
    CODING_BUDDY_STATE_DIR: "",
    CLAUDE_CODE_SESSION_ID: "",
    TMUX_PANE: "",
  };
}

// Each invocation imports path-capturing state modules in its own process.
// Neither the test runner's module cache nor the user's buddy state is shared.
function direct<T>(root: string, code: string): T {
  const proc = Bun.spawnSync([process.execPath, "--eval", `
    const { buddyCommands } = await import(${JSON.stringify(commandsUrl)});
    const result = await (async () => { ${code} })();
    console.log(JSON.stringify(result));
  `], { env: environment(root), stdout: "pipe", stderr: "pipe" });
  if (proc.exitCode !== 0) throw new Error(proc.stderr.toString());
  return JSON.parse(proc.stdout.toString()) as T;
}

function state<T>(root: string, file: string): T {
  return JSON.parse(readFileSync(join(root, "buddy-state", file), "utf8")) as T;
}

async function mcp(root: string): Promise<Client> {
  const client = new Client({ name: "command-test", version: "1" });
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [new URL("./index.ts", import.meta.url).pathname],
    env: environment(root),
    stderr: "pipe",
  }));
  return client;
}

test("shared show hatches a companion and returns markdown without ANSI", () => {
  const root = sandbox();
  const result = direct<{ content: Array<{ text: string }> }>(root,
    "return buddyCommands.buddy_show.execute({});");
  expect(result.content[0].text).toContain("```");
  expect(result.content[0].text).not.toContain("\x1b");
  const manifest = state<{ active: string; companions: Record<string, Companion> }>(root, "menagerie.json");
  expect(manifest.companions[manifest.active]).toBeDefined();
  expect(state<{ shows: number; commands_run: number }>(root, "events.json"))
    .toMatchObject({ shows: 1, commands_run: 1 });
});

test("shared pet keeps status, reaction provenance, XP, and achievement effects", () => {
  const root = sandbox(true);
  direct(root, `
    for (let i = 0; i < 10; i++) await buddyCommands.buddy_pet.execute({});
    return null;
  `);
  expect(state<{ pets: number }>(root, "events.test-buddy.json").pets).toBe(10);
  expect(state<{ totalXp: number }>(root, "xp.json").totalXp).toBeGreaterThan(0);
  expect(state<{ source: string; reason: string }>(root, "reaction.default.json"))
    .toMatchObject({ source: "fallback", reason: "pet" });
  expect(state<{ name: string }>(root, "status.json").name).toBe("TestBuddy");
  expect(readFileSync(join(root, "buddy-state", "unlocked.json"), "utf8"))
    .toContain("good_boy");
});

test("direct callers reject invalid arguments before creating or mutating state", () => {
  const root = sandbox();
  const result = direct<{ rejected: boolean }>(root, `
    try {
      await buddyCommands.buddy_rename.execute({ name: "x".repeat(15) });
      return { rejected: false };
    } catch { return { rejected: true }; }
  `);
  expect(result.rejected).toBe(true);
  expect(existsSync(join(root, "buddy-state", "menagerie.json"))).toBe(false);
});

test("MCP and direct show/stats preserve the same output and events", async () => {
  const directRoot = sandbox(true);
  const mcpRoot = sandbox(true);
  const expected = direct<Awaited<ReturnType<Client["callTool"]>>[]>(directRoot, `return [
    await buddyCommands.buddy_show.execute({}),
    await buddyCommands.buddy_stats.execute({}),
  ];`);
  const client = await mcp(mcpRoot);
  try {
    const actual = [
      await client.callTool({ name: "buddy_show", arguments: {} }),
      await client.callTool({ name: "buddy_stats", arguments: {} }),
    ];
    expect(actual).toEqual(expected);
    expect(state(mcpRoot, "events.json")).toEqual(state(directRoot, "events.json"));
  } finally {
    await client.close();
  }
});

test("MCP exposes every shared command and keeps argument constraints", async () => {
  const root = sandbox();
  const names = direct<string[]>(root, "return Object.keys(buddyCommands).sort();");
  const client = await mcp(root);
  try {
    const { tools } = await client.listTools();
    expect(tools.map(tool => tool.name).sort()).toEqual(names);
    expect(tools).toHaveLength(25);
    const invalid = await client.callTool({ name: "buddy_rename", arguments: { name: "x".repeat(15) } });
    expect(invalid.isError).toBe(true);
  } finally {
    await client.close();
  }
});

test("statusline fallback still points to the package root after extraction", () => {
  const root = sandbox();
  direct(root, "return buddyCommands.buddy_statusline.execute({ enabled: true });");
  const settings = JSON.parse(readFileSync(join(root, "settings.json"), "utf8"));
  expect(settings.statusLine.command).toContain(
    new URL("../statusline/buddy-status.sh", import.meta.url).pathname,
  );
});

import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseCommand, UsageError } from "./buddy.ts";

const cli = new URL("./buddy.ts", import.meta.url).pathname;
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function sandbox(): string {
  const root = mkdtempSync(join(tmpdir(), "buddy-cli-"));
  roots.push(root);
  writeFileSync(join(root, "settings.json"), "{}");
  return root;
}

// Each CLI run is its own process so state modules resolve CLAUDE_CONFIG_DIR fresh.
function runCli(root: string, ...args: string[]) {
  const env = Object.fromEntries(Object.entries(process.env).filter(
    (e): e is [string, string] => e[1] !== undefined,
  ));
  const proc = Bun.spawnSync([process.execPath, cli, ...args], {
    env: {
      ...env,
      CLAUDE_CONFIG_DIR: root,
      CODING_BUDDY_USER_ID: "",
      CODING_BUDDY_STATE_DIR: "",
      CLAUDE_CODE_SESSION_ID: "",
      TMUX_PANE: "",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  return { code: proc.exitCode, out: proc.stdout.toString(), err: proc.stderr.toString() };
}

function state<T>(root: string, file: string): T {
  return JSON.parse(readFileSync(join(root, "buddy-state", file), "utf8")) as T;
}

describe("parseCommand", () => {
  test("maps typed commands onto shared handlers", () => {
    expect(parseCommand([])).toEqual({ tool: "buddy_show", args: {} });
    expect(parseCommand(["off"]).tool).toBe("buddy_mute");
    expect(parseCommand(["on"]).tool).toBe("buddy_unmute");
    expect(parseCommand(["rename", "Sir", "Bit"])).toEqual({ tool: "buddy_rename", args: { name: "Sir Bit" } });
    expect(parseCommand(["personality", "very", "calm"]))
      .toEqual({ tool: "buddy_set_personality", args: { personality: "very calm" } });
    expect(parseCommand(["summon"])).toEqual({ tool: "buddy_summon", args: {} });
    expect(parseCommand(["frequency", "45"])).toEqual({ tool: "buddy_frequency", args: { cooldown: 45 } });
    expect(parseCommand(["position", "left"])).toEqual({ tool: "buddy_style", args: { position: "left" } });
    expect(parseCommand(["rarity", "off"])).toEqual({ tool: "buddy_style", args: { showRarity: false } });
    expect(parseCommand(["rainbow", "#ff0000", "#00ff00"]))
      .toEqual({ tool: "buddy_style", args: { rainbow: ["#ff0000", "#00ff00"] } });
    expect(parseCommand(["statusline", "combined"])).toEqual({ tool: "buddy_statusline", args: { combined: true } });
    expect(parseCommand(["memory", "--type", "bugs", "--unresolved"]))
      .toEqual({ tool: "buddy_memory", args: { type: "bugs", resolved: false } });
  });

  test("rejects unknown commands and malformed args before touching state", () => {
    expect(() => parseCommand(["nope"])).toThrow(UsageError);
    expect(() => parseCommand(["rename"])).toThrow(UsageError);
    expect(() => parseCommand(["width", "wide"])).toThrow(UsageError);
    expect(() => parseCommand(["statusline", "maybe"])).toThrow(UsageError);
    expect(() => parseCommand(["show", "stats"])).toThrow(UsageError);
    expect(() => parseCommand(["summon", "a", "b"])).toThrow(UsageError);
    expect(() => parseCommand(["rainbow", "reset", "red"])).toThrow(UsageError);
  });

  test("pick joins remaining words into the name; rainbow reset sends []", () => {
    expect(parseCommand(["pick", "cat", "common", "Sir", "Bit"]))
      .toEqual({ tool: "buddy_pick", args: { species: "cat", rarity: "common", name: "Sir Bit" } });
    expect(parseCommand(["rainbow", "reset"])).toEqual({ tool: "buddy_style", args: { rainbow: [] } });
  });
});

describe("cli dispatch", () => {
  test("fresh install: show hatches a companion and prints the MCP markdown card", () => {
    const root = sandbox();
    const r = runCli(root, "show");
    expect(r.code).toBe(0);
    expect(r.out).toContain("```");
    expect(r.out).not.toContain("\x1b");
    expect(state<{ shows: number; commands_run: number }>(root, "events.json"))
      .toMatchObject({ shows: 1, commands_run: 1 });
  });

  test("pet goes through the shared handler: status, events, XP", () => {
    const root = sandbox();
    expect(runCli(root, "pet").code).toBe(0);
    const { active } = state<{ active: string }>(root, "menagerie.json");
    expect(state<{ pets: number }>(root, `events.${active}.json`).pets).toBe(1);
    expect(state<{ totalXp: number }>(root, "xp.json").totalXp).toBeGreaterThan(0);
    expect(state<{ source: string; reason: string }>(root, "reaction.default.json"))
      .toMatchObject({ source: "fallback", reason: "pet" });
  });

  test("second pet refreshes the status XP snapshot", () => {
    const root = sandbox();
    expect(runCli(root, "pet").code).toBe(0);
    expect(runCli(root, "pet").code).toBe(0);
    expect(state<{ xp?: number }>(root, "status.json").xp).toBeGreaterThan(0);
  });

  test("stats increments commands_run", () => {
    const root = sandbox();
    expect(runCli(root, "show").code).toBe(0);
    const before = state<{ commands_run: number }>(root, "events.json").commands_run;
    expect(runCli(root, "stats").code).toBe(0);
    expect(state<{ commands_run: number }>(root, "events.json").commands_run).toBe(before + 1);
  });

  test("rainbow reset passes validation and clears custom colors", () => {
    const root = sandbox();
    expect(runCli(root, "rainbow", "#ff0000").code).toBe(0);
    const r = runCli(root, "rainbow", "reset");
    expect(r.code).toBe(0);
    expect(r.out).toContain("default (ROYGBIV)");
  });

  test("rainbow reset with extra args exits 1 without touching config", () => {
    const root = sandbox();
    const r = runCli(root, "rainbow", "reset", "red");
    expect(r.code).toBe(1);
    expect(r.err).toContain('unexpected argument "red"');
  });

  test("schema violations exit non-zero without mutating state", () => {
    const root = sandbox();
    const r = runCli(root, "rename", "x".repeat(15));
    expect(r.code).toBe(1);
    expect(r.err).toContain("name");
  });
});

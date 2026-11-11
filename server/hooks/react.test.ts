import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { classifyToolResponse, handleReact } from "./react.ts";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true });
});

function makeState(species: string): string {
  const stateDir = mkdtempSync(join(tmpdir(), "coding-buddy-react-"));
  dirs.push(stateDir);
  writeFileSync(join(stateDir, "status.json"), JSON.stringify({ species, name: "buddy" }));
  writeFileSync(join(stateDir, "events.json"), JSON.stringify({ kept: true }));
  return stateDir;
}

describe("react PostToolUse hook", () => {
  test("preserves the ordered matcher and extracts commit metadata", () => {
    expect(classifyToolResponse("[main abcdef123] change\n2 files changed")).toEqual({
      files: "2",
      reason: "commit",
    });
    expect(classifyToolResponse("+ 20 insertions")).toEqual({ reason: "" });
    expect(classifyToolResponse("+ 100 insertions")).toEqual({ lines: "100", reason: "large-diff" });
  });

  test("writes a deterministic reaction, events, and slow-work spawns", () => {
    const stateDir = makeState("robot");
    writeFileSync(join(stateDir, ".error_streak.session1"), "2");
    const spawned: Array<{ script: string; args: string[] }> = [];

    const result = handleReact(JSON.stringify({ tool_response: "exception: cannot compile" }), {
      clock: () => ({ day: 25, dayOfWeek: 3, hour: 12, month: 7, nowSeconds: 1_700_000_000 }),
      now: () => 1_700_000_000_123,
      random: () => 0,
      sessionId: "session1",
      spawnDetached: (script, args) => spawned.push({ script, args }),
      stateDir,
    });

    expect(result).toEqual({
      reaction: "ERROR RATE: CRITICAL. RECOMMEND: RUBBER DUCK PROTOCOL.",
      reason: "error",
      updated: true,
    });
    expect(JSON.parse(readFileSync(join(stateDir, "reaction.session1.json"), "utf8"))).toEqual({
      reaction: "ERROR RATE: CRITICAL. RECOMMEND: RUBBER DUCK PROTOCOL.",
      timestamp: 1_700_000_000_000,
      reason: "error",
      source: "fallback",
    });
    expect(JSON.parse(readFileSync(join(stateDir, "events.json"), "utf8"))).toMatchObject({
      kept: true,
      errors_seen: 1,
    });
    expect(spawned).toEqual([
      { script: "server/award-xp.ts", args: ["errors_spotted"] },
      { script: "server/shift-mood.ts", args: ["error"] },
    ]);
  });

  test("starts an error streak when its state file does not exist", () => {
    const stateDir = makeState("blob");
    const result = handleReact(JSON.stringify({ tool_response: "exception: cannot compile" }), {
      clock: () => ({ day: 25, dayOfWeek: 3, hour: 12, month: 7, nowSeconds: 1_700_000_000 }),
      now: () => 1_700_000_000_123,
      random: () => 0,
      sessionId: "session1",
      spawnDetached: () => undefined,
      stateDir,
    });

    expect(result.reason).toBe("error");
    expect(readFileSync(join(stateDir, ".error_streak.session1"), "utf8")).toBe("1");
  });
});

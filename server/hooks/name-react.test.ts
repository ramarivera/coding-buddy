import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { handleNameReact, hasNameMention } from "./name-react.ts";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true });
});

describe("name-react UserPromptSubmit hook", () => {
  test("matches the buddy name as a case-insensitive whole word", () => {
    expect(hasNameMention("hey Buddy, help", "buddy")).toBe(true);
    expect(hasNameMention("buddybot, help", "buddy")).toBe(false);

    const stateDir = mkdtempSync(join(tmpdir(), "coding-buddy-name-"));
    dirs.push(stateDir);
    writeFileSync(join(stateDir, "status.json"), JSON.stringify({ name: "buddy", species: "dragon" }));
    const result = handleNameReact(JSON.stringify({ prompt: "hey BUDDY, help" }), {
      now: () => 1_700_000_000_123,
      random: () => 0,
      sessionId: "session1",
      stateDir,
    });

    expect(result).toEqual({ reaction: "*one eye opens slowly*", updated: true });
    expect(JSON.parse(readFileSync(join(stateDir, "reaction.session1.json"), "utf8"))).toMatchObject({
      reason: "name",
      timestamp: 1_700_000_000_000,
    });
    expect(JSON.parse(readFileSync(join(stateDir, "reaction.session1.json"), "utf8"))).toMatchObject({
      source: "fallback",
      reason: "name",
      timestamp: 1_700_000_000_000,
    });
  });
});

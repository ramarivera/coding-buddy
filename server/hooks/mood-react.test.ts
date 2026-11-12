import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { handleMoodReact, moodForPrompt } from "./mood-react.ts";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true });
});

describe("mood-react UserPromptSubmit hook", () => {
  test("uses frustrated before happy and records the mood event", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "coding-buddy-mood-"));
    dirs.push(stateDir);
    writeFileSync(join(stateDir, "status.json"), JSON.stringify({ species: "cat" }));

    expect(moodForPrompt("this is broken, but yay")).toBe("frustrated");
    const result = handleMoodReact(JSON.stringify({ prompt: "why is this broken" }), {
      now: () => 1_700_000_000_123,
      random: () => 0,
      sessionId: "session1",
      stateDir,
    });

    expect(result).toEqual({
      mood: "frustrated",
      reaction: "*slowly pushes coffee toward the exit* or... keeps coding.",
      updated: true,
    });
    expect(JSON.parse(readFileSync(join(stateDir, "events.json"), "utf8"))).toEqual({
      mood_frustrated: 1,
    });
    expect(JSON.parse(readFileSync(join(stateDir, "reaction.session1.json"), "utf8"))).toMatchObject({
      source: "fallback",
      reason: "frustrated",
      timestamp: 1_700_000_000_000,
    });
  });
});

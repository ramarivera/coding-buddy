import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { handleSuggest } from "./suggest.ts";

function makeStateDir(): string {
  return mkdtempSync(join(tmpdir(), "coding-buddy-suggest-"));
}

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true });
});

describe("suggest Stop hook", () => {
  test("spawns suggestion analysis when config and assistant message are present", () => {
    const stateDir = makeStateDir();
    dirs.push(stateDir);
    writeFileSync(join(stateDir, "config.json"), JSON.stringify({ suggestionsEnabled: true }));

    const spawned: Array<{ script: string; args: string[] }> = [];
    const result = handleSuggest(
      JSON.stringify({ last_assistant_message: "TypeError: cannot read property x" }),
      {
        spawnDetached: (script, args) => spawned.push({ script, args }),
        stateDir,
      },
    );

    expect(result).toEqual({ checked: true });
    expect(spawned).toEqual([
      {
        script: "server/check-suggestions.ts",
        args: [JSON.stringify("TypeError: cannot read property x")],
      },
    ]);
  });

  test("ignores malformed stdin", () => {
    const stateDir = makeStateDir();
    dirs.push(stateDir);
    writeFileSync(join(stateDir, "config.json"), "{}");

    const result = handleSuggest("{nope", {
      spawnDetached: () => {
        throw new Error("should not spawn");
      },
      stateDir,
    });

    expect(result).toEqual({ checked: false });
  });

  test("exits silently when the state directory is missing", () => {
    const stateDir = join(tmpdir(), `coding-buddy-suggest-missing-${Date.now()}`);

    const result = handleSuggest(
      JSON.stringify({ last_assistant_message: "TODO: add tests" }),
      { stateDir },
    );

    expect(result).toEqual({ checked: false });
    expect(existsSync(stateDir)).toBe(false);
  });
});

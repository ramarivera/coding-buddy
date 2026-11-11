import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import registerPiBuddyExtension from "./index.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Pi extension registration", () => {
  test("registers the buddy command and faithful lifecycle handlers", () => {
    const commands: string[] = [];
    const events: string[] = [];
    const api = {
      registerCommand(name: string, _options: object) {
        commands.push(name);
      },
      on(event: string, _handler: unknown) {
        events.push(event);
      },
    } as ExtensionAPI;
    const stateDir = mkdtempSync(join(tmpdir(), "pi-buddy-registration-"));
    temporaryDirectories.push(stateDir);

    registerPiBuddyExtension(api, { stateDir });

    expect(commands).toEqual(["buddy"]);
    expect(events.sort()).toEqual([
      "input",
      "session_shutdown",
      "session_start",
      "tool_result",
      "turn_end",
    ]);
  });
});

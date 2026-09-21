/**
 * Tests for cleanupPluginState — the helper behind the buddy_uninstall MCP
 * tool. Uses a temp dir per test so no real user state is touched.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { cleanupPluginState } from "./state.ts";

describe("cleanupPluginState", () => {
  let settingsPath: string;
  let stateDir: string;

  beforeEach(() => {
    const root = mkdtempSync(join(tmpdir(), "buddy-uninstall-test-"));
    settingsPath = join(root, "settings.json");
    stateDir = join(root, ".claude-buddy");
    mkdirSync(stateDir, { recursive: true });
  });

  test("removes buddy statusLine and reports it", () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({
        statusLine: { type: "command", command: "/opt/buddy/statusline/buddy-status.sh" },
        other: "keep",
      }),
    );

    const result = cleanupPluginState(settingsPath, stateDir);

    expect(result.statusLineRemoved).toBe(true);
    expect(result.foreignStatusLineKept).toBe(false);
    const after = JSON.parse(readFileSync(settingsPath, "utf8"));
    expect(after.statusLine).toBeUndefined();
    expect(after.other).toBe("keep");
  });

  test("never removes a foreign statusLine and reports it was kept", () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({
        statusLine: { type: "command", command: "/usr/local/bin/my-status.sh" },
      }),
    );

    const result = cleanupPluginState(settingsPath, stateDir);

    expect(result.statusLineRemoved).toBe(false);
    expect(result.foreignStatusLineKept).toBe(true);
    const after = JSON.parse(readFileSync(settingsPath, "utf8"));
    expect(after.statusLine.command).toBe("/usr/local/bin/my-status.sh");
  });

  test("wipes session-scoped transient files but keeps companion data", () => {
    writeFileSync(join(stateDir, "reaction.pane-1.json"), "{}");
    writeFileSync(join(stateDir, "reaction.default.json"), "{}");
    writeFileSync(join(stateDir, ".last_reaction.pane-1"), "0");
    writeFileSync(join(stateDir, ".last_comment.default"), "0");
    writeFileSync(join(stateDir, ".last_stop_hook.default"), "0");
    writeFileSync(join(stateDir, "popup-stop.42"), "");
    writeFileSync(join(stateDir, "popup-reopen-pid.42"), "99999");
    writeFileSync(join(stateDir, "popup-env.42"), "");
    writeFileSync(join(stateDir, "popup-resize.42"), "");
    writeFileSync(join(stateDir, "popup-scroll.42"), "");
    writeFileSync(join(stateDir, "menagerie.json"), "{}");
    writeFileSync(join(stateDir, "status.json"), "{}");
    writeFileSync(join(stateDir, "config.json"), "{}");

    const result = cleanupPluginState(settingsPath, stateDir);

    expect(result.transientFilesRemoved).toBe(10);
    const remaining = readdirSync(stateDir).sort();
    expect(remaining).toEqual(["config.json", "menagerie.json", "status.json"]);
  });

  test("is a no-op when settings.json and state dir are both absent", () => {
    const missingSettings = join(tmpdir(), `nonexistent-${Date.now()}.json`);
    const missingState = join(tmpdir(), `nonexistent-state-${Date.now()}`);

    const result = cleanupPluginState(missingSettings, missingState);

    expect(result.statusLineRemoved).toBe(false);
    expect(result.foreignStatusLineKept).toBe(false);
    expect(result.transientFilesRemoved).toBe(0);
    expect(existsSync(missingSettings)).toBe(false);
    expect(existsSync(missingState)).toBe(false);
  });

  test("handles empty state dir without error", () => {
    writeFileSync(settingsPath, JSON.stringify({ other: "keep" }));

    const result = cleanupPluginState(settingsPath, stateDir);

    expect(result.transientFilesRemoved).toBe(0);
    expect(result.statusLineRemoved).toBe(false);
  });
});

import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { copyRuntimeApp, stableRuntimeAppDir, stableRuntimePaths } from "./runtime-app.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("stable runtime app", () => {
  test("derives all registrations below the per-user app directory", () => {
    const appDir = "/home/user/.claude-buddy/app";
    const paths = stableRuntimePaths(appDir);

    // join(), not a literal: stableRuntimePaths builds with the platform
    // separator, so a "/"-spelled literal only matches on POSIX.
    expect(paths.mcpServer).toBe(join(appDir, "server", "index.ts"));
    expect(paths.mcpLauncher).toBe(join(appDir, "server", "mcp-launcher.sh"));
    expect(paths.statusline).toBe(join(appDir, "statusline", "buddy-status.sh"));
    expect(paths.combinedStatusline).toBe(join(appDir, "statusline", "combined-status.sh"));
    expect(paths.hooks).toBe(join(appDir, "hooks"));
  });

  test("refreshes the copy and removes stale runtime files", () => {
    const root = mkdtempSync(join(tmpdir(), "coding-buddy-runtime-app-"));
    temporaryDirectories.push(root);
    for (const directory of ["core", "server", "hooks", "statusline", "scripts"]) {
      mkdirSync(join(root, directory), { recursive: true });
      writeFileSync(join(root, directory, "runtime.txt"), directory);
    }
    writeFileSync(join(root, "package.json"), "{\"name\":\"test\"}");

    const stateDir = join(root, "state");
    const appDir = copyRuntimeApp(root, stateDir);
    const stale = join(appDir, "stale.txt");
    writeFileSync(stale, "remove me");
    writeFileSync(join(root, "statusline", "runtime.txt"), "updated");

    expect(copyRuntimeApp(root, stateDir)).toBe(stableRuntimeAppDir(stateDir));
    expect(existsSync(stale)).toBe(false);
    expect(readFileSync(join(appDir, "statusline", "runtime.txt"), "utf8")).toBe("updated");
  });
});

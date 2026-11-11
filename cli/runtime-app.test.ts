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
    const paths = stableRuntimePaths("/home/user/.claude-buddy/app");

    expect(paths.mcpServer).toBe("/home/user/.claude-buddy/app/server/index.ts");
    expect(paths.mcpLauncher).toBe("/home/user/.claude-buddy/app/server/mcp-launcher.sh");
    expect(paths.statusline).toBe("/home/user/.claude-buddy/app/statusline/buddy-status.sh");
    expect(paths.combinedStatusline).toBe("/home/user/.claude-buddy/app/statusline/combined-status.sh");
    expect(paths.hooks).toBe("/home/user/.claude-buddy/app/hooks");
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

  function runtimeSource(): string {
    const root = mkdtempSync(join(tmpdir(), "coding-buddy-runtime-app-"));
    temporaryDirectories.push(root);
    for (const directory of ["core", "server", "hooks", "statusline", "scripts"]) {
      mkdirSync(join(root, directory), { recursive: true });
    }
    writeFileSync(join(root, "package.json"), "{\"name\":\"test\"}");
    return root;
  }

  test("installs the packed lockfile as bun.lock when the tarball has no bun.lock", () => {
    const root = runtimeSource();
    writeFileSync(join(root, "runtime.bun.lock"), "packed");

    const appDir = copyRuntimeApp(root, join(root, "state"));

    expect(readFileSync(join(appDir, "bun.lock"), "utf8")).toBe("packed");
  });

  test("prefers a real bun.lock over the packed copy", () => {
    const root = runtimeSource();
    writeFileSync(join(root, "bun.lock"), "checkout");
    writeFileSync(join(root, "runtime.bun.lock"), "packed");

    const appDir = copyRuntimeApp(root, join(root, "state"));

    expect(readFileSync(join(appDir, "bun.lock"), "utf8")).toBe("checkout");
  });

  test("the published package ships the lockfile under a name npm will pack", () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8"));

    expect(pkg.files).toContain("runtime.bun.lock");
    expect(pkg.files).not.toContain("bun.lock");
    expect(pkg.scripts.prepack).toContain("runtime.bun.lock");
  });
});

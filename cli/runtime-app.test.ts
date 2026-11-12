import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execFileSync } from "child_process";
import {
  copyRuntimeApp,
  installRuntimeAppAtomically,
  PREVIOUS_PREFIX,
  promoteStagedApp,
  redactSecrets,
  stableRuntimeAppDir,
  stableRuntimePaths,
  STAGING_PREFIX,
  stagingRuntimeAppDir,
  supportsTextLockfile,
} from "./runtime-app.ts";

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

  test.skipIf(!Bun.which("npm") || !Bun.which("tar"))(
    "the packed tarball carries the repo lockfile as runtime.bun.lock",
    () => {
      const repo = join(import.meta.dir, "..");
      // Pack an isolated copy so prepack and postpack never touch the checkout.
      const copy = mkdtempSync(join(tmpdir(), "coding-buddy-pack-"));
      temporaryDirectories.push(copy);
      for (const file of ["package.json", "bun.lock"]) {
        writeFileSync(join(copy, file), readFileSync(join(repo, file)));
      }
      const out = join(copy, "out");
      mkdirSync(out);

      execFileSync("npm", ["pack", "--pack-destination", out], { cwd: copy, stdio: "ignore" });
      const tarball = join(out, readdirSync(out).find((name) => name.endsWith(".tgz")) ?? "");
      execFileSync("tar", ["-xzf", tarball, "-C", out, "package/runtime.bun.lock"]);

      expect(readFileSync(join(out, "package", "runtime.bun.lock"), "utf8")).toBe(
        readFileSync(join(repo, "bun.lock"), "utf8"),
      );
      // postpack removes the copy, so a checkout never carries a stale one.
      expect(existsSync(join(copy, "runtime.bun.lock"))).toBe(false);
    },
    60_000,
  );

  test("a failed dependency install keeps the previous runtime app", () => {
    const root = runtimeSource();
    const stateDir = join(root, "state");
    writeFileSync(join(root, "server", "index.ts"), "v1");
    installRuntimeAppAtomically(root, stateDir, () => {});
    writeFileSync(join(root, "server", "index.ts"), "v2");

    expect(() =>
      installRuntimeAppAtomically(root, stateDir, () => {
        throw new Error("bun install failed");
      }),
    ).toThrow("bun install failed");

    const appDir = stableRuntimeAppDir(stateDir);
    expect(readFileSync(join(appDir, "server", "index.ts"), "utf8")).toBe("v1");
    expect(readdirSync(stateDir).filter((name) => name.startsWith(STAGING_PREFIX))).toEqual([]);
  });

  test("a successful install swaps in the new app with what the install step added", () => {
    const root = runtimeSource();
    const stateDir = join(root, "state");
    writeFileSync(join(root, "server", "index.ts"), "v1");
    installRuntimeAppAtomically(root, stateDir, () => {});
    writeFileSync(join(root, "server", "index.ts"), "v2");

    const appDir = installRuntimeAppAtomically(root, stateDir, (stagingDir) => {
      mkdirSync(join(stagingDir, "node_modules"));
      writeFileSync(join(stagingDir, "node_modules", "dep.txt"), "installed");
    });

    expect(appDir).toBe(stableRuntimeAppDir(stateDir));
    expect(readFileSync(join(appDir, "server", "index.ts"), "utf8")).toBe("v2");
    expect(readFileSync(join(appDir, "node_modules", "dep.txt"), "utf8")).toBe("installed");
    expect(readdirSync(stateDir).filter((name) => name.startsWith(STAGING_PREFIX))).toEqual([]);
  });

  test("only Bun 1.2 and newer gets the text lockfile", () => {
    expect(supportsTextLockfile("1.3.9")).toBe(true);
    expect(supportsTextLockfile("1.2.0")).toBe(true);
    expect(supportsTextLockfile("2.0.0")).toBe(true);
    expect(supportsTextLockfile("1.1.45")).toBe(false);
    expect(supportsTextLockfile("not a version")).toBe(false);
  });

  test("redacts registry credentials from tool output", () => {
    const leaked = [
      "warn: //registry.npmjs.org/:_authToken=npm_abcdefghijklmnopqrstuvwxyz0123456789",
      "Authorization: Bearer abcdef1234567890",
      "error: GET https://deploy:hunter2secret@registry.example.com/pkg - 401",
      "error: No version matching \"^7.29.14\" found",
    ].join("\n");

    const shown = redactSecrets(leaked);

    expect(shown).not.toContain("npm_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(shown).not.toContain("abcdef1234567890");
    expect(shown).not.toContain("hunter2secret");
    expect(shown).toContain("https://[redacted]@registry.example.com/pkg");
    expect(shown).toContain("_authToken=[redacted]");
    expect(shown).toContain("No version matching");
  });

  test("each install stages in its own directory", () => {
    const first = stagingRuntimeAppDir("/state");
    const second = stagingRuntimeAppDir("/state");

    expect(first).not.toBe(second);
    expect(first.startsWith(join("/state", STAGING_PREFIX))).toBe(true);
  });

  test("an install that overlaps another still ends with a complete app", () => {
    const root = runtimeSource();
    const stateDir = join(root, "state");
    writeFileSync(join(root, "server", "index.ts"), "v1");

    // The inner install starts and finishes while the outer one is still
    // installing dependencies, which is what two concurrent installers do.
    const appDir = installRuntimeAppAtomically(root, stateDir, () => {
      installRuntimeAppAtomically(root, stateDir, () => {});
    });

    expect(readFileSync(join(appDir, "server", "index.ts"), "utf8")).toBe("v1");
    expect(readdirSync(stateDir).filter((name) => name.startsWith(STAGING_PREFIX))).toEqual([]);
  });

  function stagedApp(): { stateDir: string; staging: string; appDir: string } {
    const root = runtimeSource();
    const stateDir = join(root, "state");
    const staging = join(stateDir, `${STAGING_PREFIX}test`);
    mkdirSync(join(staging, "server"), { recursive: true });
    writeFileSync(join(staging, "server", "index.ts"), "mine");
    return { stateDir, staging, appDir: stableRuntimeAppDir(stateDir) };
  }

  function leftovers(appDir: string): string[] {
    return readdirSync(join(appDir, "..")).filter(
      (name) => name.startsWith(STAGING_PREFIX) || name.startsWith(PREVIOUS_PREFIX),
    );
  }

  test("promotion retries when another installer recreates the app mid-swap", () => {
    const { staging, appDir } = stagedApp();
    let calls = 0;

    promoteStagedApp(staging, appDir, (from, to) => {
      if (from === staging) calls += 1;
      if (from === staging && calls === 1) {
        // Another installer lands between our remove and our rename.
        mkdirSync(join(to, "server"), { recursive: true });
        writeFileSync(join(to, "server", "index.ts"), "theirs");
        throw Object.assign(new Error("ENOTEMPTY"), { code: "ENOTEMPTY" });
      }
      renameSync(from, to);
    });

    expect(readFileSync(join(appDir, "server", "index.ts"), "utf8")).toBe("mine");
    expect(existsSync(staging)).toBe(false);
    expect(leftovers(appDir)).toEqual([]);
  });

  test("promotion keeps a complete app from another installer and cleans its staging", () => {
    const { staging, appDir } = stagedApp();

    promoteStagedApp(staging, appDir, (from, to) => {
      if (from !== staging) return renameSync(from, to);
      // Each time we try to move in, another installer has just landed its app.
      mkdirSync(join(to, "server"), { recursive: true });
      writeFileSync(join(to, "server", "index.ts"), "theirs");
      throw Object.assign(new Error("ENOTEMPTY"), { code: "ENOTEMPTY" });
    });

    expect(readFileSync(join(appDir, "server", "index.ts"), "utf8")).toBe("theirs");
    expect(leftovers(appDir)).toEqual([]);
  });

  test("promotion puts the previous app back when the new one cannot be moved in", () => {
    const { staging, appDir } = stagedApp();
    mkdirSync(join(appDir, "server"), { recursive: true });
    writeFileSync(join(appDir, "server", "index.ts"), "previous");

    expect(() =>
      promoteStagedApp(staging, appDir, (from, to) => {
        if (from === staging) throw Object.assign(new Error("EACCES"), { code: "EACCES" });
        renameSync(from, to);
      }),
    ).toThrow("EACCES");

    expect(readFileSync(join(appDir, "server", "index.ts"), "utf8")).toBe("previous");
    expect(leftovers(appDir)).toEqual([]);
  });

  test("promotion fails when the old app cannot be moved out of the way", () => {
    const { staging, appDir } = stagedApp();
    mkdirSync(join(appDir, "server"), { recursive: true });
    writeFileSync(join(appDir, "server", "index.ts"), "previous");

    // The old app is complete and still in place, but that is not an upgrade.
    expect(() =>
      promoteStagedApp(staging, appDir, (from, to) => {
        if (from === appDir) throw Object.assign(new Error("EBUSY"), { code: "EBUSY" });
        renameSync(from, to);
      }),
    ).toThrow("EBUSY");

    expect(readFileSync(join(appDir, "server", "index.ts"), "utf8")).toBe("previous");
    expect(leftovers(appDir)).toEqual([]);
  });

  test("when the previous app cannot be put back, the error says where it is", () => {
    const { stateDir, staging, appDir } = stagedApp();
    mkdirSync(join(appDir, "server"), { recursive: true });
    writeFileSync(join(appDir, "server", "index.ts"), "previous");

    // Moving the old app aside works once; every later rename fails, so the
    // new app cannot move in, the old one cannot move back, and retries fail.
    let moves = 0;
    let caught: Error | undefined;
    try {
      promoteStagedApp(staging, appDir, (from, to) => {
        moves += 1;
        if (moves > 1) throw Object.assign(new Error("EACCES"), { code: "EACCES" });
        renameSync(from, to);
      });
    } catch (error) {
      caught = error as Error;
    }

    const kept = readdirSync(stateDir).filter((name) => name.startsWith(PREVIOUS_PREFIX));
    expect(kept).toHaveLength(1);
    expect(caught?.message).toContain(join(stateDir, kept[0]));
    expect(readFileSync(join(stateDir, kept[0], "server", "index.ts"), "utf8")).toBe("previous");
  });

  test("promotion fails loudly, without leaving staging, when no app ends up in place", () => {
    const { staging, appDir } = stagedApp();

    expect(() =>
      promoteStagedApp(staging, appDir, () => {
        throw new Error("EACCES");
      }),
    ).toThrow("EACCES");
    expect(existsSync(staging)).toBe(false);
  });
});


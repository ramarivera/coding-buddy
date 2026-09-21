/**
 * Unit tests for server/paths.ts. The resolvers read process.env on each
 * call, so we stub CLAUDE_CONFIG_DIR per test and restore it afterwards.
 * Anything that compares against homedir() assumes the tests run on a
 * system where $HOME is set — true on Linux/macOS CI. If that invariant
 * ever breaks, drop the HOME-dependent cases and assert only the
 * env-var branches.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { homedir } from "os";
import { join } from "path";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";

import {
  buddyStateDir,
  buddyAppDir,
  findGitBash,
  claudeConfigDir,
  claudeSettingsPath,
  claudeSkillDir,
  claudeUserConfigPath,
} from "./path.ts";

const origConfigDir = process.env.CLAUDE_CONFIG_DIR;

function restoreEnv() {
  if (origConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = origConfigDir;
}

describe("claudeConfigDir", () => {
  afterEach(restoreEnv);

  test("returns $HOME/.claude when CLAUDE_CONFIG_DIR is unset", () => {
    delete process.env.CLAUDE_CONFIG_DIR;
    expect(claudeConfigDir()).toBe(join(homedir(), ".claude"));
  });

  test("returns CLAUDE_CONFIG_DIR when set", () => {
    process.env.CLAUDE_CONFIG_DIR = "/tmp/fake-profile";
    expect(claudeConfigDir()).toBe("/tmp/fake-profile");
  });

  test("treats empty CLAUDE_CONFIG_DIR as unset", () => {
    process.env.CLAUDE_CONFIG_DIR = "";
    expect(claudeConfigDir()).toBe(join(homedir(), ".claude"));
  });
});

describe("claudeSettingsPath / claudeSkillDir", () => {
  afterEach(restoreEnv);

  test("puts settings.json inside the active config dir", () => {
    process.env.CLAUDE_CONFIG_DIR = "/tmp/profile-a";
    // join(), not a "/"-spelled literal: the resolvers build paths with the
    // platform separator, so a literal only matches on POSIX.
    expect(claudeSettingsPath()).toBe(join("/tmp/profile-a", "settings.json"));
    expect(claudeSkillDir("buddy")).toBe(join("/tmp/profile-a", "skills", "buddy"));
  });

  test("falls back to ~/.claude when CLAUDE_CONFIG_DIR is unset", () => {
    delete process.env.CLAUDE_CONFIG_DIR;
    expect(claudeSettingsPath()).toBe(join(homedir(), ".claude", "settings.json"));
    expect(claudeSkillDir("buddy")).toBe(join(homedir(), ".claude", "skills", "buddy"));
  });
});

describe("claudeUserConfigPath", () => {
  let profileDir: string;

  beforeEach(() => {
    profileDir = mkdtempSync(join(tmpdir(), "claude-buddy-paths-"));
  });

  afterEach(() => {
    rmSync(profileDir, { recursive: true, force: true });
    restoreEnv();
  });

  test("prefers $CLAUDE_CONFIG_DIR/.claude.json when it exists", () => {
    process.env.CLAUDE_CONFIG_DIR = profileDir;
    const inDir = join(profileDir, ".claude.json");
    writeFileSync(inDir, "{}");
    expect(claudeUserConfigPath()).toBe(inDir);
  });

  test("points at the profile even when only $HOME/.claude.json exists (no cross-profile leak)", () => {
    process.env.CLAUDE_CONFIG_DIR = profileDir; // empty, no in-dir .claude.json
    // $HOME/.claude.json probably exists on the test runner. The
    // resolver MUST NOT fall back to it — that would let one profile
    // mutate the home-level file a different profile reads.
    expect(claudeUserConfigPath()).toBe(join(profileDir, ".claude.json"));
  });

  test("returns $HOME/.claude.json when CLAUDE_CONFIG_DIR is unset", () => {
    delete process.env.CLAUDE_CONFIG_DIR;
    expect(claudeUserConfigPath()).toBe(join(homedir(), ".claude.json"));
  });
});

describe("buddyStateDir", () => {
  afterEach(restoreEnv);

  test("CLAUDE_CONFIG_DIR puts state inside the profile dir", () => {
    process.env.CLAUDE_CONFIG_DIR = "/tmp/profile";
    expect(buddyStateDir()).toBe(join("/tmp/profile", "buddy-state"));
  });

  test("default is ~/.claude-buddy when CLAUDE_CONFIG_DIR is unset", () => {
    delete process.env.CLAUDE_CONFIG_DIR;
    expect(buddyStateDir()).toBe(join(homedir(), ".claude-buddy"));
  });
});

describe("buddyAppDir", () => {
  afterEach(restoreEnv);

  test("places the stable runtime copy below the profile state dir", () => {
    process.env.CLAUDE_CONFIG_DIR = "/tmp/profile";
    expect(buddyAppDir()).toBe(join("/tmp/profile", "buddy-state", "app"));
  });
});

/**
 * Environment and the existence check are injected, so these run the same on
 * Linux CI as on Windows.
 */
describe("findGitBash", () => {
  const programFiles = String.raw`C:\Program Files`;
  const gitBash = join(programFiles, "Git", "bin", "bash.exe");

  test("finds the default Git for Windows install", () => {
    expect(findGitBash({ ProgramFiles: programFiles }, (p) => p === gitBash)).toBe(gitBash);
  });

  test("CLAUDE_CODE_GIT_BASH_PATH wins, since Claude Code honours it too", () => {
    const custom = String.raw`D:\tools\git\bin\bash.exe`;
    expect(findGitBash({ CLAUDE_CODE_GIT_BASH_PATH: custom, ProgramFiles: programFiles }, () => true)).toBe(custom);
  });

  test("finds a per-user install under LOCALAPPDATA", () => {
    const local = String.raw`C:\Users\dev\AppData\Local`;
    const perUser = join(local, "Programs", "Git", "bin", "bash.exe");
    expect(findGitBash({ LOCALAPPDATA: local }, (p) => p === perUser)).toBe(perUser);
  });

  test("returns undefined when nothing is installed", () => {
    expect(findGitBash({ ProgramFiles: programFiles }, () => false)).toBeUndefined();
  });
});

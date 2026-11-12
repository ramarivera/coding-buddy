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
    expect(claudeSettingsPath()).toBe("/tmp/profile-a/settings.json");
    expect(claudeSkillDir("buddy")).toBe("/tmp/profile-a/skills/buddy");
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
    expect(buddyStateDir()).toBe("/tmp/profile/buddy-state");
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
    expect(buddyAppDir()).toBe("/tmp/profile/buddy-state/app");
  });
});

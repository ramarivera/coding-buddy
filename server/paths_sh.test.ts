/**
 * Smoke tests for scripts/paths.sh — asserts that the shell resolver
 * produces the same answers as server/paths.ts for each env-var
 * combination. Keeps the two in lockstep; when one is updated the
 * other must follow, and these tests catch the drift.
 */

import { describe, expect, test } from "bun:test";
import { spawnSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { homedir, tmpdir } from "os";
import { join, resolve } from "path";

const PATHS_SH = resolve(import.meta.dir, "..", "scripts", "paths.sh");

type Env = Record<string, string | null>;

/** Run `source paths.sh` in bash under the given env overrides and
 *  capture the resolved variables. `null` means "unset this var". */
function sourcePaths(overrides: Env): Record<string, string> {
  const env: Record<string, string> = {};
  // Preserve essentials so bash can start and find binaries.
  for (const k of ["HOME", "PATH", "USER"]) {
    if (process.env[k]) env[k] = process.env[k]!;
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== null) env[k] = v;
  }

  const script = `source "${PATHS_SH}"
printf 'CLAUDE_CFG_DIR=%s\\n' "$CLAUDE_CFG_DIR"
printf 'CLAUDE_SETTINGS_FILE=%s\\n' "$CLAUDE_SETTINGS_FILE"
printf 'CLAUDE_USER_CONFIG=%s\\n' "$CLAUDE_USER_CONFIG"
printf 'BUDDY_STATE_DIR=%s\\n' "$BUDDY_STATE_DIR"
printf 'BUDDY_SID=%s\\n' "$BUDDY_SID"`;

  const result = spawnSync("bash", ["-c", script], { env, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`bash exited ${result.status}: ${result.stderr}`);
  }
  const parsed: Record<string, string> = {};
  for (const line of result.stdout.split("\n").filter(Boolean)) {
    const idx = line.indexOf("=");
    parsed[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return parsed;
}

describe("scripts/paths.sh (CLAUDE_CONFIG_DIR unset)", () => {
  const env = sourcePaths({ CLAUDE_CONFIG_DIR: null });

  test("CLAUDE_CFG_DIR defaults to $HOME/.claude", () => {
    expect(env.CLAUDE_CFG_DIR).toBe(join(homedir(), ".claude"));
  });

  test("CLAUDE_SETTINGS_FILE points under the config dir", () => {
    expect(env.CLAUDE_SETTINGS_FILE).toBe(join(homedir(), ".claude", "settings.json"));
  });

  test("CLAUDE_USER_CONFIG is $HOME/.claude.json", () => {
    expect(env.CLAUDE_USER_CONFIG).toBe(join(homedir(), ".claude.json"));
  });

  test("BUDDY_STATE_DIR defaults to $HOME/.claude-buddy", () => {
    expect(env.BUDDY_STATE_DIR).toBe(join(homedir(), ".claude-buddy"));
  });
});

describe("scripts/paths.sh (CLAUDE_CONFIG_DIR set)", () => {
  test("all paths live under $CLAUDE_CONFIG_DIR", () => {
    const profile = mkdtempSync(join(tmpdir(), "claude-buddy-sh-"));
    try {
      const env = sourcePaths({ CLAUDE_CONFIG_DIR: profile });
      expect(env.CLAUDE_CFG_DIR).toBe(profile);
      expect(env.CLAUDE_SETTINGS_FILE).toBe(join(profile, "settings.json"));
      expect(env.BUDDY_STATE_DIR).toBe(join(profile, "buddy-state"));
    } finally {
      rmSync(profile, { recursive: true, force: true });
    }
  });

  test("CLAUDE_USER_CONFIG prefers $CLAUDE_CONFIG_DIR/.claude.json when present", () => {
    const profile = mkdtempSync(join(tmpdir(), "claude-buddy-sh-"));
    try {
      writeFileSync(join(profile, ".claude.json"), "{}");
      const env = sourcePaths({ CLAUDE_CONFIG_DIR: profile });
      expect(env.CLAUDE_USER_CONFIG).toBe(join(profile, ".claude.json"));
    } finally {
      rmSync(profile, { recursive: true, force: true });
    }
  });

  test("CLAUDE_USER_CONFIG points at the profile even when only $HOME/.claude.json exists (no cross-profile leak)", () => {
    const profile = mkdtempSync(join(tmpdir(), "claude-buddy-sh-"));
    // HOME is a real dir where $HOME/.claude.json probably exists on the
    // test runner. The resolver MUST NOT fall back to it — otherwise
    // enabling buddy in a profile could mutate the home-level file.
    try {
      const env = sourcePaths({ CLAUDE_CONFIG_DIR: profile });
      expect(env.CLAUDE_USER_CONFIG).toBe(join(profile, ".claude.json"));
    } finally {
      rmSync(profile, { recursive: true, force: true });
    }
  });
});

describe("scripts/paths.sh shared identity opt-in", () => {
  test("uses the shared state root without breaking Claude config paths", () => {
    const env = sourcePaths({
      CODING_BUDDY_USER_ID: "shared-user",
      CLAUDE_CONFIG_DIR: "/tmp/profile",
    });

    expect(env.CLAUDE_CFG_DIR).toBe("/tmp/profile");
    expect(env.CLAUDE_SETTINGS_FILE).toBe("/tmp/profile/settings.json");
    expect(env.BUDDY_STATE_DIR).toBe(join(homedir(), ".coding-buddy", "shared"));
  });

  test("honors an explicit shared state root", () => {
    const env = sourcePaths({
      CODING_BUDDY_USER_ID: "shared-user",
      CODING_BUDDY_STATE_DIR: "/tmp/shared-buddy",
      CLAUDE_CONFIG_DIR: "/tmp/profile",
    });

    expect(env.BUDDY_STATE_DIR).toBe("/tmp/shared-buddy");
  });
});

describe("scripts/paths.sh BUDDY_SID resolution", () => {
  test("uses CLAUDE_CODE_SESSION_ID (first 8 chars) when set", () => {
    const env = sourcePaths({
      CLAUDE_CODE_SESSION_ID: "6aca859b-f8eb-4862-a378-19c6f5f549af",
      TMUX_PANE: null,
    });
    expect(env.BUDDY_SID).toBe("6aca859b");
  });

  test("CLAUDE_CODE_SESSION_ID wins over TMUX_PANE", () => {
    const env = sourcePaths({
      CLAUDE_CODE_SESSION_ID: "abcdef12-3456-7890-abcd-ef1234567890",
      TMUX_PANE: "%7",
    });
    expect(env.BUDDY_SID).toBe("abcdef12");
  });

  test("falls back to TMUX_PANE (sans leading %) when no Claude Code session", () => {
    const env = sourcePaths({
      CLAUDE_CODE_SESSION_ID: null,
      TMUX_PANE: "%42",
    });
    expect(env.BUDDY_SID).toBe("42");
  });

  test("falls back to 'default' when neither is set", () => {
    const env = sourcePaths({
      CLAUDE_CODE_SESSION_ID: null,
      TMUX_PANE: null,
    });
    expect(env.BUDDY_SID).toBe("default");
  });
});

// Path utilities and helpers
//
// Two related concerns live here:
//   1. Path normalization (Windows compat) — toUnixPath().
//   2. Resolution of Claude Code config / state paths — claudeConfigDir,
//      claudeSettingsPath, claudeSkillDir, claudeUserConfigPath, buddyStateDir.
//      These honor CLAUDE_CONFIG_DIR so coding-buddy works with Claude Code's
//      multi-account layout (one CLAUDE_CONFIG_DIR per profile).
//
// The shell counterpart of (2) lives in scripts/paths.sh and MUST stay in sync.

import { join } from "path";
import { homedir } from "os";
import { sharedStateDir } from "../core/identity.ts";

// ─── (1) Path normalization ─────────────────────────────────────────────────

// Node's path.join() produces backslash paths on Windows, which bash treats as
// escape sequences, stripping them entirely (e.g. C:\Users -> C:Users).
// Use forward slashes in all paths written to config files.

/**
 * Converts all backslashes in a file path to forward slashes, producing a Unix-style path.
 *
 * @param p - The file path to convert.
 * @returns The converted path with forward slashes.
 */
export function toUnixPath(p: string): string {
  return p.replace(/\\/g, "/");
}

// ─── (2) Claude config / state path resolvers ───────────────────────────────
//
// Resolution rules:
//   - If CLAUDE_CONFIG_DIR is set: everything lives under
//     $CLAUDE_CONFIG_DIR/. .claude.json is preferred inside the config dir
//     when present, falling back to $HOME/.claude.json for setups that
//     keep it at $HOME. Buddy state goes to $CLAUDE_CONFIG_DIR/buddy-state.
//   - If CLAUDE_CONFIG_DIR is NOT set: the single-profile defaults —
//     ~/.claude/, ~/.claude.json, ~/.claude-buddy/.

function envDir(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export function claudeConfigDir(): string {
  return envDir("CLAUDE_CONFIG_DIR") ?? join(homedir(), ".claude");
}

export function claudeSettingsPath(): string {
  return join(claudeConfigDir(), "settings.json");
}

export function claudeSkillDir(name: string): string {
  return join(claudeConfigDir(), "skills", name);
}

/**
 * Resolve the path to Claude Code's user-config file (.claude.json).
 *
 * When CLAUDE_CONFIG_DIR is set the file lives inside it — we always
 * resolve there so every read and write stays profile-scoped. Falling
 * back to $HOME/.claude.json when the in-dir file is missing would
 * break that isolation: installs in one profile could mutate the
 * home-level file that a different profile reads. If the in-dir file
 * doesn't exist yet, callers surface a clear "Start Claude Code once
 * first" preflight error instead of silently writing to $HOME.
 *
 * When CLAUDE_CONFIG_DIR is unset we use $HOME/.claude.json — the
 * single-profile default.
 */
export function claudeUserConfigPath(): string {
  const cfgDir = envDir("CLAUDE_CONFIG_DIR");
  if (cfgDir) return join(cfgDir, ".claude.json");
  return join(homedir(), ".claude.json");
}

export function buddyStateDir(): string {
  const shared = sharedStateDir();
  if (shared) return shared;
  const cfgDir = envDir("CLAUDE_CONFIG_DIR");
  if (cfgDir) return join(cfgDir, "buddy-state");
  return join(homedir(), ".claude-buddy");
}

/** Stable per-profile runtime copy used by installer registrations. */
export function buddyAppDir(): string {
  return join(buddyStateDir(), "app");
}

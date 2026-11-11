import { cpSync, existsSync, mkdirSync, rmSync, renameSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

export const RUNTIME_DIRECTORIES = [
  "core",
  "server",
  "hooks",
  "statusline",
  "scripts",
] as const;

export const RUNTIME_FILES = ["package.json", "bun.lock"] as const;

/**
 * npm never packs a file named bun.lock, so the published tarball carries the
 * lockfile as runtime.bun.lock (written by the prepack script). A git checkout
 * has the real bun.lock instead.
 */
export const PACKED_LOCKFILE = "runtime.bun.lock";

export function stableRuntimeAppDir(stateDir: string): string {
  return join(stateDir, "app");
}

export function stableRuntimePaths(appDir: string) {
  return {
    mcpServer: join(appDir, "server", "index.ts"),
    mcpLauncher: join(appDir, "server", "mcp-launcher.sh"),
    statusline: join(appDir, "statusline", "buddy-status.sh"),
    combinedStatusline: join(appDir, "statusline", "combined-status.sh"),
    hooks: join(appDir, "hooks"),
  };
}

export const STAGING_PREFIX = "app.staging-";

/**
 * A staging directory unique to this install, so two installers running at
 * once (a manual run and a post-apply hook, say) never delete each other's
 * in-progress dependency install.
 */
export function stagingRuntimeAppDir(stateDir: string): string {
  return join(stateDir, `${STAGING_PREFIX}${process.pid}-${randomUUID().slice(0, 8)}`);
}

/**
 * Write a fresh runtime copy into `targetDir`, the stable app directory by
 * default. The directory is owned by the installer, so removing it first also
 * removes files deleted by an upgrade.
 */
export function copyRuntimeApp(
  sourceRoot: string,
  stateDir: string,
  targetDir: string = stableRuntimeAppDir(stateDir),
): string {
  const appDir = targetDir;
  rmSync(appDir, { recursive: true, force: true });
  mkdirSync(appDir, { recursive: true });

  for (const directory of RUNTIME_DIRECTORIES) {
    const source = join(sourceRoot, directory);
    if (!existsSync(source)) throw new Error(`Missing runtime directory: ${source}`);
    cpSync(source, join(appDir, directory), { recursive: true, force: true });
  }

  for (const file of RUNTIME_FILES) {
    const source = join(sourceRoot, file);
    if (existsSync(source)) cpSync(source, join(appDir, file), { force: true });
  }

  const packedLock = join(sourceRoot, PACKED_LOCKFILE);
  const appLock = join(appDir, "bun.lock");
  if (!existsSync(appLock) && existsSync(packedLock)) cpSync(packedLock, appLock);

  return appDir;
}

/**
 * Build the runtime app next to the live one and swap it in only after
 * `prepare` (the dependency install) succeeds. A failed install then leaves
 * the previous working app, and the MCP registration that points at it,
 * untouched.
 */
export function installRuntimeAppAtomically(
  sourceRoot: string,
  stateDir: string,
  prepare: (stagingDir: string) => void,
): string {
  const appDir = stableRuntimeAppDir(stateDir);
  const stagingDir = stagingRuntimeAppDir(stateDir);
  try {
    copyRuntimeApp(sourceRoot, stateDir, stagingDir);
    prepare(stagingDir);
  } catch (error) {
    rmSync(stagingDir, { recursive: true, force: true });
    throw error;
  }
  promoteStagedApp(stagingDir, appDir);
  return appDir;
}

const PROMOTE_ATTEMPTS = 3;
export const PREVIOUS_PREFIX = "app.previous-";

/**
 * Swap the staged app into place without ever leaving the user with no app.
 *
 * The live app is moved aside, not deleted, and is moved back if the staged
 * app cannot take its place. Another installer can recreate `appDir` in the
 * middle of the swap, so the swap retries; if it still cannot rename and a
 * complete app from that other installer is in place, that app is kept.
 * Staging and moved-aside copies are removed on every path.
 */
export function promoteStagedApp(
  stagingDir: string,
  appDir: string,
  rename: (from: string, to: string) => void = renameSync,
): void {
  const backups: string[] = [];
  let lastError: unknown;
  // True only when our move-in failed because an app we did not put there was
  // in the way: another installer finished between our two renames.
  let displacedByOther = false;

  for (let attempt = 0; attempt < PROMOTE_ATTEMPTS; attempt++) {
    const backup = `${appDir}.previous-${process.pid}-${randomUUID().slice(0, 8)}`;
    let movedAside = false;
    let promoting = false;
    displacedByOther = false;
    try {
      if (existsSync(appDir)) {
        backups.push(backup);
        rename(appDir, backup);
        movedAside = true;
      }
      promoting = true;
      rename(stagingDir, appDir);
      for (const dir of backups) rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      displacedByOther = promoting && existsSync(appDir);
      if (movedAside && !existsSync(appDir)) {
        try {
          rename(backup, appDir);
        } catch {
          // Leave the moved-aside copy where it is; the error below names it.
          backups.splice(backups.indexOf(backup), 1);
          lastError = new Error(
            `Could not install the new runtime app or put the previous one back. The previous app is at ${backup}.`,
            { cause: error },
          );
        }
      }
    }
  }

  rmSync(stagingDir, { recursive: true, force: true });
  for (const dir of backups) rmSync(dir, { recursive: true, force: true });
  // Another installer's complete app is in place: keep it. Every other
  // failure, including never getting the old app out of the way, is an error.
  if (displacedByOther && existsSync(stableRuntimePaths(appDir).mcpServer)) return;
  throw lastError;
}

/**
 * bun.lock is Bun's text lockfile, which Bun reads from 1.2.0 on. Older Bun
 * rejects it under --frozen-lockfile, so the installer drops the lockfile for
 * those versions and installs unpinned, as it did before the lockfile shipped.
 */
export function supportsTextLockfile(bunVersion: string): boolean {
  const match = /^(\d+)\.(\d+)\./.exec(bunVersion.trim());
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 1 || (major === 1 && minor >= 2);
}

/**
 * Strip registry credentials from tool output before it is shown. Bun before
 * 1.1.34 could echo an .npmrc token in a warning.
 */
export function redactSecrets(text: string): string {
  return text
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, "$1[redacted]@")
    .replace(/(_authToken|_auth|_password)\s*=\s*\S+/gi, "$1=[redacted]")
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/g, "$1 [redacted]")
    .replace(/\bnpm_[A-Za-z0-9]{20,}\b/g, "[redacted]");
}


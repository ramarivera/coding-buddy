import { cpSync, existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

export const RUNTIME_DIRECTORIES = [
  "core",
  "server",
  "hooks",
  "statusline",
  "scripts",
] as const;

export const RUNTIME_FILES = ["package.json", "bun.lock"] as const;

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

/**
 * Replace the stable runtime copy. The app directory is owned by the
 * installer, so removing it first also removes files deleted by an upgrade.
 */
export function copyRuntimeApp(sourceRoot: string, stateDir: string): string {
  const appDir = stableRuntimeAppDir(stateDir);
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

  return appDir;
}

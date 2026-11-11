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

/** CLI entry points the /buddy skill runs; they import only core/ and server/. */
export const RUNTIME_CLI_FILES = ["cli/buddy.ts", "cli/pick.ts"] as const;

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
    dispatcher: join(appDir, "cli", "buddy.ts"),
    picker: join(appDir, "cli", "pick.ts"),
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

  mkdirSync(join(appDir, "cli"), { recursive: true });
  for (const file of RUNTIME_CLI_FILES) {
    const source = join(sourceRoot, file);
    if (!existsSync(source)) throw new Error(`Missing runtime file: ${source}`);
    cpSync(source, join(appDir, file), { force: true });
  }

  return appDir;
}

/**
 * Point a manually installed SKILL.md at the stable runtime copy. Plugin
 * installs get ${CLAUDE_PLUGIN_ROOT} from Claude Code; the manual install has
 * none, and the git checkout may be deleted later, so use the app directory.
 * The path lands inside a double-quoted shell string, so escape \ " $ `.
 */
export function renderInstalledSkill(skill: string, appDir: string): string {
  const shellRoot = appDir.replace(/[\\"$`]/g, "\\$&");
  return skill.replaceAll("${CLAUDE_PLUGIN_ROOT}", () => shellRoot);
}

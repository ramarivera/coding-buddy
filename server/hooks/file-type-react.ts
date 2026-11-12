#!/usr/bin/env bun

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { fileReactionPool } from "./reaction-data.ts";
import {
  fileExists,
  isOnCooldown,
  nonNegativeInteger,
  parseHookInput,
  pickRandom,
  readJsonFile,
  readStdin,
  resolveHookSessionId,
  resolveHookStateDir,
  type HookRuntime,
} from "./common.ts";

interface BuddyStatus {
  muted?: unknown;
  species?: unknown;
  reaction?: unknown;
  [key: string]: unknown;
}

interface FileConfig {
  commentCooldown?: unknown;
}

export interface FileTypeReactResult {
  fileType?: string;
  reaction?: string;
  updated: boolean;
}

const FILE_TYPE_PATTERNS: ReadonlyArray<readonly [string, string]> = [
  ["readme", "*/README*|*/CHANGELOG*|*/CONTRIBUTING*|*/LICENSE*"],
  ["package-file", "*/package.json|*/Cargo.toml|*/go.mod|*/go.sum|*/pyproject.toml|*/requirements*.txt"],
  ["ci-file", "*/.github/workflows/*|*/Jenkinsfile*|*/.gitlab-ci*|*.ci.yml|*.ci.yaml"],
  ["gitignore", "*/.gitignore|*/.dockerignore|*/.eslintignore|*/.prettierignore|.gitignore|.dockerignore|.eslintignore|.prettierignore"],
  ["env-file", "*/.env*|.env*"],
  ["makefile", "*/Makefile*|Makefile*|*.mk"],
  ["docker-file", "*/Dockerfile*|Dockerfile*|*/docker-compose*|docker-compose*|*.dockerfile"],
  ["regex-file", "*.regex|*.pattern"],
  ["css-file", "*.css|*.scss|*.less|*.sass"],
  ["sql-file", "*.sql|*migration*"],
  ["lock-file", "*.lock|*/package-lock.json|*/bun.lockb|*/yarn.lock|*/pnpm-lock.yaml"],
  ["test-file", "*.test.*|*.spec.*|*_test.*|*test_*"],
  ["doc-file", "*.md|*.rst|*.txt|*.adoc"],
  ["config-file", "*.json|*.yaml|*.yml|*.toml|*.ini|*.conf"],
  ["binary-file", "*.png|*.jpg|*.gif|*.woff*|*.ico|*.exe|*.so|*.dylib|*.bin"],
  ["proto-file", "*.proto|*.graphql|*.gql"],
  ["lang-python", "*.py"],
  ["lang-typescript", "*.ts|*.tsx"],
  ["lang-javascript", "*.js|*.jsx"],
  ["lang-rust", "*.rs"],
  ["lang-go", "*.go"],
  ["lang-java", "*.java"],
  ["lang-ruby", "*.rb"],
  ["lang-php", "*.php"],
  ["lang-c", "*.c|*.h"],
  ["lang-cpp", "*.cpp|*.hpp"],
  ["lang-swift", "*.swift"],
  ["lang-kotlin", "*.kt"],
  ["lang-haskell", "*.hs"],
  ["lang-elixir", "*.ex|*.exs"],
  ["lang-zig", "*.zig"],
];

function shellGlob(pattern: string): RegExp {
  let source = "^";
  for (const character of pattern) {
    if (character === "*") source += ".*";
    else if (character === "?") source += ".";
    else source += character.replace(/[\\^$.*+()[\]{}|]/g, "\\$&");
  }
  return new RegExp(`${source}$`);
}

function matchesAnyPattern(path: string, patterns: string): boolean {
  return patterns.split("|").some((pattern) => shellGlob(pattern).test(path));
}

export function fileTypeForPath(filePath: string): string {
  for (const [fileType, patterns] of FILE_TYPE_PATTERNS) {
    if (matchesAnyPattern(filePath, patterns)) return fileType;
  }
  return "";
}

function textValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function handleFileTypeReact(rawInput: string, runtime: HookRuntime = {}): FileTypeReactResult {
  const stateDir = resolveHookStateDir(runtime);
  const statusFile = join(stateDir, "status.json");
  if (!fileExists(statusFile)) return { updated: false };

  const config = readJsonFile<FileConfig>(join(stateDir, "config.json")) ?? {};
  const cooldown = nonNegativeInteger(config.commentCooldown, 30);
  const sid = resolveHookSessionId(runtime);
  const now = runtime.now?.() ?? Date.now();
  if (isOnCooldown(join(stateDir, `.last_reaction.${sid}`), cooldown, now)) {
    return { updated: false };
  }

  const parsedStatus = readJsonFile<BuddyStatus>(statusFile);
  const status = parsedStatus ?? {};
  if (status.muted === true || status.muted === "true") return { updated: false };

  const input = parseHookInput(rawInput);
  if (!input) return { updated: false };
  const filePath = textValue(input.file_path);
  if (!filePath) return { updated: false };

  if ((runtime.random?.() ?? Math.random()) * 100 >= 15) return { updated: false };

  let fileType = fileTypeForPath(filePath);
  if (!fileType) return { updated: false };
  if (fileType === "lang-javascript") fileType = "lang-typescript";

  const species = textValue(status.species) || "blob";
  const reaction = pickRandom(fileReactionPool(species, fileType), runtime);
  if (!reaction) return { updated: false };

  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, `.last_reaction.${sid}`), String(Math.floor(now / 1000)));
  writeFileSync(
    join(stateDir, `reaction.${sid}.json`),
    JSON.stringify({ reaction, timestamp: Math.floor(now / 1000) * 1000, reason: fileType, source: "fallback" }),
  );
  if (parsedStatus) writeFileSync(statusFile, JSON.stringify({ ...status, reaction }, null, 2));

  return { fileType, reaction, updated: true };
}

if (import.meta.main) {
  try {
    handleFileTypeReact(await readStdin());
  } catch {
    // Claude Code hooks must never fail the turn.
  }
  process.exit(0);
}

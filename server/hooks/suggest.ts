#!/usr/bin/env bun

import { join } from "path";
import {
  defaultSpawnDetached,
  fileExists,
  isOnCooldown,
  nonNegativeInteger,
  parseHookInput,
  readJsonFile,
  readStdin,
  resolveHookStateDir,
  stringField,
  type HookRuntime,
} from "./common.ts";

interface SuggestConfig {
  suggestionCooldown?: unknown;
  suggestionsEnabled?: unknown;
}

export interface SuggestHookResult {
  checked: boolean;
}

export function handleSuggest(rawInput: string, runtime: HookRuntime = {}): SuggestHookResult {
  const stateDir = resolveHookStateDir(runtime);
  const configFile = join(stateDir, "config.json");
  if (!fileExists(configFile)) return { checked: false };

  const config = readJsonFile<SuggestConfig>(configFile) ?? {};
  if (config.suggestionsEnabled === false || config.suggestionsEnabled === "false") {
    return { checked: false };
  }

  const now = runtime.now?.() ?? Date.now();
  const cooldown = nonNegativeInteger(config.suggestionCooldown, 180);
  if (isOnCooldown(join(stateDir, ".last_suggestion"), cooldown, now)) {
    return { checked: false };
  }

  const input = parseHookInput(rawInput);
  if (!input) return { checked: false };

  const assistantMessage = stringField(input, "last_assistant_message");
  if (!assistantMessage) return { checked: false };

  const spawnDetached = runtime.spawnDetached ?? defaultSpawnDetached(runtime);
  spawnDetached("server/check-suggestions.ts", [JSON.stringify(assistantMessage)]);
  return { checked: true };
}

if (import.meta.main) {
  try {
    handleSuggest(await readStdin());
  } catch {
    // Claude Code hooks must never fail the turn.
  }
  process.exit(0);
}

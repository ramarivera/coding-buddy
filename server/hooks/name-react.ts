#!/usr/bin/env bun

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import {
  DEFAULT_NAME_REACTIONS,
  NAME_REACTION_POOLS,
} from "./reaction-data.ts";
import {
  fileExists,
  parseHookInput,
  pickRandom,
  readJsonFile,
  readStdin,
  resolveHookSessionId,
  resolveHookStateDir,
  type JsonObject,
  type HookRuntime,
} from "./common.ts";

interface BuddyStatus {
  muted?: unknown;
  name?: unknown;
  species?: unknown;
  reaction?: unknown;
  [key: string]: unknown;
}

export interface NameReactResult {
  reaction?: string;
  updated: boolean;
}

function promptFromInput(input: JsonObject): string {
  const direct = input.prompt ?? input.message ?? input.user_message;
  if (direct !== undefined && direct !== null) {
    return typeof direct === "string" ? direct : String(direct);
  }

  const messages = input.messages;
  if (!Array.isArray(messages) || messages.length === 0) return "";
  const content = (messages[messages.length - 1] as JsonObject | null)?.content;
  if (Array.isArray(content)) {
    const first = content[0];
    return first && typeof first === "object" ? String((first as JsonObject).text ?? "") : "";
  }
  return typeof content === "string" ? content : "";
}

export function hasNameMention(prompt: string, name: string): boolean {
  if (!name) return false;
  try {
    return new RegExp(`(^|[^a-zA-Z])${name}([^a-zA-Z]|$)`, "i").test(prompt);
  } catch {
    return false;
  }
}

export function handleNameReact(rawInput: string, runtime: HookRuntime = {}): NameReactResult {
  const stateDir = resolveHookStateDir(runtime);
  const statusFile = join(stateDir, "status.json");
  if (!fileExists(statusFile)) return { updated: false };

  const input = parseHookInput(rawInput);
  if (!input) return { updated: false };
  const prompt = promptFromInput(input);
  if (!prompt) return { updated: false };

  const parsedStatus = readJsonFile<BuddyStatus>(statusFile);
  const status = parsedStatus ?? {};
  const name = typeof status.name === "string" ? status.name : "";
  if (!hasNameMention(prompt, name)) return { updated: false };
  if (status.muted === true || status.muted === "true") return { updated: false };

  const species = typeof status.species === "string" ? status.species : "blob";
  const reaction = pickRandom(NAME_REACTION_POOLS[species] ?? DEFAULT_NAME_REACTIONS, runtime);
  if (!reaction) return { updated: false };

  const now = runtime.now?.() ?? Date.now();
  const sid = resolveHookSessionId(runtime);
  mkdirSync(stateDir, { recursive: true });
  if (parsedStatus) writeFileSync(statusFile, JSON.stringify({ ...status, reaction }, null, 2));
  writeFileSync(
    join(stateDir, `reaction.${sid}.json`),
    JSON.stringify({ reaction, timestamp: Math.floor(now / 1000) * 1000, reason: "name", source: "fallback" }),
  );

  return { reaction, updated: true };
}

if (import.meta.main) {
  try {
    handleNameReact(await readStdin());
  } catch {
    // Claude Code hooks must never fail the turn.
  }
  process.exit(0);
}

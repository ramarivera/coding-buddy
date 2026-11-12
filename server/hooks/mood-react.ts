#!/usr/bin/env bun

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { moodReactionPool } from "./reaction-data.ts";
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
  stringField,
  type HookRuntime,
} from "./common.ts";

interface BuddyStatus {
  muted?: unknown;
  species?: unknown;
  reaction?: unknown;
  [key: string]: unknown;
}

interface MoodConfig {
  moodCooldown?: unknown;
}

interface Events {
  [key: string]: unknown;
}

export interface MoodReactResult {
  mood?: "frustrated" | "happy" | "stuck";
  reaction?: string;
  updated: boolean;
}

const MOOD_PATTERNS: ReadonlyArray<readonly [MoodReactResult["mood"], RegExp]> = [
  ["frustrated", /\bwtf\b|\bugh\b|\bstupid\b|\bbroken\b|why won.?t|\bcome on\b|\bseriously\b|\bdamn\b|\bhell\b|this sucks|hate this|\bgrr\b|\bargh\b|\bannoying\b|\bfrustrat\b|\bterrible\b|\bhorrible\b|\bworst\b/i],
  ["happy", /\bnice!?\b|\bworks!?\b|\bawesome\b|\bperfect\b|\bgreat\b|love it|\byay\b|\bsweet\b|\bbeautiful\b|\bamazing\b|hell yes|nailed it|fixed it|\bhell yeah\b|\bfantastic\b/i],
  ["stuck", /\bstuck\b|\bhelp\b|\bconfused\b|don.?t understand|how do i\b|what does\b|why is\b|i can.?t\b|no idea|\blost\b|\bclueless\b|\bbaffled\b|\bpuzzled\b/i],
];

export function moodForPrompt(prompt: string): MoodReactResult["mood"] {
  return MOOD_PATTERNS.find(([, pattern]) => pattern.test(prompt))?.[0];
}

function incrementEvent(stateDir: string, key: string): void {
  const eventsFile = join(stateDir, "events.json");
  const parsedEvents = readJsonFile<Events>(eventsFile);
  if (!parsedEvents && fileExists(eventsFile)) return;
  const events = parsedEvents ?? {};
  events[key] = typeof events[key] === "number" ? Number(events[key]) + 1 : 1;
  writeFileSync(eventsFile, JSON.stringify(events, null, 2));
}

export function handleMoodReact(rawInput: string, runtime: HookRuntime = {}): MoodReactResult {
  const stateDir = resolveHookStateDir(runtime);
  const statusFile = join(stateDir, "status.json");
  if (!fileExists(statusFile)) return { updated: false };

  const config = readJsonFile<MoodConfig>(join(stateDir, "config.json")) ?? {};
  const cooldown = nonNegativeInteger(config.moodCooldown, 60);
  const sid = resolveHookSessionId(runtime);
  const now = runtime.now?.() ?? Date.now();
  if (isOnCooldown(join(stateDir, `.last_mood.${sid}`), cooldown, now)) {
    return { updated: false };
  }

  const input = parseHookInput(rawInput);
  if (!input) return { updated: false };
  const prompt = stringField(input, "prompt");
  if (!prompt) return { updated: false };

  const parsedStatus = readJsonFile<BuddyStatus>(statusFile);
  const status = parsedStatus ?? {};
  if (status.muted === true || status.muted === "true") return { updated: false };

  const mood = moodForPrompt(prompt);
  if (!mood) return { updated: false };
  const species = typeof status.species === "string" ? status.species : "blob";
  const reaction = pickRandom(moodReactionPool(species, mood), runtime);
  if (!reaction) return { updated: false };

  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, `.last_mood.${sid}`), String(Math.floor(now / 1000)));
  writeFileSync(
    join(stateDir, `reaction.${sid}.json`),
    JSON.stringify({ reaction, timestamp: Math.floor(now / 1000) * 1000, reason: mood, source: "fallback" }),
  );
  if (parsedStatus) writeFileSync(statusFile, JSON.stringify({ ...status, reaction }, null, 2));
  incrementEvent(stateDir, `mood_${mood}`);

  return { mood, reaction, updated: true };
}

if (import.meta.main) {
  try {
    handleMoodReact(await readStdin());
  } catch {
    // Claude Code hooks must never fail the turn.
  }
  process.exit(0);
}

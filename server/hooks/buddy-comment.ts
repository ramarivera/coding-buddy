#!/usr/bin/env bun

import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { join } from "path";
import { reactionPool } from "./reaction-data.ts";
import {
  defaultSpawnDetached,
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

interface BuddyConfig {
  commentCooldown?: unknown;
}

interface Events {
  turns?: number;
  [key: string]: unknown;
}

interface BuddyStatus {
  species?: unknown;
  [key: string]: unknown;
}

interface ReactionFile {
  source?: string;
  timestamp?: number;
  [key: string]: unknown;
}

const BUDDY_COMMENT_PATTERN = /<!--\s*buddy:\s*([\s\S]*?)\s*-->/g;

/**
 * Provenance of the reaction the hook wrote. Mirrors server/state.ts
 * `ReactionSource`; loaded as `none` on legacy files without the field.
 */
// "tool" is returned when a buddy_react reaction was adopted rather than
// written by this hook; it mirrors server/state.ts's ReactionSource.
export type ReactionSource = "tool" | "comment" | "fallback" | "none";

export interface BuddyCommentResult {
  comment?: string;
  /** What produced the bubble. `"none"` means the hook ran but wrote nothing. */
  source: ReactionSource;
  updated: boolean;
}

export function extractBuddyComment(message: string): string {
  let comment = "";
  for (const match of message.matchAll(BUDDY_COMMENT_PATTERN)) {
    const candidate = match[1]?.trim();
    if (candidate) comment = candidate;
  }
  return comment;
}

/**
 * Tolerate tool-stamped timestamps that are slightly in the future (NTP
 * step, container/host skew, network-mounted state dir). Larger drifts
 * are treated as clock-skewed garbage and the hook falls through to
 * the comment / pool branch.
 */
const FUTURE_TIMESTAMP_TOLERANCE_MS = 60_000;

function pickTurnFallback(
  species: string,
  runtime: HookRuntime,
): string | undefined {
  // The hook context has no stat-modifier inputs; pick from the canned
  // pool directly rather than calling server/reactions.ts `getReaction`,
  // which is reserved for the MCP server's tool-call path. This mirrors
  // the file-type-react / mood-react / react hook convention.
  const pool = reactionPool(species, "turn");
  if (pool.length === 0) return undefined;
  return pickRandom(pool, runtime);
}

function readSpeciesFromStatus(stateDir: string): string {
  const status = readJsonFile<BuddyStatus>(join(stateDir, "status.json"));
  return typeof status?.species === "string" && status.species.length > 0
    ? status.species
    : "blob";
}

/** Atomic write — tmp + rename. */
function atomicWriteJson(path: string, value: unknown): void {
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, path);
}

function atomicWriteTimestamp(path: string, nowMs: number): void {
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, String(Math.floor(nowMs / 1000)));
  renameSync(tmp, path);
}

function readTimestampSeconds(path: string): number {
  try {
    const v = Number.parseInt(readFileSync(path, "utf8").trim(), 10);
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

/**
 * Did `buddy_react` fire during the current turn?
 *
 * The Stop hook is the only place that knows turn boundaries. After each
 * Stop hook run, we stamp the wall-clock time into
 * `.last_stop_hook.<sid>` (seconds). A tool-author ed reaction whose
 * timestamp is more recent than the LAST Stop hook run is by definition
 * from this turn; leave it alone.
 *
 * Wall-clock 60 s freshness windows lose tool reactions on agentic
 * turns of 90 s–5 min, which are ordinary. This sentinel scales with
 * turn length, not elapsed time.
 *
 * Clock-skew guard: a tool timestamp implausibly in the future (beyond
 * `FUTURE_TIMESTAMP_TOLERANCE_MS`) is treated as garbage and we fall
 * through to the comment / pool branch. A future-dated `lastStopRun`
 * is clamped to `now` so a skewed clock on a prior run does not poison
 * the comparison.
 */
/**
 * How long after a stop marker a tool reaction still counts as "this turn".
 *
 * The Stop hook can legitimately fire more than once per turn — duplicate
 * registrations accumulate in settings.json, and one dogfooding machine was
 * observed with EIGHT Stop entries. Without this grace window the first
 * invocation adopts the buddy_react reaction and stamps the marker, and every
 * subsequent invocation then judges that same reaction stale and overwrites
 * the bubble with a canned pool line. The user only ever sees the last write.
 */
const SAME_TURN_GRACE_MS = 10_000;

/**
 * Hard ceiling on how old an adopted tool reaction may be.
 *
 * A brand-new session has no stop marker, so `readTimestampSeconds` returns 0
 * and every positive timestamp would otherwise look "fresh" — letting a
 * leftover reaction from an unrelated session surface on the first turn.
 * Bounded to the statusline's default reactionTTL: never adopt something the
 * statusline would already treat as expired.
 */
const MAX_ADOPTION_AGE_MS = 900_000;

function isFreshToolReaction(
  candidate: ReactionFile | null,
  stopMarkerPath: string,
  nowMs: number,
): boolean {
  if (!candidate || candidate.source !== "tool") return false;
  const ts = typeof candidate.timestamp === "number" ? candidate.timestamp : 0;
  if (ts <= 0) return false;
  if (ts > nowMs + FUTURE_TIMESTAMP_TOLERANCE_MS) return false;
  if (nowMs - ts > MAX_ADOPTION_AGE_MS) return false;
  const lastStopSec = readTimestampSeconds(stopMarkerPath);
  const effectiveLastStopMs = Math.min(lastStopSec * 1000, nowMs);
  return ts > effectiveLastStopMs - SAME_TURN_GRACE_MS;
}

/**
 * The MCP server and this hook do not always agree on the session id: the
 * server is long-lived and resolves BUDDY_SID once at launch, while the hook
 * and the statusline resolve it per invocation. When they diverge,
 * `buddy_react` writes a real model-authored reaction into a file nothing
 * renders, this hook sees an empty file for *its* session, and overwrites the
 * bubble with a canned pool line — which looks exactly like the reactions
 * being fake.
 *
 * So look for a fresh tool reaction across every session file, not just ours,
 * and adopt it. Ours still wins when both are fresh.
 */
function findFreshToolReaction(
  stateDir: string,
  ownReactionPath: string,
  stopMarkerPath: string,
  nowMs: number,
): ReactionFile | null {
  const own = readJsonFile<ReactionFile>(ownReactionPath);
  if (isFreshToolReaction(own, stopMarkerPath, nowMs)) return own;

  let best: ReactionFile | null = null;
  let entries: string[] = [];
  try {
    entries = readdirSync(stateDir);
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!entry.startsWith("reaction.") || !entry.endsWith(".json")) continue;
    const path = join(stateDir, entry);
    if (path === ownReactionPath) continue;
    const candidate = readJsonFile<ReactionFile>(path);
    if (!isFreshToolReaction(candidate, stopMarkerPath, nowMs)) continue;
    const bestTs = typeof best?.timestamp === "number" ? best.timestamp : 0;
    const candidateTs = typeof candidate?.timestamp === "number" ? candidate.timestamp : 0;
    if (!best || candidateTs > bestTs) best = candidate;
  }
  return best;
}

export function handleBuddyComment(
  rawInput: string,
  runtime: HookRuntime = {},
): BuddyCommentResult {
  const stateDir = resolveHookStateDir(runtime);
  if (!fileExists(join(stateDir, "status.json"))) {
    return { source: "none", updated: false };
  }

  const input = parseHookInput(rawInput);
  if (!input) return { source: "none", updated: false };

  const assistantMessage = stringField(input, "last_assistant_message");
  if (!assistantMessage) return { source: "none", updated: false };

  const now = runtime.now?.() ?? Date.now();
  const sid = resolveHookSessionId(runtime);
  const reactionPath = join(stateDir, `reaction.${sid}.json`);
  const cooldownFile = join(stateDir, `.last_comment.${sid}`);
  const stopMarkerFile = join(stateDir, `.last_stop_hook.${sid}`);
  const config = readJsonFile<BuddyConfig>(join(stateDir, "config.json")) ?? {};
  const cooldown = nonNegativeInteger(config.commentCooldown, 30);

  // ─── Don't clobber a buddy_react tool reaction from this turn ───────────
  // Checked across all session files: see findFreshToolReaction for why.
  const freshTool = findFreshToolReaction(stateDir, reactionPath, stopMarkerFile, now);
  if (freshTool) {
    // Adopt it into this session's file so the statusline — which reads only
    // its own session — actually renders the model-authored line.
    const own = readJsonFile<ReactionFile>(reactionPath);
    let wrote = false;
    if (own?.reaction !== freshTool.reaction || own?.source !== "tool") {
      mkdirSync(stateDir, { recursive: true });
      atomicWriteJson(reactionPath, freshTool);
      wrote = true;
    }
    atomicWriteTimestamp(stopMarkerFile, now);
    // `updated` reports whether this invocation wrote the bubble, so adoption
    // counts — a consumer using it to trigger a re-render must see the write.
    return { source: "tool", updated: wrote };
  }

  // ─── Cooldown: rate-limit the reaction write AND bookkeeping ──────────
  // Main ran the turn counter / XP / memory hooks only inside the
  // "reaction written" branch. Running them unconditionally makes the
  // XP economy and spawn counts scale with Stop event frequency, which
  // is wrong.
  if (isOnCooldown(cooldownFile, cooldown, now)) {
    atomicWriteTimestamp(stopMarkerFile, now);
    return { source: "none", updated: false };
  }

  // ─── Pick a reaction: legacy comment → canned pool → nothing ────────────
  const commentFromMessage = extractBuddyComment(assistantMessage);
  let comment: string | undefined;
  let source: ReactionSource;

  if (commentFromMessage) {
    comment = commentFromMessage;
    source = "comment";
  } else {
    const species = readSpeciesFromStatus(stateDir);
    const fallback = pickTurnFallback(species, runtime);
    if (fallback) {
      comment = fallback;
      source = "fallback";
    } else {
      atomicWriteTimestamp(stopMarkerFile, now);
      return { source: "none", updated: false };
    }
  }

  mkdirSync(stateDir, { recursive: true });

  // Bookkeeping fires only when a reaction is actually written (main).
  const eventsFile = join(stateDir, "events.json");
  const events = readJsonFile<Events>(eventsFile) ?? {};
  events.turns = (typeof events.turns === "number" ? events.turns : 0) + 1;
  atomicWriteJson(eventsFile, events);

  atomicWriteTimestamp(cooldownFile, now);
  atomicWriteJson(reactionPath, {
    reaction: comment,
    timestamp: now,
    reason: "turn",
    source,
  });

  const spawnDetached = runtime.spawnDetached ?? defaultSpawnDetached(runtime);
  spawnDetached("server/award-xp.ts", ["turn"]);
  spawnDetached("server/consolidate.ts", [
    assistantMessage,
    stringField(input, "last_user_message"),
  ]);
  atomicWriteTimestamp(stopMarkerFile, now);

  return { comment, source, updated: true };
}

if (import.meta.main) {
  try {
    handleBuddyComment(await readStdin());
  } catch {
    // Claude Code hooks must never fail the turn.
  }
  process.exit(0);
}

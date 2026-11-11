/**
 * Mood system — buddy情绪 based on coding events and time of day.
 *
 * Mood is session-scoped (stored in mood.json, resets on session restart).
 * Shifts based on: test results, error count, session duration, time of day.
 * Affects: reaction flavor, stat modifiers, art expression.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { buddyStateDir } from "./path";
import type { StatName } from "../core/engine.ts"

// ─── Mood types ───────────────────────────────────────────────────────────────

export type Mood =
  | "happy"      // tests passing, good code
  | "focused"    // active coding session, good progress
  | "excited"    // big diff, achievement unlocked, major event
  | "tired"      // long session, many errors
  | "melancholy" // repeated failures, low streak
  | "chaotic";   // many errors in short time, unpredictable

export interface MoodState {
  current: Mood;
  since: number;          // timestamp of last mood change
  intensity: number;        // 1-3, affects how much mood modifies behavior
  recentErrors: number;     // errors in last 5 minutes
  recentTests: number;     // tests passed in last 5 minutes
  recentDiffs: number;     // large diffs in last 5 minutes
}

// ─── Mood colors (for status line display) ───────────────────────────────────

export const MOOD_COLORS: Record<Mood, string> = {
  happy:    "\ud83d\ude0a",  // 😀
  focused: "\ud83e\udd13",  // 🧐
  excited: "\ud83e\ude74",  // 🥳
  tired:   "\ud83d\ude34",  // 😴
  melancholy: "\ud83d\ude14", // 😔
  chaotic: "\ud83e\udd2f",  // 🤯
};

export const MOOD_NAMES: Record<Mood, string> = {
  happy:    "Happy",
  focused:  "Focused",
  excited:  "Excited",
  tired:    "Tired",
  melancholy: "Melancholy",
  chaotic:  "Chaotic",
};

// ─── Time-of-day influence ───────────────────────────────────────────────────

export function getTimeOfDayMood(): Mood {
  const hour = new Date().getHours();
  if (hour >= 22 || hour < 6) return "tired";       // late night
  if (hour >= 6 && hour < 9) return "melancholy";   // early morning
  if (hour >= 9 && hour < 12) return "focused";     // morning
  if (hour >= 12 && hour < 17) return "happy";       // afternoon
  if (hour >= 17 && hour < 20) return "excited";    // evening
  return "tired";
}

// ─── Mood persistence ────────────────────────────────────────────────────────

const MOOD_FILE = join(buddyStateDir(), "mood.json");

function loadMoodState(): MoodState {
  try {
    return JSON.parse(readFileSync(MOOD_FILE, "utf8")) as MoodState;
  } catch {
    return {
      current: getTimeOfDayMood(),
      since: Date.now(),
      intensity: 1,
      recentErrors: 0,
      recentTests: 0,
      recentDiffs: 0,
    };
  }
}

function saveMoodState(state: MoodState): void {
  mkdirSync(buddyStateDir(), { recursive: true });
  writeFileSync(MOOD_FILE, JSON.stringify(state, null, 2));
}

// ─── Mood shift triggers ────────────────────────────────────────────────────

export type MoodTrigger =
  | "tests_pass"
  | "tests_fail"
  | "error"
  | "large_diff"
  | "achievement"
  | "long_session"
  | "idle"
  | "rest";

const MOOD_TRANSITIONS: Record<Mood, Partial<Record<MoodTrigger, Mood>>> = {
  happy: {
    tests_pass: "excited",
    achievement: "excited",
    long_session: "melancholy",
    error: "tired",
  },
  focused: {
    tests_pass: "happy",
    error: "tired",
    long_session: "tired",
  },
  excited: {
    tests_pass: "excited",
    error: "focused",
    idle: "happy",
  },
  tired: {
    tests_pass: "focused",
    error: "chaotic",
    rest: "happy",
    idle: "melancholy",
  },
  melancholy: {
    tests_pass: "focused",
    achievement: "happy",
    error: "chaotic",
    rest: "happy",
  },
  chaotic: {
    tests_pass: "focused",
    idle: "tired",
    rest: "melancholy",
    error: "chaotic",
  },
};

// ─── Core functions ───────────────────────────────────────────────────────────

const RECENT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function decayRecentCounts(state: MoodState): MoodState {
  // Decay recent counts based on time since last update
  const elapsed = Date.now() - state.since;
  if (elapsed > RECENT_WINDOW_MS) {
    return {
      ...state,
      recentErrors: 0,
      recentTests: 0,
      recentDiffs: 0,
      since: Date.now(),
    };
  }
  return state;
}

/**
 * Shift mood based on a trigger event.
 * Returns the new mood state.
 */
export function shiftMood(trigger: MoodTrigger): MoodState {
  let state = loadMoodState();
  state = decayRecentCounts(state);

  // Update recent counters based on trigger
  switch (trigger) {
    case "error":
      state.recentErrors += 1;
      break;
    case "tests_pass":
      state.recentTests += 1;
      break;
    case "large_diff":
      state.recentDiffs += 1;
      break;
  }

  // Check for chaotic threshold (3+ errors in 5 minutes)
  if (trigger === "error" && state.recentErrors >= 3) {
    state.current = "chaotic";
    state.intensity = Math.min(3, state.recentErrors - 1);
    state.since = Date.now();
    saveMoodState(state);
    return state;
  }

  // Look up the transition for the current mood
  const transitions = MOOD_TRANSITIONS[state.current];
  if (transitions && transitions[trigger]) {
    const newMood = transitions[trigger]!;
    if (newMood !== state.current) {
      state.current = newMood;
      state.intensity = Math.min(3, state.intensity + 1);
      state.since = Date.now();
    }
  }

  saveMoodState(state);
  return state;
}

/**
 * Get the current mood state.
 */
export function getMood(): MoodState {
  return decayRecentCounts(loadMoodState());
}

/**
 * Get mood stat modifiers (±5 to effective stats based on mood).
 * These are temporary and don't persist.
 */
export function getMoodModifier(mood: Mood, stat: StatName): number {
  switch (mood) {
    case "happy":
      return stat === "WISDOM" ? +5 : 0;
    case "focused":
      return stat === "DEBUGGING" ? +5 : stat === "CHAOS" ? -3 : 0;
    case "chaotic":
      return stat === "CHAOS" ? +8 : stat === "WISDOM" ? -5 : 0;
    case "tired":
      return stat === "PATIENCE" ? +3 : stat === "DEBUGGING" ? -3 : 0;
    case "melancholy":
      return stat === "WISDOM" ? +3 : 0;
    case "excited":
      return stat === "CHAOS" ? +5 : stat === "PATIENCE" ? -3 : 0;
  }
}

// ─── Mood for reactions ─────────────────────────────────────────────────────

/**
 * Get a mood-specific reaction suffix/prefix.
 * Returns undefined if no mood-specific reaction should be used.
 */
export function getMoodReaction(mood: Mood): string | undefined {
  const r = Math.random();
  if (r > 0.3) return undefined; // 30% chance of mood reaction

  switch (mood) {
    case "happy":
      return "*blooms*";
    case "focused":
      return "*intensifies*";
    case "excited":
      return "*vibrates with energy*";
    case "tired":
      return "*yawns*";
    case "melancholy":
      return "*sighs gently*";
    case "chaotic":
      return "*glitches*";
  }
}

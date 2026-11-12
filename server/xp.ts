/**
 * XP and leveling system for coding-buddy.
 *
 * Awards XP for coding events, computes levels, and manages unlockables.
 * State persists to xp.json in the buddy state directory.
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { buddyStateDir } from "./path";
import {
  loadCompanion,
  loadCompanionSlot,
  saveCompanion,
  loadActiveSlot,
} from "./state";
import type { Species, Rarity } from "../core/engine.ts"

// ─── XP event types ───────────────────────────────────────────────────────────

export type XpEvent =
  | "errors_spotted"
  | "tests_passed"
  | "tests_failed"
  | "large_diff"
  | "turn"
  | "achievement_unlocked"
  | "time_spent"
  | "buddy_pet";

// ─── XP rules ─────────────────────────────────────────────────────────────────

interface XpRule {
  event: XpEvent;
  baseXp: number;
  /** Optional species multiplier */
  speciesBonus?: Partial<Record<Species, number>>;
  /** Optional rarity multiplier */
  rarityBonus?: Partial<Record<Rarity, number>>;
}

const XP_RULES: XpRule[] = [
  { event: "errors_spotted",        baseXp: 15 },
  { event: "tests_passed",          baseXp: 20 },
  { event: "tests_failed",          baseXp: 5 },
  { event: "large_diff",            baseXp: 25 },
  { event: "turn",                  baseXp: 1 },
  { event: "achievement_unlocked",  baseXp: 50 },
  { event: "time_spent",            baseXp: 2 },  // per minute
  { event: "buddy_pet",             baseXp: 5 },
];

function getRule(event: XpEvent): XpRule {
  return XP_RULES.find((r) => r.event === event) ?? { event, baseXp: 1 };
}

// ─── Level table ──────────────────────────────────────────────────────────────

export const MAX_LEVEL = 20;

export const XP_LEVELS: Record<number, number> = {
  1: 0,
  2: 100,
  3: 250,
  4: 500,
  5: 900,
  6: 1500,
  7: 2300,
  8: 3300,
  9: 4500,
  10: 6000,
  11: 7800,
  12: 10000,
  13: 12500,
  14: 15500,
  15: 19000,
  16: 23000,
  17: 27500,
  18: 32500,
  19: 38000,
  20: 44000,
};

/** Compute level from total XP. Returns 1–MAX_LEVEL. */
export function computeLevel(totalXp: number): number {
  for (let lvl = MAX_LEVEL; lvl >= 1; lvl--) {
    if (totalXp >= (XP_LEVELS[lvl] ?? 0)) return lvl;
  }
  return 1;
}

/** XP needed to reach the next level (0 if at max). */
export function xpToNextLevel(totalXp: number): number {
  const current = computeLevel(totalXp);
  if (current >= MAX_LEVEL) return 0;
  return XP_LEVELS[current + 1] - totalXp;
}

/** Total XP needed to reach a level from 0. */
export function xpForLevel(level: number): number {
  return XP_LEVELS[Math.min(level, MAX_LEVEL)] ?? 0;
}

// ─── Unlockables ──────────────────────────────────────────────────────────────

export interface UnlockableReaction {
  id: string;
  level: number;
  template: string;
  species?: Species[];
  rarity?: Rarity[];
}

export interface UnlockableUpgrade {
  id: string;
  level: number;
  name: string;
  description: string;
  icon: string;
  /** Whether this upgrade is currently active on a companion */
  active?: boolean;
}

export const UNLOCKABLE_REACTIONS: UnlockableReaction[] = [
  {
    id: "celebrate_level5",
    level: 5,
    template: "*does a happy dance* level up!",
  },
  {
    id: "boss_fight_level8",
    level: 8,
    template: "*rolls up sleeves* time to debug.",
    species: ["dragon", "goose"],
  },
  {
    id: "zen_mode_level10",
    level: 10,
    template: "*closes all eyes* ...peace.",
    rarity: ["rare", "epic", "legendary"],
  },
  {
    id: "debug_sprint_level12",
    level: 12,
    template: "*cracks knuckles* let's squash this.",
    species: ["cat", "robot"],
  },
];

export const UNLOCKABLE_UPGRADES: UnlockableUpgrade[] = [
  {
    id: "bonus_eye",
    level: 3,
    name: "Third Eye",
    description: "Your buddy gains a bonus eye for extra perception.",
    icon: "\ud83d\udc41",
  },
  {
    id: "shiny_aura",
    level: 7,
    name: "Shiny Aura",
    description: "A permanent shimmer effect around your buddy.",
    icon: "\u2728",
  },
  {
    id: "stat_boost",
    level: 12,
    name: "Training Bonus",
    description: "+5 to peak stat.",
    icon: "\u2b50",
  },
  {
    id: "extra_hat_slot",
    level: 15,
    name: "Hat Collection",
    description: "Unlocks the tiny-duck hat permanently.",
    icon: "\ud83c\udfa9",
  },
];

// ─── XP state ─────────────────────────────────────────────────────────────────

export interface XpState {
  totalXp: number;
  level: number;
  unlockedReactions: string[];
  unlockedUpgrades: string[];
  cosmeticFlags: string[];
  levelUpAchieved: boolean; // flash animation once per level-up
}

const XP_FILE = join(buddyStateDir(), "xp.json");

function loadXpState(): XpState {
  try {
    const raw = readFileSync(XP_FILE, "utf8");
    return JSON.parse(raw) as XpState;
  } catch {
    return {
      totalXp: 0,
      level: 1,
      unlockedReactions: [],
      unlockedUpgrades: [],
      cosmeticFlags: [],
      levelUpAchieved: false,
    };
  }
}

function saveXpState(state: XpState): void {
  mkdirSync(buddyStateDir(), { recursive: true });
  const tmp = XP_FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  // Atomic rename
  try {
    const { renameSync } = require("fs");
    renameSync(tmp, XP_FILE);
  } catch {
    // fallback: just write directly
    writeFileSync(XP_FILE, JSON.stringify(state, null, 2));
  }
}

// ─── Core functions ───────────────────────────────────────────────────────────

/** Compute XP awarded for an event, applying species/rarity multipliers */
function computeXpForEvent(
  event: XpEvent,
  species?: Species,
  rarity?: Rarity,
): number {
  const rule = getRule(event);
  let xp = rule.baseXp;
  if (species && rule.speciesBonus?.[species]) {
    xp = Math.floor(xp * rule.speciesBonus[species]!);
  }
  if (rarity && rule.rarityBonus?.[rarity]) {
    xp = Math.floor(xp * rule.rarityBonus[rarity]!);
  }
  return xp;
}

/**
 * Award XP for an event.
 * Returns the updated XpState.
 */
export function awardXp(
  event: XpEvent,
  slot?: string,
  species?: Species,
  rarity?: Rarity,
): XpState {
  const state = loadXpState();
  const xpGain = computeXpForEvent(event, species, rarity);
  const prevLevel = state.level;
  const newTotal = state.totalXp + xpGain;
  const newLevel = computeLevel(newTotal);

  state.totalXp = newTotal;
  state.level = newLevel;

  // Check for newly unlocked reactions
  for (const rxn of UNLOCKABLE_REACTIONS) {
    if (
      newLevel >= rxn.level &&
      !state.unlockedReactions.includes(rxn.id) &&
      (!rxn.species || !species || rxn.species.includes(species)) &&
      (!rxn.rarity || !rarity || rxn.rarity.includes(rarity))
    ) {
      state.unlockedReactions.push(rxn.id);
    }
  }

  // Check for newly unlocked upgrades
  for (const upg of UNLOCKABLE_UPGRADES) {
    if (newLevel >= upg.level && !state.unlockedUpgrades.includes(upg.id)) {
      state.unlockedUpgrades.push(upg.id);
    }
  }

  // Detect level-up
  if (newLevel > prevLevel) {
    state.levelUpAchieved = true;
  }

  saveXpState(state);
  return state;
}

/** Get current XP state */
export function getXpState(): XpState {
  return loadXpState();
}

/** Clear the level-up flash (after animation plays) */
export function clearLevelUpFlag(): void {
  const state = loadXpState();
  state.levelUpAchieved = false;
  saveXpState(state);
}

/** Get all reactions available at the current level (base + unlocked) */
export function getAvailableReactions(species?: Species, rarity?: Rarity): string[] {
  const state = loadXpState();
  const base: string[] = [];
  const unlocked: string[] = [];

  // Base reactions are always available
  for (const rxn of UNLOCKABLE_REACTIONS) {
    if (rxn.level > state.level) continue;
    if (rxn.species && (!species || !rxn.species.includes(species))) continue;
    if (rxn.rarity && (!rarity || !rxn.rarity.includes(rarity))) continue;
    unlocked.push(rxn.template);
  }

  return [...base, ...unlocked];
}

/** Check if a specific upgrade is unlocked */
export function isUpgradeUnlocked(upgradeId: string): boolean {
  const state = loadXpState();
  return state.unlockedUpgrades.includes(upgradeId);
}

/** Apply an upgrade to a companion if unlocked */
export function applyUpgrade(
  companion: ReturnType<typeof loadCompanion>,
  upgradeId: string,
): ReturnType<typeof loadCompanion> {
  if (!companion) return companion;
  const state = loadXpState();
  if (!state.unlockedUpgrades.includes(upgradeId)) return companion;

  const upgrade = UNLOCKABLE_UPGRADES.find((u) => u.id === upgradeId);
  if (!upgrade) return companion;

  switch (upgradeId) {
    case "bonus_eye":
      if (!companion.bones.shiny && !state.cosmeticFlags.includes("has_third_eye")) {
        state.cosmeticFlags.push("has_third_eye");
      }
      break;
    case "shiny_aura":
      if (!companion.bones.shiny) {
        companion.bones.shiny = true;
      }
      break;
    case "stat_boost":
      companion.bones.stats[companion.bones.peak] = Math.min(
        100,
        companion.bones.stats[companion.bones.peak] + 5,
      );
      break;
    case "extra_hat_slot":
      // Already implicitly handled — no code change needed
      break;
  }

  saveXpState(state);
  return companion;
}

// ─── Rendering helpers ────────────────────────────────────────────────────────

/** Render an XP progress bar as a string */
export function renderXpBar(totalXp: number, width: number = 20): string {
  const lvl = computeLevel(totalXp);
  if (lvl >= MAX_LEVEL) {
    return "\u2588".repeat(width) + " MAX";
  }
  const current = XP_LEVELS[lvl] ?? 0;
  const next = XP_LEVELS[lvl + 1] ?? current;
  const progress = (totalXp - current) / (next - current);
  const filled = Math.round(progress * width);
  const empty = width - filled;
  return (
    "\u2588".repeat(filled) +
    "\u2591".repeat(empty) +
    ` Lvl ${lvl}`
  );
}

/** Render XP card in markdown for MCP tool response */
export function renderXpCardMarkdown(): string {
  const state = loadXpState();
  const bar = renderXpBar(state.totalXp, 20);
  const toNext = xpToNextLevel(state.totalXp);
  const nextLevel = state.level + 1;

  const parts: string[] = [];

  parts.push(`### \u2b50 ${state.level} \u2014 ${state.totalXp.toLocaleString()} XP`);
  parts.push("");
  parts.push(`**Progress:** \`${bar}\``);
  if (toNext > 0) {
    parts.push(`XP to Level ${nextLevel}: **${toNext.toLocaleString()}**`);
  } else if (state.level >= MAX_LEVEL) {
    parts.push("**MAX LEVEL** reached!");
  }
  parts.push("");

  if (state.unlockedReactions.length > 0) {
    parts.push("**Unlocked Reactions:**");
    for (const id of state.unlockedReactions) {
      const rxn = UNLOCKABLE_REACTIONS.find((r) => r.id === id);
      if (rxn) {
        parts.push(`  - Lvl ${rxn.level}: "${rxn.template}"`);
      }
    }
    parts.push("");
  }

  if (state.unlockedUpgrades.length > 0) {
    parts.push("**Unlocked Upgrades:**");
    for (const id of state.unlockedUpgrades) {
      const upg = UNLOCKABLE_UPGRADES.find((u) => u.id === id);
      if (upg) {
        parts.push(`  - ${upg.icon} ${upg.name} (Lvl ${upg.level}): ${upg.description}`);
      }
    }
    parts.push("");
  }

  const availableUpgrades = UNLOCKABLE_UPGRADES.filter(
    (u) => u.level > state.level,
  );
  if (availableUpgrades.length > 0) {
    parts.push("**Next Unlocks:**");
    for (const upg of availableUpgrades.slice(0, 3)) {
      parts.push(`  - ${upg.icon} ${upg.name} at Lvl ${upg.level}: ${upg.description}`);
    }
  }

  return parts.join("\n");
}

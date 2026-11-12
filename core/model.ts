import type {
  BuddyBones,
  BuddyStats,
  Companion,
  Species,
  Rarity,
  Eye,
  Hat,
  StatName,
} from "./engine.ts";

export type {
  BuddyBones,
  BuddyStats,
  Companion,
  Species,
  Rarity,
  Eye,
  Hat,
  StatName,
};

export interface ReactionState {
  reaction: string;
  timestamp: number;
  reason: string;
}

export interface BuddyTurnCommentModelConfig {
  provider: string;
  model: string;
}

export interface BuddyConfig {
  commentCooldown: number;
  reactionTTL: number;
  bubbleStyle: "classic" | "round";
  bubblePosition: "top" | "left";
  showRarity: boolean;
  statusLineEnabled: boolean;
  statuslineDensity?: "auto" | "full" | "compact" | "minimal";
  turnCommentModel?: BuddyTurnCommentModelConfig;
  /** Optional per-host bound for end-of-turn reaction LLM calls (ms). */
  turnCommentTimeoutMs?: number;
}

export interface GlobalCounters {
  errors_seen: number;
  tests_failed: number;
  large_diffs: number;
  sessions: number;
  commands_run: number;
  days_active: number;
  turns: number;
}

export interface SlotCounters {
  pets: number;
  reactions_given: number;
}

export interface EventCounters extends GlobalCounters, SlotCounters {}

export interface UnlockedAchievement {
  id: string;
  unlockedAt: number;
  slot?: string;
}

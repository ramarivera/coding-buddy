import type {
  BuddyConfig,
  Companion,
  EventCounters,
  ReactionState,
  UnlockedAchievement,
} from "./model.ts";
import type { Achievement } from "./achievements.ts";

export interface IdentityProvider {
  getStableUserId(): string;
}

export interface BuddyRepository {
  loadActive(): Companion | null;
  saveActive(companion: Companion): void;
  updateActive(transform: (companion: Companion) => Companion): Companion;
  loadSlot(slot: string): Companion | null;
  saveSlot(slot: string, companion: Companion): void;
  updateSlot(
    slot: string,
    transform: (companion: Companion) => Companion | null,
  ): Companion | null;
  deleteSlot(slot: string): void;
  listSlots(): Array<{ slot: string; companion: Companion }>;
  loadActiveSlot(): string | null;
  saveActiveSlot(slot: string): void;
  ensureCompanion(
    userId: string,
    create: (existingSlots: string[]) => { companion: Companion; slot: string },
  ): { companion: Companion; slot: string; created: boolean };
}

export interface ReactionRepository {
  loadLatest(scope?: string): ReactionState | null;
  saveLatest(reaction: ReactionState, scope?: string): void;
}

export interface BuddyConfigRepository {
  loadConfig(): BuddyConfig;
  saveConfig(config: Partial<BuddyConfig>): BuddyConfig;
}

export interface BuddyEventRepository {
  loadCounters(scope?: string): EventCounters;
  increment(key: keyof EventCounters, amount?: number, scope?: string): EventCounters;
  loadUnlocked(): UnlockedAchievement[];
  saveUnlocked(unlocked: UnlockedAchievement[]): void;
  trackActiveDay(): void;
  unlockAchievements(
    slot: string | undefined,
    evaluate: (counters: EventCounters, unlockedIds: Set<string>) => Achievement[],
  ): Achievement[];
}

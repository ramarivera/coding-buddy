export function mergeAchievements(first: Achievement[], second: Achievement[]): Achievement[] {
  const merged = new Map<string, Achievement>();
  for (const achievement of [...first, ...second]) {
    merged.set(achievement.id, achievement);
  }
  return [...merged.values()];
}

import {
  generateBones,
  RARITY_STARS,
  type Companion,
} from "./engine.ts";
import { ACHIEVEMENTS, getCreationAchievements, getUnlockedAchievements, type Achievement } from "./achievements.ts";
import { generateFallbackName, getReaction } from "./reactions.ts";
import { slugifySlot } from "./slot-slug.ts";
import type {
  BuddyConfig,
  ReactionState,
} from "./model.ts";
import type {
  BuddyConfigRepository,
  BuddyEventRepository,
  BuddyRepository,
  IdentityProvider,
  ReactionRepository,
} from "./ports.ts";

export interface BuddyCommandServiceDeps {
  identity: IdentityProvider;
  buddies: BuddyRepository;
  reactions: ReactionRepository;
  config: BuddyConfigRepository;
  events: BuddyEventRepository;
}

export interface EnsureCompanionResult {
  companion: Companion;
  slot: string;
  created: boolean;
  achievements: Achievement[];
}

export interface ReactionResult {
  companion: Companion;
  slot: string;
  reaction: string;
  state: ReactionState;
  achievements: Achievement[];
}

export interface ProgressResult {
  companion: Companion;
  slot: string;
  achievements: Achievement[];
}

export interface SaveBuddyResult {
  companion: Companion;
  slot: string;
}

export interface SummonBuddyResult {
  companion: Companion;
  slot: string;
}

/**
 * Shared application-service seam for buddy operations.
 *
 * Host adapters should depend on this service for buddy domain behavior,
 * while keeping transport, UI, and host-specific persistence concerns outside.
 */
export class BuddyCommandService {
  constructor(private readonly deps: BuddyCommandServiceDeps) {}

  getStableUserId(): string {
    return this.deps.identity.getStableUserId();
  }

  loadActiveCompanion(): Companion | null {
    return this.deps.buddies.loadActive();
  }

  loadLatestReaction(scope?: string): ReactionState | null {
    return this.deps.reactions.loadLatest(scope);
  }

  loadConfig(): BuddyConfig {
    return this.deps.config.loadConfig();
  }

  listCompanions(): Array<{ slot: string; companion: Companion }> {
    return this.deps.buddies.listSlots();
  }

  ensureCompanion(): EnsureCompanionResult {
    const userId = this.getStableUserId();
    const { companion, slot, created } = this.deps.buddies.ensureCompanion(
      userId,
      (existingSlots) => this.createCompanion(userId, existingSlots),
    );
    const achievements = created
      ? this.deps.events.unlockAchievements(slot, getCreationAchievements)
      : [];
    return { companion, slot, created, achievements };
  }

  startSession(): EnsureCompanionResult {
    const result = this.ensureCompanion();
    this.deps.events.trackActiveDay();
    this.deps.events.increment("sessions", 1);
    const sessionAchievements = this.unlockNewAchievements(result.slot);

    return { ...result, achievements: mergeAchievements(result.achievements, sessionAchievements) };
  }


  petBuddy(scope?: string): ReactionResult {
    const { companion, slot } = this.ensureCompanion();
    this.deps.events.increment("pets", 1, slot);
    return this.saveReaction("pet", companion, slot, scope);
  }

  renameBuddy(name: string): Companion {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Buddy name cannot be empty.");
    this.ensureCompanion();
    return this.deps.buddies.updateActive((companion) => ({
      ...companion,
      name: trimmed.slice(0, 14),
    }));
  }

  setPersonality(personality: string): Companion {
    const trimmed = personality.trim();
    if (!trimmed) throw new Error("Buddy personality cannot be empty.");
    this.ensureCompanion();
    return this.deps.buddies.updateActive((companion) => ({
      ...companion,
      personality: trimmed,
    }));
  }

  setPersonalityForSlot(
    slot: string,
    personality: string,
    expectedPersonality: string,
  ): Companion | null {
    const trimmed = personality.trim();
    if (!trimmed) throw new Error("Buddy personality cannot be empty.");
    return this.deps.buddies.updateSlot(slot, (companion) => {
      if (companion.personality !== expectedPersonality) return null;
      return { ...companion, personality: trimmed };
    });
  }

  saveBuddy(slot?: string): SaveBuddyResult {
    const { companion, slot: activeSlot } = this.ensureCompanion();
    if (slot?.trim()) {
      const targetSlot = slugifySlot(slot.trim());
      if (targetSlot !== activeSlot && this.deps.buddies.loadSlot(targetSlot)) {
        throw new Error(`Slot "${targetSlot}" already exists.`);
      }
      if (targetSlot === activeSlot) {
        this.deps.buddies.saveActive(companion);
      } else {
        this.deps.buddies.saveSlot(targetSlot, companion);
      }
      this.deps.buddies.saveActiveSlot(targetSlot);
      return { companion, slot: targetSlot };
    }

    this.deps.buddies.saveActive(companion);
    return { companion, slot: activeSlot };
  }

  summonBuddy(slot?: string): SummonBuddyResult | null {
    const targetSlot = slot ? slugifySlot(slot) : undefined;

    if (!targetSlot) {
      const companions = this.deps.buddies.listSlots();
      if (companions.length === 0) return null;
      const pick = companions[Math.floor(Math.random() * companions.length)];
      this.deps.buddies.saveActiveSlot(pick.slot);
      return { companion: pick.companion, slot: pick.slot };
    }

    const companion = this.deps.buddies.loadSlot(targetSlot);
    if (!companion) return null;

    this.deps.buddies.saveActiveSlot(targetSlot);
    return { companion, slot: targetSlot };
  }

  dismissBuddy(slot: string): SaveBuddyResult {
    const targetSlot = slugifySlot(slot);
    const activeSlot = this.getActiveSlot();
    if (targetSlot === activeSlot) {
      throw new Error("Cannot dismiss the active buddy.");
    }

    const companion = this.deps.buddies.loadSlot(targetSlot);
    if (!companion) {
      throw new Error(`No buddy found in slot \"${targetSlot}\".`);
    }

    this.deps.buddies.deleteSlot(targetSlot);
    return { companion, slot: targetSlot };
  }

  recordNameMention(scope?: string): ReactionResult {
    const { companion, slot } = this.ensureCompanion();
    return this.saveReaction("turn", companion, slot, scope);
  }

  recordToolError(scope?: string, line?: number): ReactionResult {
    const { companion, slot } = this.ensureCompanion();
    this.deps.events.increment("errors_seen", 1);
    return this.saveReaction("error", companion, slot, scope, { line });
  }

  recordTestFailure(scope?: string, count?: number): ReactionResult {
    const { companion, slot } = this.ensureCompanion();
    this.deps.events.increment("tests_failed", 1);
    return this.saveReaction("test-fail", companion, slot, scope, { count });
  }

  recordLargeDiff(lines: number, scope?: string): ReactionResult {
    const { companion, slot } = this.ensureCompanion();
    this.deps.events.increment("large_diffs", 1);
    return this.saveReaction("large-diff", companion, slot, scope, { lines });
  }
  trackToolError(scope?: string, line?: number): Achievement[] {
    const { slot } = this.ensureCompanion();
    this.deps.events.increment("errors_seen", 1, slot);
    return this.unlockNewAchievements(slot);
  }

  trackTestFailure(scope?: string, count?: number): Achievement[] {
    const { slot } = this.ensureCompanion();
    this.deps.events.increment("tests_failed", 1, slot);
    return this.unlockNewAchievements(slot);
  }

  trackLargeDiff(lines: number, scope?: string): Achievement[] {
    const { slot } = this.ensureCompanion();
    this.deps.events.increment("large_diffs", 1, slot);
    return this.unlockNewAchievements(slot);
  }

  recordTurn(scope?: string): ReactionResult {
    const { companion, slot } = this.ensureCompanion();
    this.deps.events.increment("turns", 1);
    return this.saveReaction("turn", companion, slot, scope);
  }

  recordTurnOnly(): ProgressResult {
    const { companion, slot } = this.ensureCompanion();
    this.deps.events.increment("turns", 1);
    const achievements = this.unlockNewAchievements(slot);
    return { companion, slot, achievements };
  }

  recordComment(
    comment: string,
    reason: "turn" | "error" | "test-fail" | "large-diff" = "turn",
    scope?: string,
  ): ReactionResult {
    const trimmed = comment.trim();
    if (!trimmed) throw new Error("Buddy comment cannot be empty.");
    const { companion, slot } = this.ensureCompanion();
    return this.saveCustomReaction(trimmed, reason, companion, slot, scope);
  }
  incrementCommandsRun(): Achievement[] {
    const slot = this.getActiveSlotOrUndefined();
    this.deps.events.increment("commands_run", 1, slot);
    return this.unlockNewAchievements(slot);
  }

  getAchievementProgress(slot?: string): {
    unlocked: Array<{ achievement: Achievement; unlockedAt: number; slot?: string }>;
    remaining: Achievement[];
  } {
    const unlocked = this.deps.events.loadUnlocked();
    const unlockedMap = new Map(unlocked.map((entry) => [entry.id, entry]));

    const unlockedAchievements = ACHIEVEMENTS.filter((achievement) =>
      unlockedMap.has(achievement.id)
    );
    const remaining = ACHIEVEMENTS.filter((achievement) => !unlockedMap.has(achievement.id));

    return {
      unlocked: unlockedAchievements.map((achievement) => ({
        achievement,
        unlockedAt: unlockedMap.get(achievement.id)?.unlockedAt ?? 0,
        slot: unlockedMap.get(achievement.id)?.slot,
      })),
      remaining,
    };
  }

  formatCompanionSummary(companion: Companion): string {
    const shiny = companion.bones.shiny ? " ✨" : "";
    return `${companion.name} — ${companion.bones.rarity} ${companion.bones.species} ${RARITY_STARS[companion.bones.rarity]}${shiny}`;
  }

  private getActiveSlot(): string {
    return this.deps.buddies.loadActiveSlot() || "buddy";
  }

  private getActiveSlotOrUndefined(): string | undefined {
    const slot = this.deps.buddies.loadActiveSlot();
    return slot || undefined;
  }

  private createCompanion(
    userId: string,
    existingSlots: string[],
  ): { companion: Companion; slot: string } {
    const bones = generateBones(userId);
    const name = this.generateUnusedName(existingSlots);
    const slot = slugifySlot(name);
    return {
      companion: {
        bones,
        name,
        personality: `A ${bones.rarity} ${bones.species} who watches code with quiet intensity.`,
        hatchedAt: Date.now(),
        userId,
      },
      slot,
    };
  }

  private generateUnusedName(existingSlots: string[]): string {
    const taken = new Set(existingSlots);
    for (let i = 0; i < 50; i++) {
      const candidate = generateFallbackName();
      if (!taken.has(slugifySlot(candidate))) return candidate;
    }

    let suffix = 0;
    while (taken.has(`buddy-${suffix}`)) suffix++;
    return `buddy-${suffix}`;
  }

  private saveReaction(
    reason: "pet" | "turn" | "error" | "test-fail" | "large-diff",
    companion: Companion,
    slot: string,
    scope?: string,
    context?: { line?: number; count?: number; lines?: number },
  ): ReactionResult {
    const reaction = getReaction(
      reason,
      companion.bones.species,
      companion.bones.rarity,
      companion.bones.stats,
      context,
    );
    return this.saveCustomReaction(reaction, reason, companion, slot, scope);
  }

  private saveCustomReaction(
    reaction: string,
    reason: "pet" | "turn" | "error" | "test-fail" | "large-diff",
    companion: Companion,
    slot: string,
    scope?: string,
  ): ReactionResult {
    const state: ReactionState = {
      reaction,
      reason,
      timestamp: Date.now(),
    };
    this.deps.reactions.saveLatest(state, scope);
    this.deps.events.increment("reactions_given", 1, slot);
    const achievements = this.unlockNewAchievements(slot);
    return { companion, slot, reaction, state, achievements };
  }

  private unlockNewAchievements(slot?: string): Achievement[] {
    return this.deps.events.unlockAchievements(slot, getUnlockedAchievements);
  }

}

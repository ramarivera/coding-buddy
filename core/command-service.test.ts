import { describe, expect, test } from "bun:test";
import { ACHIEVEMENTS, type Achievement } from "./achievements.ts";
import { BuddyCommandService, mergeAchievements } from "./command-service.ts";
import type {
  BuddyConfig,
  Companion,
  EventCounters,
  ReactionState,
  UnlockedAchievement,
} from "./model.ts";
import type {
  BuddyConfigRepository,
  BuddyEventRepository,
  BuddyRepository,
  IdentityProvider,
  ReactionRepository,
} from "./ports.ts";

const DEFAULT_CONFIG: BuddyConfig = {
  commentCooldown: 30,
  reactionTTL: 0,
  bubbleStyle: "classic",
  bubblePosition: "top",
  showRarity: true,
  statusLineEnabled: true,
};

const EMPTY_EVENTS: EventCounters = {
  errors_seen: 0,
  tests_failed: 0,
  large_diffs: 0,
  sessions: 0,
  commands_run: 0,
  days_active: 0,
  turns: 0,
  pets: 0,
  reactions_given: 0,
};

class FakeIdentity implements IdentityProvider {
  getStableUserId(): string {
    return "user-123";
  }
}

class FakeBuddies implements BuddyRepository {
  activeSlot: string | null = null;
  companions = new Map<string, Companion>();
  loadActiveSlotCalls = 0;

  loadActive(): Companion | null {
    return this.activeSlot ? this.companions.get(this.activeSlot) ?? null : null;
  }

  saveActive(companion: Companion): void {
    if (!this.activeSlot) throw new Error("No active slot");
    this.companions.set(this.activeSlot, companion);
  }

  loadSlot(slot: string): Companion | null {
    return this.companions.get(slot) ?? null;
  }

  saveSlot(slot: string, companion: Companion): void {
    if (this.companions.has(slot)) throw new Error(`Slot ${slot} already exists`);
    this.companions.set(slot, companion);
  }

  updateActive(transform: (companion: Companion) => Companion): Companion {
    if (!this.activeSlot) throw new Error("No active slot");
    const companion = this.companions.get(this.activeSlot);
    if (!companion) throw new Error("No active companion");
    const updated = transform(companion);
    this.companions.set(this.activeSlot, updated);
    return updated;
  }

  updateSlot(
    slot: string,
    transform: (companion: Companion) => Companion | null,
  ): Companion | null {
    const companion = this.companions.get(slot);
    if (!companion) return null;
    const updated = transform(companion);
    if (!updated) return null;
    this.companions.set(slot, updated);
    return updated;
  }

  deleteSlot(slot: string): void {
    this.companions.delete(slot);
  }

  listSlots(): Array<{ slot: string; companion: Companion }> {
    return [...this.companions.entries()].map(([slot, companion]) => ({ slot, companion }));
  }

  loadActiveSlot(): string | null {
    this.loadActiveSlotCalls++;
    return this.activeSlot;
  }

  saveActiveSlot(slot: string): void {
    this.activeSlot = slot;
  }

  ensureCompanion(
    _userId: string,
    create: (existingSlots: string[]) => { companion: Companion; slot: string },
  ): { companion: Companion; slot: string; created: boolean } {
    const active = this.activeSlot ? this.companions.get(this.activeSlot) ?? null : null;
    if (active && this.activeSlot) {
      return { companion: active, slot: this.activeSlot, created: false };
    }
    const saved = this.listSlots();
    if (saved.length > 0) {
      const rescued = saved[0];
      this.activeSlot = rescued.slot;
      return { companion: rescued.companion, slot: rescued.slot, created: false };
    }
    const { companion, slot } = create([...this.companions.keys()]);
    this.companions.set(slot, companion);
    this.activeSlot = slot;
    return { companion, slot, created: true };
  }
}

class FakeReactions implements ReactionRepository {
  latest: ReactionState | null = null;

  loadLatest(): ReactionState | null {
    return this.latest;
  }

  saveLatest(reaction: ReactionState): void {
    this.latest = reaction;
  }
}

class FakeConfig implements BuddyConfigRepository {
  config = { ...DEFAULT_CONFIG };

  loadConfig(): BuddyConfig {
    return this.config;
  }

  saveConfig(config: Partial<BuddyConfig>): BuddyConfig {
    this.config = { ...this.config, ...config };
    return this.config;
  }
}

class FakeEvents implements BuddyEventRepository {
  global = { ...EMPTY_EVENTS };
  perSlot = new Map<string, Pick<EventCounters, "pets" | "reactions_given">>();
  unlocked: UnlockedAchievement[] = [];
  activeDaysTracked = 0;

  loadCounters(slot?: string): EventCounters {
    const slotCounters = slot
      ? this.perSlot.get(slot) ?? { pets: 0, reactions_given: 0 }
      : { pets: 0, reactions_given: 0 };
    return { ...this.global, ...slotCounters };
  }

  increment(key: keyof EventCounters, amount: number = 1, slot?: string): EventCounters {
    if ((key === "pets" || key === "reactions_given") && slot) {
      const current = this.perSlot.get(slot) ?? { pets: 0, reactions_given: 0 };
      current[key] += amount;
      this.perSlot.set(slot, current);
    } else {
      this.global[key] += amount;
    }
    return this.loadCounters(slot);
  }

  loadUnlocked(): UnlockedAchievement[] {
    return this.unlocked;
  }

  saveUnlocked(unlocked: UnlockedAchievement[]): void {
    this.unlocked = unlocked;
  }

  trackActiveDay(): void {
    this.activeDaysTracked += 1;
    this.global.days_active = this.activeDaysTracked;
  }

  unlockAchievements(
    slot: string | undefined,
    evaluate: (counters: EventCounters, unlockedIds: Set<string>) => Achievement[],
  ): Achievement[] {
    const counters = this.loadCounters(slot);
    const unlockedIds = new Set(this.unlocked.map((entry) => entry.id));
    const newlyUnlocked = evaluate(counters, unlockedIds);
    if (newlyUnlocked.length > 0) {
      this.unlocked = [
        ...this.unlocked,
        ...newlyUnlocked.map((achievement) => ({
          id: achievement.id,
          unlockedAt: Date.now(),
          slot,
        })),
      ];
    }
    return newlyUnlocked;
  }
}

function makeService() {
  const buddies = new FakeBuddies();
  const reactions = new FakeReactions();
  const config = new FakeConfig();
  const events = new FakeEvents();

  return {
    buddies,
    reactions,
    config,
    events,
    service: new BuddyCommandService({
      identity: new FakeIdentity(),
      buddies,
      reactions,
      config,
      events,
    }),
  };
}

describe("BuddyCommandService", () => {
  test("ensureCompanion creates a deterministic buddy without session accounting", () => {
    const { service, buddies, events } = makeService();

    const result = service.ensureCompanion();

    expect(result.created).toBe(true);
    expect(result.companion.userId).toBe("user-123");
    expect(buddies.loadActive()).not.toBeNull();
    expect(events.global.sessions).toBe(0);
    expect(events.global.days_active).toBe(0);
    expect(result.achievements.some((a) => a.id === "first_steps")).toBe(true);
  });

  test("startSession records active day and increments sessions for new and existing buddies", () => {
    const { service, events } = makeService();
    service.ensureCompanion();

    const first = service.startSession();
    expect(first.created).toBe(false);
    expect(events.global.sessions).toBe(1);
    expect(events.global.days_active).toBe(1);

    const second = service.startSession();
    expect(second.created).toBe(false);
    expect(events.global.sessions).toBe(2);
    expect(events.global.days_active).toBe(2);
  });

  test("ordinary ensureCompanion calls do not increment sessions or days", () => {
    const { service, events } = makeService();
    service.ensureCompanion();
    service.ensureCompanion();
    service.ensureCompanion();

    expect(events.global.sessions).toBe(0);
    expect(events.global.days_active).toBe(0);
  });

  test("getAchievementProgress surfaces locked next-up achievements from the catalog", () => {
    const { service } = makeService();
    service.startSession();
    const progress = service.getAchievementProgress();
    expect(progress.unlocked.length).toBeGreaterThan(0);
    expect(progress.remaining.length).toBe(ACHIEVEMENTS.length - progress.unlocked.length);
    expect(progress.remaining[0]).toBeDefined();
  });

  test("petBuddy records a reaction and increments slot counters", () => {
    const { service, buddies, reactions, events } = makeService();
    const ensured = service.ensureCompanion();

    const result = service.petBuddy();

    expect(result.companion.name).toBe(ensured.companion.name);
    expect(reactions.loadLatest()?.reaction.length).toBeGreaterThan(0);
    expect(events.loadCounters(buddies.loadActiveSlot() ?? undefined).pets).toBe(1);
    expect(events.loadCounters(buddies.loadActiveSlot() ?? undefined).reactions_given).toBe(1);
  });

  test("renameBuddy updates the active companion", () => {
    const { service, buddies } = makeService();
    service.ensureCompanion();

    const renamed = service.renameBuddy("Pixel");

    expect(renamed.name).toBe("Pixel");
    expect(buddies.loadActive()?.name).toBe("Pixel");
  });

  test("setPersonalityForSlot updates the slot only when personality is still the expected value", () => {
    const { service, buddies } = makeService();
    const { companion, slot } = service.ensureCompanion();
    const originalPersonality = companion.personality;

    const updated = service.setPersonalityForSlot(slot, "Curious now", originalPersonality);
    expect(updated?.personality).toBe("Curious now");
    expect(buddies.loadSlot(slot)?.personality).toBe("Curious now");
  });

  test("setPersonalityForSlot returns null and does not overwrite if personality changed", () => {
    const { service, buddies } = makeService();
    const { slot } = service.ensureCompanion();
    service.setPersonality("Already edited");

    const updated = service.setPersonalityForSlot(slot, "Ignored", "original generic");
    expect(updated).toBeNull();
    expect(buddies.loadSlot(slot)?.personality).toBe("Already edited");
  });

  test("saveBuddy creates a new named slot and summonBuddy can switch to it", () => {
    const { service, buddies } = makeService();
    const initial = service.ensureCompanion();

    const saved = service.saveBuddy("backup");
    const summoned = service.summonBuddy("backup");

    expect(saved.slot).toBe("backup");
    expect(buddies.loadSlot("backup")?.name).toBe(initial.companion.name);
    expect(summoned?.slot).toBe("backup");
    expect(buddies.loadActiveSlot()).toBe("backup");
  });
  test("saveBuddy with no slot updates the active companion", () => {
    const { service, buddies } = makeService();
    const { slot: initialSlot } = service.ensureCompanion();

    service.renameBuddy("Pixel");
    const saved = service.saveBuddy();

    expect(saved.slot).toBe(initialSlot);
    expect(buddies.listSlots().length).toBe(1);
    expect(buddies.loadSlot(initialSlot)?.name).toBe("Pixel");
  });

  test("saveBuddy rejects collision for explicit non-active slot", () => {
    const { service, buddies } = makeService();
    const { slot: initialSlot } = service.ensureCompanion();

    service.saveBuddy("backup");
    buddies.saveActiveSlot(initialSlot);

    expect(() => service.saveBuddy("backup")).toThrow(/already exists/);
  });

  test("dismissBuddy removes a non-active slot", () => {
    const { service, buddies } = makeService();
    const { slot: initialSlot } = service.ensureCompanion();

    service.saveBuddy("backup");
    buddies.saveActiveSlot(initialSlot);

    const dismissed = service.dismissBuddy("backup");

    expect(dismissed.slot).toBe("backup");
    expect(buddies.loadSlot("backup")).toBeNull();
  });
  test("mergeAchievements deduplicates by id while preserving the latest entry", () => {
    const first: Achievement = { id: "first_steps", name: "First", description: "first", icon: "🌟", check: () => true, secret: false };
    const second: Achievement = { id: "power_user", name: "Power", description: "power", icon: "⚡", check: () => false, secret: false };
    const updated: Achievement = { id: "first_steps", name: "First Updated", description: "first", icon: "🌟", check: () => true, secret: false };

    const merged = mergeAchievements([first, second], [updated]);
    expect(merged.map((a) => a.id)).toEqual(["first_steps", "power_user"]);
    expect(merged.find((a) => a.id === "first_steps")?.name).toBe("First Updated");
  });

  test("incrementCommandsRun returns newly unlocked achievements", () => {
    const { service, events } = makeService();
    service.ensureCompanion();
    events.global.commands_run = 49;

    const result = service.incrementCommandsRun();

    expect(events.global.commands_run).toBe(50);
    expect(result.some((a) => a.id === "power_user")).toBe(true);
  });

  test("startSession merges creation and session achievements", () => {
    const { service, events } = makeService();
    events.global.commands_run = 50;

    const result = service.startSession();

    expect(result.created).toBe(true);
    expect(result.achievements.some((a) => a.id === "first_steps")).toBe(true);
    expect(result.achievements.some((a) => a.id === "power_user")).toBe(true);
  });
});

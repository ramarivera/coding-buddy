import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { configuredSharedUserId } from "../../core/identity.ts";
import {
  EMPTY_GLOBAL,
  EMPTY_SLOT,
  GLOBAL_KEYS,
  SLOT_KEYS,
  type Achievement,
  type GlobalCounters,
  type SlotCounters,
} from "../../core/achievements.ts";
import type {
  BuddyConfig,
  Companion,
  EventCounters,
  ReactionState,
  UnlockedAchievement,
} from "../../core/model.ts";
import type {
  BuddyConfigRepository,
  BuddyEventRepository,
  BuddyRepository,
  ReactionRepository,
} from "../../core/ports.ts";

export interface FileBuddyConfig extends BuddyConfig {
  muted: boolean;
}

interface MenagerieManifest {
  active: string;
  companions: Record<string, Companion>;
}

interface ActiveDayState {
  lastDate: string;
  totalDays: number;
}

export const DEFAULT_FILE_BUDDY_CONFIG: FileBuddyConfig = {
  commentCooldown: 30,
  reactionTTL: 0,
  bubbleStyle: "classic",
  bubblePosition: "top",
  showRarity: true,
  statusLineEnabled: true,
  statuslineDensity: "auto",
  turnCommentModel: undefined,
  turnCommentTimeoutMs: undefined,
  muted: false,
};

function isSlotKey(key: keyof EventCounters): key is keyof SlotCounters {
  return (SLOT_KEYS as readonly string[]).includes(key);
}

function isGlobalKey(key: keyof EventCounters): key is keyof GlobalCounters {
  return (GLOBAL_KEYS as readonly string[]).includes(key);
}
function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string"
  );
}
function sleepMs(ms: number): void {
  const target = Date.now() + ms;
  while (Date.now() < target) {}
}
const LOCK_STALE_MS = 3000;

class LockOwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LockOwnershipError";
  }
}

function parseOwner(content: string): { pid?: number; token?: string } {
  const raw = content.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      return {
        pid: Number(parsed.pid),
        token: typeof parsed.token === "string" ? parsed.token : undefined,
      };
    }
  } catch {
    // Legacy plain-number owner file.
  }
  const pid = Number(raw);
  return Number.isFinite(pid) ? { pid } : {};
}

export class FileBuddyStorage
  implements BuddyRepository, ReactionRepository, BuddyConfigRepository, BuddyEventRepository
{
  constructor(
    readonly stateDir: string,
    private readonly defaultConfig: FileBuddyConfig = DEFAULT_FILE_BUDDY_CONFIG,
  ) {}

  private currentLockToken: string | null = null;


  private path(name: string): string {
    return join(this.stateDir, name);
  }

  private ensureDir(): void {
    if (!existsSync(this.stateDir)) mkdirSync(this.stateDir, { recursive: true });
  }

  private atomicWrite(path: string, value: string): void {
    this.ensureDir();
    const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
    writeFileSync(temporaryPath, value, "utf8");
    try {
      if (this.currentLockToken) {
        this.assertLockOwner();
      }
      renameSync(temporaryPath, path);
    } catch (error) {
      try {
        rmSync(temporaryPath, { force: true });
      } catch {
        // Ignore cleanup failure.
      }
      throw error;
    }
  }

  private lockDir(): string {
    return this.path(".lock");
  }

  private assertLockOwner(): void {
    const token = this.currentLockToken;
    if (!token) {
      throw new LockOwnershipError("No active lock for atomic commit.");
    }
    const ownerPath = join(this.lockDir(), "owner");
    let raw = "";
    try {
      raw = readFileSync(ownerPath, "utf8");
    } catch {
      throw new LockOwnershipError("Lock owner file missing during commit.");
    }
    const owner = parseOwner(raw);
    if (owner.token !== token) {
      throw new LockOwnershipError("Lock token mismatch during commit.");
    }
  }

  private releaseLockIfOwner(): void {
    const token = this.currentLockToken;
    this.currentLockToken = null;
    if (!token) return;
    const lockDir = this.lockDir();
    const ownerPath = join(lockDir, "owner");
    try {
      const owner = parseOwner(readFileSync(ownerPath, "utf8"));
      if (owner.token !== token) {
        return;
      }
      unlinkSync(ownerPath);
      rmdirSync(lockDir);
    } catch {
      // Lock was already released or stolen; never remove someone else's lock.
    }
  }

  private tryAcquireLock(): boolean {
    const lockDir = this.lockDir();
    const token = randomUUID();
    try {
      mkdirSync(lockDir, { mode: 0o700 });
      writeFileSync(
        join(lockDir, "owner"),
        JSON.stringify({ pid: process.pid, token }),
        { mode: 0o600 },
      );
      this.currentLockToken = token;
      return true;
    } catch (err) {
      if (!isNodeError(err) || err.code !== "EEXIST") {
        throw err;
      }

      let info;
      try {
        info = statSync(lockDir);
      } catch {
        return false;
      }

      if (Date.now() - info.mtime.getTime() <= LOCK_STALE_MS) {
        return false;
      }

      // The lock directory is stale. Try to atomically rename it into a unique
      // quarantine path. Only one contender can win the rename; the rest see
      // ENOENT and retry mkdir on the now-empty path.
      const quarantine = `${lockDir}.quarantine-${process.pid}-${randomUUID()}`;
      try {
        renameSync(lockDir, quarantine);
      } catch (renameErr) {
        if (isNodeError(renameErr) && renameErr.code === "ENOENT") {
          return false;
        }
        return false;
      }

      // We won the rename. The quarantine must be our stale lock; remove it
      // and let the outer loop retry mkdir on the vacated lock path.
      try {
        rmSync(quarantine, { recursive: true, force: true });
      } catch {
        // Quarantine may contain leftover files; ignore cleanup failures.
      }
      return false;
    }
  }

  private withLock<T>(operation: () => T): T {
    this.ensureDir();
    const start = Date.now();
    let lastError: Error | undefined;

    while (Date.now() - start < 5000) {
      if (this.tryAcquireLock()) {
        try {
          return operation();
        } catch (error) {
          if (error instanceof LockOwnershipError) {
            lastError = error;
            continue;
          }
          throw error;
        } finally {
          this.releaseLockIfOwner();
        }
      }
      sleepMs(5);
    }

    throw lastError ?? new Error(`Could not acquire buddy lock for ${this.stateDir}`);
  }

  private readJson<T extends object>(path: string, fallback: T): T {
    try {
      return { ...fallback, ...JSON.parse(readFileSync(path, "utf8")) };
    } catch {
      return { ...fallback };
    }
  }

  private loadManifest(): MenagerieManifest {
    const manifest = this.readJson<MenagerieManifest>(this.path("menagerie.json"), {
      active: "buddy",
      companions: {},
    });
    if (!manifest.companions) manifest.companions = {};
    if (!manifest.active) manifest.active = Object.keys(manifest.companions)[0] ?? "buddy";
    return manifest;
  }

  private saveManifest(manifest: MenagerieManifest): void {
    this.atomicWrite(this.path("menagerie.json"), JSON.stringify(manifest, null, 2));
  }


  private slotEventsFile(slot: string): string {
    return this.path(`events.${slot}.json`);
  }

  loadActive(): Companion | null {
    const manifest = this.loadManifest();
    return manifest.companions[manifest.active] ?? null;
  }

  saveActive(companion: Companion): void {
    this.withLock(() => {
      const manifest = this.loadManifest();
      manifest.companions[manifest.active] = companion;
      this.saveManifest(manifest);
    });
  }

  updateActive(transform: (companion: Companion) => Companion): Companion {
    return this.withLock(() => {
      const manifest = this.loadManifest();
      const active = manifest.companions[manifest.active];
      if (!active) throw new Error("No active companion.");
      const updated = transform(active);
      manifest.companions[manifest.active] = updated;
      this.saveManifest(manifest);
      return updated;
    });
  }

  updateSlot(
    slot: string,
    transform: (companion: Companion) => Companion | null,
  ): Companion | null {
    return this.withLock(() => {
      const manifest = this.loadManifest();
      const existing = manifest.companions[slot];
      if (!existing) return null;
      const updated = transform(existing);
      if (!updated) return null;
      manifest.companions[slot] = updated;
      this.saveManifest(manifest);
      return updated;
    });
  }

  loadSlot(slot: string): Companion | null {
    return this.loadManifest().companions[slot] ?? null;
  }

  saveSlot(slot: string, companion: Companion): void {
    this.withLock(() => {
      const manifest = this.loadManifest();
      if (manifest.companions[slot]) throw new Error(`Slot "${slot}" already exists.`);
      manifest.companions[slot] = companion;
      this.saveManifest(manifest);
    });
  }

  deleteSlot(slot: string): void {
    this.withLock(() => {
      const manifest = this.loadManifest();
      delete manifest.companions[slot];
      if (manifest.active === slot) {
        manifest.active = Object.keys(manifest.companions)[0] ?? "buddy";
      }
      this.saveManifest(manifest);
    });
  }

  listSlots(): Array<{ slot: string; companion: Companion }> {
    return Object.entries(this.loadManifest().companions).map(([slot, companion]) => ({
      slot,
      companion,
    }));
  }

  loadActiveSlot(): string | null {
    const manifest = this.loadManifest();
    if (manifest.active && manifest.companions[manifest.active]) return manifest.active;
    return Object.keys(manifest.companions)[0] ?? null;
  }

  saveActiveSlot(slot: string): void {
    this.withLock(() => {
      const manifest = this.loadManifest();
      manifest.active = slot;
      this.saveManifest(manifest);
    });
  }

  ensureCompanion(
    userId: string,
    create: (existingSlots: string[]) => { companion: Companion; slot: string },
  ): { companion: Companion; slot: string; created: boolean } {
    return this.withLock(() => {
      const manifest = this.loadManifest();
      const active = manifest.companions[manifest.active];
      if (active) {
        return { companion: active, slot: manifest.active, created: false };
      }

      const slots = Object.entries(manifest.companions);
      if (slots.length > 0) {
        const [slot, companion] = slots[0];
        manifest.active = slot;
        this.saveManifest(manifest);
        return { companion, slot, created: false };
      }

      const existingSlots = Object.keys(manifest.companions);
      const { companion, slot } = create(existingSlots);
      manifest.companions[slot] = companion;
      manifest.active = slot;
      this.saveManifest(manifest);
      return { companion, slot, created: true };
    });
  }

  loadLatest(): ReactionState | null {
    try {
      const reaction = JSON.parse(readFileSync(this.path("reaction.json"), "utf8")) as ReactionState;
      const ttl = this.loadHostConfig().reactionTTL;
      if (ttl > 0 && Date.now() - reaction.timestamp > ttl * 1000) return null;
      return reaction;
    } catch {
      return null;
    }
  }

  saveLatest(reaction: ReactionState): void {
    this.atomicWrite(this.path("reaction.json"), JSON.stringify(reaction, null, 2));
  }

  clearLatestReaction(): void {
    this.saveLatest({ reaction: "", reason: "clear", timestamp: Date.now() });
  }

  loadConfig(): BuddyConfig {
    return this.loadHostConfig();
  }

  saveConfig(config: Partial<BuddyConfig>): BuddyConfig {
    return this.saveHostConfig(config);
  }

  loadHostConfig(): FileBuddyConfig {
    return this.readJson<FileBuddyConfig>(this.path("config.json"), this.defaultConfig);
  }

  saveHostConfig(config: Partial<FileBuddyConfig>): FileBuddyConfig {
    const merged = { ...this.loadHostConfig(), ...config };
    this.atomicWrite(this.path("config.json"), JSON.stringify(merged, null, 2));
    return merged;
  }

  isMuted(): boolean {
    return this.loadHostConfig().muted;
  }

  setMuted(muted: boolean): FileBuddyConfig {
    return this.saveHostConfig({ muted });
  }

  loadCounters(slot?: string): EventCounters {
    const global = this.readJson<GlobalCounters>(this.path("events.json"), EMPTY_GLOBAL);
    if (!slot) return { ...global, ...EMPTY_SLOT };
    const slotCounters = this.readJson<SlotCounters>(this.slotEventsFile(slot), EMPTY_SLOT);
    return { ...global, ...slotCounters };
  }

  increment(key: keyof EventCounters, amount = 1, slot?: string): EventCounters {
    return this.withLock(() => {
      if (isSlotKey(key) && slot) {
        const slotCounters = this.readJson<SlotCounters>(this.slotEventsFile(slot), EMPTY_SLOT);
        slotCounters[key] += amount;
        this.atomicWrite(this.slotEventsFile(slot), JSON.stringify(slotCounters, null, 2));
      } else if (isGlobalKey(key)) {
        const global = this.readJson<GlobalCounters>(this.path("events.json"), EMPTY_GLOBAL);
        global[key] += amount;
        this.atomicWrite(this.path("events.json"), JSON.stringify(global, null, 2));
      }
      return this.loadCounters(slot);
    });
  }

  loadUnlocked(): UnlockedAchievement[] {
    try {
      return JSON.parse(readFileSync(this.path("unlocked.json"), "utf8")) as UnlockedAchievement[];
    } catch {
      return [];
    }
  }

  saveUnlocked(unlocked: UnlockedAchievement[]): void {
    this.atomicWrite(this.path("unlocked.json"), JSON.stringify(unlocked, null, 2));
  }

  unlockAchievements(
    slot: string | undefined,
    evaluate: (counters: EventCounters, unlockedIds: Set<string>) => Achievement[],
  ): Achievement[] {
    return this.withLock(() => {
      const counters = this.loadCounters(slot);
      const unlocked = this.loadUnlocked();
      const unlockedIds = new Set(unlocked.map((entry) => entry.id));
      const newlyUnlocked = evaluate(counters, unlockedIds);
      if (newlyUnlocked.length === 0) return [];
      this.saveUnlocked([
        ...unlocked,
        ...newlyUnlocked.map((achievement) => ({
          id: achievement.id,
          unlockedAt: Date.now(),
          slot,
        })),
      ]);
      return newlyUnlocked;
    });
  }

  trackActiveDay(): void {
    this.withLock(() => {
      const today = new Date().toISOString().slice(0, 10);
      const current = this.readJson<ActiveDayState>(this.path("active_days.json"), {
        lastDate: "",
        totalDays: 0,
      });
      if (current.lastDate === today) return;

      const next = { lastDate: today, totalDays: current.totalDays + 1 };
      this.atomicWrite(this.path("active_days.json"), JSON.stringify(next, null, 2));

      const global = this.readJson<GlobalCounters>(this.path("events.json"), EMPTY_GLOBAL);
      global.days_active = next.totalDays;
      this.atomicWrite(this.path("events.json"), JSON.stringify(global, null, 2));
    });
  }

  ensureStableIdentity(): string {
    const sharedUserId = configuredSharedUserId();
    if (sharedUserId) return sharedUserId;

    return this.withLock(() => {
      this.ensureDir();
      try {
        const parsed = JSON.parse(readFileSync(this.path("identity.json"), "utf8")) as {
          userId?: string;
        };
        if (parsed.userId) return parsed.userId;
      } catch {
        // Create a stable identity below.
      }

      const userId = randomUUID();
      this.atomicWrite(this.path("identity.json"), JSON.stringify({ userId }, null, 2));
      return userId;
    });
  }
}

export { slugifySlot } from "../../core/slot-slug.ts";

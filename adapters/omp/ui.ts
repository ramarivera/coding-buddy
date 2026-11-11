import type { OmpBuddyUiContext } from "./context.ts";
import type { Achievement } from "../../core/achievements.ts";
import type { Companion, ReactionState } from "../../core/model.ts";
import { renderAchievementsSummary } from "./renderers.ts";
import { OmpBuddyStorage } from "./storage.ts";
import { BuddyWidget } from "../shared/widget-layout.ts";

export class OmpBuddyUI {
  private readonly timers: Array<{ timer: Timer; clear: (timer: Timer) => void }> = [];
  private readonly buddy = new BuddyWidget();

  constructor(private readonly storage: OmpBuddyStorage) {}

  cancelTimers(): void {
    for (const { timer, clear } of this.timers.splice(0)) {
      try {
        clear(timer);
      } catch {
        // Ignore cleanup errors.
      }
    }
  }

  dispose(): void {
    this.cancelTimers();
    this.buddy.dispose();
  }

  refresh(
    ctx: OmpBuddyUiContext,
    companion: Companion,
    reaction?: ReactionState | null,
    achievements: Achievement[] = [],
  ): void {
    const currentReaction = reaction ?? null;
    const muted = this.storage.isMuted();
    const scheduler = getScheduler(ctx);

    ctx.ui.setStatus("buddy", undefined);
    this.buddy.refresh(
      (lines) => ctx.ui.setWidget("buddy", lines),
      companion,
      muted ? null : currentReaction,
      [...achievements],
      scheduler ?? undefined,
    );

    this.cancelTimers();
    if (!currentReaction) return;

    const ttl = this.storage.loadConfig().reactionTTL;
    if (ttl <= 0) return;
    if (!scheduler) return;

    const reactionTimestamp = currentReaction.timestamp;
    const delay = Math.max(0, reactionTimestamp + ttl * 1000 + 1 - Date.now());
    const timer = scheduler.setTimeout(() => {
      const latest = this.storage.loadLatest();
      if (latest && latest.timestamp >= reactionTimestamp) {
        this.refresh(ctx, companion, latest, []);
      } else {
        this.refresh(ctx, companion, null, []);
      }
    }, delay);
    this.timers.push({ timer, clear: scheduler.clearTimer });
  }

  notifyAchievements(ctx: OmpBuddyUiContext, achievements: Achievement[]): void {
    for (const achievement of achievements) {
      ctx.ui.notify(`Unlocked: ${achievement.icon} ${achievement.name}`, "info");
    }
  }

  showAchievements(
    ctx: OmpBuddyUiContext,
    unlocked: Array<{ achievement: Achievement; unlockedAt: number; slot?: string }>,
    remaining: Achievement[],
  ): void {
    this.buddy.clear();
    ctx.ui.setWidget("buddy", renderAchievementsSummary(unlocked, remaining));
    ctx.ui.notify(`Achievements: ${unlocked.length} unlocked`, "info");
  }
}

function getScheduler(
  ctx: OmpBuddyUiContext,
): { setTimeout: (callback: () => void, ms?: number) => Timer; clearTimer: (timer: Timer) => void } | null {
  if (typeof ctx.setTimeout === "function" && typeof ctx.clearTimer === "function") {
    return { setTimeout: ctx.setTimeout, clearTimer: ctx.clearTimer };
  }
  if (typeof globalThis.setTimeout === "function" && typeof globalThis.clearTimeout === "function") {
    return { setTimeout: globalThis.setTimeout, clearTimer: globalThis.clearTimeout };
  }
  return null;
}

import type { OmpBuddyUiContext } from "./context.ts";
import type { Achievement } from "../../core/achievements.ts";
import type { Companion, ReactionState } from "../../core/model.ts";
import { renderAchievementsSummary } from "./renderers.ts";
import { OmpBuddyStorage } from "./storage.ts";
import { BuddyWidget } from "../shared/widget-layout.ts";

export class OmpBuddyUI {
  private readonly timers = new Map<string, Array<{ timer: Timer; clear: (timer: Timer) => void }>>();
  private readonly buddies = new Map<string, BuddyWidget>();

  constructor(private readonly storage: OmpBuddyStorage) {}

  cancelTimers(scope?: string): void {
    const scopes = scope === undefined ? [...this.timers.keys()] : [scope];
    for (const key of scopes) for (const { timer, clear } of this.timers.get(key) ?? []) {
      try {
        clear(timer);
      } catch {
        // Ignore cleanup errors.
      }
    }
    if (scope === undefined) this.timers.clear();
    else this.timers.delete(scope);
  }

  dispose(): void {
    this.cancelTimers();
    for (const buddy of this.buddies.values()) buddy.dispose();
    this.buddies.clear();
  }

  disposeOtherSessions(activeScope: string): void {
    for (const [scope, buddy] of this.buddies) {
      if (scope === activeScope) continue;
      this.cancelTimers(scope);
      buddy.dispose();
      this.buddies.delete(scope);
    }
  }

  refresh(
    ctx: OmpBuddyUiContext,
    companion: Companion,
    reaction?: ReactionState | null,
    achievements: Achievement[] = [],
    scope = "default",
  ): void {
    const currentReaction = reaction ?? null;
    const muted = this.storage.isMuted();
    const scheduler = getScheduler(ctx);

    ctx.ui.setStatus("buddy", undefined);
    let buddy = this.buddies.get(scope);
    if (!buddy) {
      buddy = new BuddyWidget();
      this.buddies.set(scope, buddy);
    }
    buddy.refresh(
      (lines) => ctx.ui.setWidget("buddy", lines),
      companion,
      muted ? null : currentReaction,
      [...achievements],
      scheduler ?? undefined,
    );

    this.cancelTimers(scope);
    if (!currentReaction) return;

    const ttl = this.storage.loadConfig().reactionTTL;
    if (ttl <= 0) return;
    if (!scheduler) return;

    const reactionTimestamp = currentReaction.timestamp;
    const delay = Math.max(0, reactionTimestamp + ttl * 1000 + 1 - Date.now());
    const timer = scheduler.setTimeout(() => {
      const latest = this.storage.loadLatest(scope);
      if (latest && latest.timestamp >= reactionTimestamp) {
        this.refresh(ctx, companion, latest, [], scope);
      } else {
        this.refresh(ctx, companion, null, [], scope);
      }
    }, delay);
    this.timers.set(scope, [...(this.timers.get(scope) ?? []), { timer, clear: scheduler.clearTimer }]);
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
    const scope = ctx.sessionManager?.getSessionId?.() ?? "default";
    this.buddies.get(scope)?.clear();
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

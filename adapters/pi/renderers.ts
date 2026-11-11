import type { Achievement } from "../../core/achievements.ts";
import type { Companion, ReactionState } from "../../core/model.ts";
import { getWidgetWidth, renderCompanionWidget, WIDGET_MAX_LINES } from "../shared/widget-layout.ts";

export const PI_WIDGET_MAX_LINES = WIDGET_MAX_LINES;

export function renderBuddyWidget(
  companion: Companion,
  reaction?: ReactionState | null,
  achievements: Achievement[] = [],
  width: number = getWidgetWidth(),
): string[] {
  return renderCompanionWidget(companion, reaction, achievements, width);
}

export function renderBuddyStats(companion: Companion): string[] {
  return [
    `name: ${companion.name}`,
    `species: ${companion.bones.species}`,
    `rarity: ${companion.bones.rarity}`,
    `peak: ${companion.bones.peak}`,
    `dump: ${companion.bones.dump}`,
    "",
    ...Object.entries(companion.bones.stats).map(([stat, value]) => `${stat.padEnd(9)} ${String(value).padStart(3)}`),
  ];
}

export function renderAchievementsSummary(
  unlocked: Array<{ achievement: Achievement; unlockedAt: number; slot?: string }>,
  remaining: Achievement[],
): string[] {
  const lines = [`achievements unlocked: ${unlocked.length}`];

  if (unlocked.length > 0) {
    lines.push("", ...unlocked.map(({ achievement }) => `${achievement.icon} ${achievement.name}`));
  }

  if (remaining.length > 0) {
    lines.push("", `next up: ${remaining[0].icon} ${remaining[0].name}`);
  }

  return lines;
}

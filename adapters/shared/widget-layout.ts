import { RARITY_STARS } from "../../core/engine.ts";
import type { Achievement } from "../../core/achievements.ts";
import { getArtFrame, HAT_ART } from "../../core/render-model.ts";
import type { Companion, ReactionState } from "../../core/model.ts";
import { getRarityColor } from "../../server/theme.ts";

const ANSI_PATTERN = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const ART_GAP = "  ";
const DEFAULT_WIDGET_WIDTH = 78;
const RESET = "\x1b[0m";
const DIM_ITALIC = "\x1b[2;3m";
const resizeSubscribers = new Set<() => void>();
let resizeDispatcher: (() => void) | null = null;

export const WIDGET_MAX_LINES = 10;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

// East-Asian Wide/Fullwidth ranges. These MUST stay in sync with char_width()
// in statusline/buddy-status.sh \u2014 the two surfaces render the same companion
// card, and a disagreement here shears the bubble: borders sized from an
// undercounted width, text rows drawn at their true width.
//
// Box Drawing (U+2500-U+257F) and Block Elements sit inside the CJK span but
// are narrow, so they are carved out explicitly, matching the shell.
const BOX_DRAWING_START = 0x2500; // 9472
const BOX_DRAWING_END = 0x25bf; // 9631
const CJK_START = 0x3000; // 12288 \u2014 CJK punctuation through Hangul syllables
const CJK_END = 0x9fff; // 40959
const FULLWIDTH_START = 0xff01; // 65281 \u2014 Fullwidth ASCII variants
const FULLWIDTH_END = 0xff60; // 65376

function isEastAsianWide(codePoint: number): boolean {
  if (codePoint >= BOX_DRAWING_START && codePoint <= BOX_DRAWING_END) return false;
  if (codePoint >= CJK_START && codePoint <= CJK_END) return true;
  if (codePoint >= FULLWIDTH_START && codePoint <= FULLWIDTH_END) return true;
  return false;
}

function characterWidth(character: string, next?: string): number {
  if (character === "\u200d" || /[\uFE00-\uFE0F]/u.test(character)) return 0;
  if (next === "\uFE0F" && /\p{Emoji}/u.test(character)) return 2;
  if (/\p{Emoji_Presentation}/u.test(character)) return 2;
  const codePoint = character.codePointAt(0);
  return codePoint !== undefined && isEastAsianWide(codePoint) ? 2 : 1;
}

export function displayWidth(text: string): number {
  const characters = [...stripAnsi(text)];
  let width = 0;
  for (let index = 0; index < characters.length; index += 1) {
    width += characterWidth(characters[index]!, characters[index + 1]);
  }
  return width;
}

export function truncateToWidth(text: string, width: number): string {
  if (width <= 0) return "";
  let result = "";
  let currentWidth = 0;
  for (const character of [...stripAnsi(text)]) {
    const nextWidth = characterWidth(character);
    if (currentWidth + nextWidth > width) break;
    result += character;
    currentWidth += nextWidth;
  }
  return result;
}

export function wrapReaction(reaction: string, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  let current = "";

  for (const word of `💬 ${reaction.trim()}`.split(/\s+/)) {
    if (!word) continue;
    if (displayWidth(word) > width) {
      if (current) lines.push(current);
      lines.push(`${truncateToWidth(word, Math.max(1, width - 1))}…`);
      current = "";
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (displayWidth(candidate) > width) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;

  const bounded = lines.slice(0, maxLines);
  const last = bounded[maxLines - 1] ?? "";
  bounded[maxLines - 1] = `${truncateToWidth(last, Math.max(1, width - 1))}…`;
  return bounded;
}

export function getWidgetWidth(): number {
  const columns = process.stdout.columns;
  return columns && columns > 0 ? Math.max(1, columns - 2) : DEFAULT_WIDGET_WIDTH;
}

/** Share one host resize listener across all adapter UI instances. */
export function subscribeToWidgetResize(callback: () => void): () => void {
  resizeSubscribers.add(callback);
  if (!resizeDispatcher) {
    resizeDispatcher = () => {
      for (const subscriber of resizeSubscribers) subscriber();
    };
    process.stdout.on("resize", resizeDispatcher);
  }

  return () => {
    resizeSubscribers.delete(callback);
    if (resizeSubscribers.size === 0 && resizeDispatcher) {
      process.stdout.removeListener("resize", resizeDispatcher);
      resizeDispatcher = null;
    }
  };
}

export function getDetailsWidth(art: string[], width: number = getWidgetWidth()): number {
  const artWidth = Math.max(...art.map(displayWidth), 0);
  return Math.max(8, Math.max(24, width) - artWidth - ART_GAP.length);
}

export function composeDetailsAndArt(
  details: string[],
  art: string[],
  width: number = getWidgetWidth(),
  maxLines: number = WIDGET_MAX_LINES,
): string[] {
  const artWidth = Math.max(...art.map(displayWidth), 0);
  const sideWidth = getDetailsWidth(art, width);
  const rows = Math.max(art.length, details.length);

  return Array.from({ length: Math.min(maxLines, rows) }, (_, index) => {
    const artLine = art[index] ?? "";
    const detailLine = details[index] ?? "";
    const boundedDetailLine = displayWidth(detailLine) > sideWidth ? truncateToWidth(detailLine, sideWidth) : detailLine;
    return `${boundedDetailLine}${" ".repeat(Math.max(0, sideWidth - displayWidth(boundedDetailLine)))}${ART_GAP}${artLine}${" ".repeat(Math.max(0, artWidth - displayWidth(artLine)))}`;
  });
}

function trimArt(line: string): string {
  return line.replace(/\s+$/g, "");
}

function centerToWidth(text: string, width: number): string {
  const bounded = truncateToWidth(text, width);
  const remaining = Math.max(0, width - displayWidth(bounded));
  const left = Math.floor(remaining / 2);
  return `${" ".repeat(left)}${bounded}${" ".repeat(remaining - left)}`;
}

function padLine(line: string, width: number): string {
  const bounded = displayWidth(line) > width ? truncateToWidth(line, width) : line;
  return `${bounded}${" ".repeat(Math.max(0, width - displayWidth(bounded)))}`;
}

function frameReaction(reaction: string, achievements: Achievement[], innerWidth: number): string[] {
  const maxContentLines = WIDGET_MAX_LINES - 2;
  const trimmedReaction = reaction.trim();
  const achievementLines = achievements.map((achievement) => `🏆 ${achievement.name}`);
  const reactionMax = Math.max(0, maxContentLines - achievementLines.length);
  const reactionLines = trimmedReaction ? wrapReaction(trimmedReaction, innerWidth, reactionMax) : [];
  const content = reactionLines.concat(achievementLines).slice(0, maxContentLines);
  const paddedContent = content.length === 1 ? ["", ...content] : content;

  const top = `.${"-".repeat(innerWidth + 2)}.`;
  const bottom = `\`${"-".repeat(innerWidth + 2)}'`;
  return [
    top,
    ...paddedContent.map((line) => `| ${DIM_ITALIC}${padLine(line, innerWidth)}${RESET} |`),
    bottom,
  ];
}

/**
 * Render the hero card shared by the OMP, Pi, and Claude Code surfaces.
 * The bubble is deliberately dropped as a unit when the sprite cannot fit.
 */
export function renderCompanionWidget(
  companion: Companion,
  reaction: ReactionState | null | undefined,
  achievements: Achievement[] = [],
  width: number = getWidgetWidth(),
  frame: number = Math.floor(Date.now() / 700),
): string[] {
  const safeWidth = Math.max(1, Math.floor(width));
  const art = getArtFrame(companion.bones.species, companion.bones.eye, frame).map(trimArt);
  if (companion.bones.hat !== "none" && !art[0]?.trim()) art[0] = HAT_ART[companion.bones.hat];

  const color = getRarityColor(companion.bones.rarity);
  const label = `${companion.name} ${RARITY_STARS[companion.bones.rarity]}${companion.bones.shiny ? " ✨" : ""}`;
  const artWidth = Math.max(...art.map(displayWidth), 0);
  const labelWidth = displayWidth(label);
  const spriteWidth = Math.min(safeWidth, Math.max(artWidth, labelWidth));
  const clippedArt = art.map((line) => `${color}${padLine(line, spriteWidth)}${RESET}`);
  const clippedLabel = `${color}${centerToWidth(label, spriteWidth)}${RESET}`;

  const minBubbleInner = 12;
  const tailWidth = 3;
  const maxBubbleInner = safeWidth - spriteWidth - tailWidth - 4;
  const hasContent = Boolean(reaction?.reaction?.trim()) || achievements.length > 0;
  const canFrame = hasContent && maxBubbleInner >= minBubbleInner;
  const bubbleInner = canFrame ? maxBubbleInner : 0;
  const bubble = canFrame ? frameReaction(reaction?.reaction ?? "", achievements, bubbleInner) : [];
  const bubbleWidth = bubbleInner + 4;
  const cardWidth = canFrame ? bubbleWidth + tailWidth + spriteWidth : spriteWidth;

  const achievementSprites = canFrame
    ? []
    : achievements.map((achievement) => `${DIM_ITALIC}${padLine(`🏆 ${achievement.name}`, spriteWidth)}${RESET}`);
  const spriteBody = [...clippedArt, clippedLabel, ...achievementSprites];
  const height = Math.max(spriteBody.length, bubble.length);
  const connectorRow = canFrame ? Math.min(bubble.length - 2, Math.max(1, Math.floor(bubble.length / 2))) : -1;

  return Array.from({ length: Math.min(WIDGET_MAX_LINES, height) }, (_, index) => {
    const spriteLine = spriteBody[index] ?? "";
    const sprite = padLine(spriteLine, spriteWidth);
    let body: string;
    if (canFrame) {
      const bubbleLine = bubble[index] ?? " ".repeat(bubbleWidth);
      const tail = index === connectorRow ? "-- " : "   ";
      body = `${bubbleLine}${tail}${sprite}`;
    } else {
      body = sprite;
    }
    return `${" ".repeat(Math.max(0, safeWidth - cardWidth))}${body}`;
  });
}

export interface BuddyWidgetScheduler {
  setTimeout(callback: () => void, ms?: number): Timer;
  clearTimer(timer: Timer): void;
}

/**
 * Width-aware buddy widget manager.
 *
 * Renders once when state arrives, then re-renders with the current terminal
 * width after coalescing rapid process.stdout resize events. Callers supply
 * only their harness `setWidget` and the current state; this class owns the
 * resize subscription, debounce, and re-render logic.
 */
export class BuddyWidget {
  private readonly getWidth: () => number;
  private scheduler: BuddyWidgetScheduler;
  private readonly coalesceMs: number;
  private setWidget: ((lines: string[]) => void) | null = null;
  private state: { companion: Companion; reaction: ReactionState | null; achievements: Achievement[] } | null = null;
  private resizeUnsubscribe: (() => void) | null = null;
  private timer: Timer | null = null;

  constructor(options?: {
    getWidth?: () => number;
    scheduler?: BuddyWidgetScheduler;
    coalesceMs?: number;
  }) {
    this.getWidth = options?.getWidth ?? getWidgetWidth;
    this.scheduler = options?.scheduler ?? {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimer: globalThis.clearTimeout.bind(globalThis),
    };
    this.coalesceMs = options?.coalesceMs ?? 50;
  }

  /**
   * Render immediately with the current state and start (or renew) the shared
   * resize subscription. The `setWidget` callback is the adapter's harness
   * setter bound to the current UI context.
   */
  refresh(
    setWidget: (lines: string[]) => void,
    companion: Companion,
    reaction: ReactionState | null,
    achievements: Achievement[] = [],
    scheduler?: BuddyWidgetScheduler,
  ): void {
    // Cancel any pending resize timer before swapping the scheduler or state
    // so clearTimer is always paired with the scheduler that created the timer.
    this.cancelTimer();
    this.setWidget = setWidget;
    if (scheduler) this.scheduler = scheduler;
    this.state = { companion, reaction, achievements };
    this.renderAndSet();
    this.subscribe();
  }

  /** Stop reacting to resizes without unsubscribing from the shared listener. */
  clear(): void {
    this.cancelTimer();
    this.state = null;
  }

  /** Tear down timers and the shared resize listener. */
  dispose(): void {
    this.cancelTimer();
    this.resizeUnsubscribe?.();
    this.resizeUnsubscribe = null;
    this.state = null;
    this.setWidget = null;
  }

  private subscribe(): void {
    if (this.resizeUnsubscribe) return;
    this.resizeUnsubscribe = subscribeToWidgetResize(() => this.onResize());
  }

  private onResize(): void {
    // A cleared widget has no state/setter to render; don't schedule work.
    if (!this.state || !this.setWidget) return;
    this.cancelTimer();
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = null;
      try {
        this.renderAndSet();
      } catch (error) {
        console.error("BuddyWidget render failed:", error);
      }
    }, this.coalesceMs);
  }
  private renderAndSet(): void {
    if (!this.state || !this.setWidget) return;
    const width = this.getWidth();
    const lines = renderCompanionWidget(this.state.companion, this.state.reaction, this.state.achievements, width);
    this.setWidget(lines);
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      this.scheduler.clearTimer(this.timer);
      this.timer = null;
    }
  }
}

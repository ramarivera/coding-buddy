import { describe, expect, test } from "bun:test";
import type { Achievement } from "../../core/achievements.ts";
import type { Companion, ReactionState } from "../../core/model.ts";
import { displayWidth } from "../shared/widget-layout.ts";
import { PI_WIDGET_MAX_LINES, renderBuddyWidget } from "./renderers.ts";

const companion: Companion = {
  name: "Nimbus",
  personality: "quietly observant",
  userId: "test-user",
  hatchedAt: 0,
  bones: {
    rarity: "uncommon",
    species: "blob",
    eye: "°",
    hat: "none",
    shiny: false,
    peak: "WISDOM",
    dump: "CHAOS",
    stats: { DEBUGGING: 50, PATIENCE: 50, CHAOS: 40, WISDOM: 90, SNARK: 40 },
  },
};

const reaction: ReactionState = {
  reaction: "*watching closely*",
  reason: "turn",
  timestamp: Date.now(),
};

const achievement: Achievement = {
  id: "test-achievement",
  name: "Long Night Debugger",
  description: "test",
  icon: "🏆",
  check: () => true,
  secret: false,
};

describe("Pi buddy renderers", () => {
  test("composes the shared hero card within Pi's widget budget", () => {
    const lines = renderBuddyWidget(companion, reaction, [], 64);
    const plain = lines.join("\n").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
    const artLine = plain.split("\n").find((line) => /\|--/.test(line)) ?? "";

    expect(lines).toHaveLength(6);
    expect(lines.length).toBeLessThanOrEqual(PI_WIDGET_MAX_LINES);
    expect(plain).toContain("Nimbus ★★");
    expect(plain).toContain("💬 *watching closely*");
    expect(plain).toMatch(/^ *\.[-]+\.\s*$/m);
    expect(artLine).toContain("--");
    expect(artLine).toMatch(/\|--\s+\S/);
    expect(displayWidth(artLine)).toBe(64);
    expect(lines.every((line) => displayWidth(line) <= 64)).toBe(true);
  });

  test("renders one wrapped reaction and caps the widget height", () => {
    const longReaction = "the stray new PiBuddyStorage() on every turn_end — silent wrong-directory config reads — that is the crack in the file";
    const lines = renderBuddyWidget(companion, { ...reaction, reaction: longReaction }, [], 64);
    const rendered = lines.join("\n");
    const plain = rendered.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");

    expect(plain.match(/💬/g)).toHaveLength(1);
    expect(plain.match(/PiBuddyStorage\(\)/g)).toHaveLength(1);
    expect(lines.length).toBeLessThanOrEqual(PI_WIDGET_MAX_LINES);
  });

  test("keeps rarity ANSI, dim-italic reaction, and full art intact", () => {
    const wyvern: Companion = {
      ...companion,
      name: "Ember",
      bones: { ...companion.bones, rarity: "legendary", species: "wyvern" },
    };
    const rendered = renderBuddyWidget(wyvern, reaction, [], 72).join("\n");

    expect(rendered).toContain("\x1b[38;2;");
    expect(rendered).toContain("\x1b[2;3m");
    expect(rendered).toContain("Ember");
    expect(rendered).toContain("★★★★★");
    expect(rendered).toContain("|\\^```^/|");
  });

  test("keeps long detail labels within the width contract", () => {
    const lines = renderBuddyWidget({ ...companion, name: "N".repeat(100) }, null, [], 64);

    expect(lines).toHaveLength(6);
    expect(lines.every((line) => displayWidth(line) <= 64)).toBe(true);
    expect(lines.join("\n")).not.toMatch(/^ *\.[-]+\.\s*$/m);
  });

  test("renders achievements in the shared details column", () => {
    const plain = renderBuddyWidget(companion, null, [achievement], 64)
      .join("\n")
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");

    expect(plain).toContain("🏆 Long Night Debugger");
  });
});

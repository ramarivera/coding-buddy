import { describe, expect, test } from "bun:test";
import type { Companion, ReactionState } from "../../core/model.ts";
import { displayWidth, OMP_WIDGET_MAX_LINES, renderBuddyWidget } from "./renderers.ts";

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

describe("OMP buddy renderers", () => {
  test("composes the shared hero card within the SDK height budget", () => {
    const lines = renderBuddyWidget(companion, reaction, [], 64);
    const plain = lines.join("\n").replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
    const artLine = plain.split("\n").find((line) => /\|--/.test(line)) ?? "";

    expect(lines).toHaveLength(6);
    expect(lines.length).toBeLessThanOrEqual(OMP_WIDGET_MAX_LINES);
    expect(plain).toMatch(/^ *\.[-]+\.\s*$/m);
    expect(plain).toContain("Nimbus ★★");
    expect(plain).toContain("💬 *watching closely*");
    expect(artLine).toContain("--");
    expect(artLine).toMatch(/\|--\s+\S/);
    expect(displayWidth(artLine)).toBe(64);
    expect(lines.every((line) => displayWidth(line) <= 64)).toBe(true);
  });

  test("renders one wrapped reaction without a second bubble or status copy", () => {
    const longReaction = "the stray new PiBuddyStorage() on every turn_end — silent wrong-directory config reads — that is the crack in the file";
    const lines = renderBuddyWidget(companion, { ...reaction, reaction: longReaction }, [], 64);
    const rendered = lines.join("\n");
    const plain = rendered.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");

    expect(plain.match(/💬/g)).toHaveLength(1);
    expect(plain.match(/PiBuddyStorage\(\)/g)).toHaveLength(1);
    expect(plain).toMatch(/^ *\.[-]+\.\s*$/m);
    expect(lines.length).toBeLessThanOrEqual(OMP_WIDGET_MAX_LINES);
  });

  test("keeps rarity ANSI and embedded per-part art ANSI intact", () => {
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
});

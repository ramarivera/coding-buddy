/**
 * Unit tests for the deterministic companion-generation engine.
 *
 * The whole point of engine.ts is that generateBones() is a pure function of
 * (userId, salt): the same inputs must always yield the exact same companion,
 * regardless of runtime (Bun or pure-JS wyhash fallback). These tests pin
 * that contract down.
 */

import { describe, test, expect } from "bun:test";
import {
  SALT,
  SPECIES,
  RARITIES,
  STAT_NAMES,
  EYES,
  HATS,
  RARITY_FLOOR,
  hashString,
  mulberry32,
  generateBones,
  renderFace,
  renderCompact,
  resolveEyeGlyph,
  type BuddyBones,
} from "./engine.ts";
import { getArtFrame } from "./render-model.ts";

// ─── hashString ────────────────────────────────────────────────────────────

describe("hashString", () => {
  test("is deterministic for the same input", () => {
    expect(hashString("hello")).toBe(hashString("hello"));
    expect(hashString("claude-buddy")).toBe(hashString("claude-buddy"));
  });

  test("returns a 32-bit unsigned integer", () => {
    const h = hashString("whatever");
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });

  test("different inputs produce different hashes (basic collision check)", () => {
    const samples = ["a", "b", "c", "hello", "world", "claude", "buddy"];
    const hashes = new Set(samples.map(hashString));
    expect(hashes.size).toBe(samples.length);
  });
});

// ─── mulberry32 ────────────────────────────────────────────────────────────

describe("mulberry32", () => {
  test("is deterministic for the same seed", () => {
    const rngA = mulberry32(42);
    const rngB = mulberry32(42);
    for (let i = 0; i < 20; i++) {
      expect(rngA()).toBe(rngB());
    }
  });

  test("produces values in [0, 1)", () => {
    const rng = mulberry32(12345);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test("different seeds diverge", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    // Extremely unlikely that 10 values match by chance
    let matches = 0;
    for (let i = 0; i < 10; i++) {
      if (a() === b()) matches++;
    }
    expect(matches).toBeLessThan(10);
  });
});

// ─── generateBones — determinism & invariants ─────────────────────────────

describe("generateBones", () => {
  const SAMPLE_USER_IDS = [
    "alice",
    "bob",
    "claude-buddy-test-user",
    "00000000-0000-0000-0000-000000000000",
    "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  ];

  test("is deterministic: same userId yields identical bones", () => {
    for (const id of SAMPLE_USER_IDS) {
      const a = generateBones(id);
      const b = generateBones(id);
      expect(a).toEqual(b);
    }
  });

  test("custom salt changes the output", () => {
    const a = generateBones("alice", SALT);
    const b = generateBones("alice", "different-salt");
    // The salt must meaningfully perturb the result. It's theoretically
    // possible but astronomically unlikely that every field matches.
    expect(a).not.toEqual(b);
  });

  test("rarity is always one of the allowed values", () => {
    for (const id of SAMPLE_USER_IDS) {
      const bones = generateBones(id);
      expect(RARITIES).toContain(bones.rarity);
    }
  });

  test("species is always one of the allowed values", () => {
    for (const id of SAMPLE_USER_IDS) {
      const bones = generateBones(id);
      expect(SPECIES).toContain(bones.species);
    }
  });

  test("eye is always one of the allowed eye glyphs", () => {
    for (const id of SAMPLE_USER_IDS) {
      const bones = generateBones(id);
      expect(EYES).toContain(bones.eye);
    }
  });

  test("hat is always one of the allowed hats", () => {
    for (const id of SAMPLE_USER_IDS) {
      const bones = generateBones(id);
      expect(HATS).toContain(bones.hat);
    }
  });

  test("common rarity always has no hat", () => {
    // Brute-force: generate enough buddies to find some commons and check them
    let commonsFound = 0;
    for (let i = 0; i < 200 && commonsFound < 5; i++) {
      const bones = generateBones(`common-check-${i}`);
      if (bones.rarity === "common") {
        commonsFound++;
        expect(bones.hat).toBe("none");
      }
    }
    expect(commonsFound).toBeGreaterThan(0);
  });

  test("peak and dump stats are never the same", () => {
    for (const id of SAMPLE_USER_IDS) {
      const bones = generateBones(id);
      expect(bones.peak).not.toBe(bones.dump);
    }
  });

  test("all stats are integers", () => {
    for (const id of SAMPLE_USER_IDS) {
      const bones = generateBones(id);
      for (const name of STAT_NAMES) {
        expect(Number.isInteger(bones.stats[name])).toBe(true);
      }
    }
  });

  test("peak stat respects its formula: floor + 50..79, capped at 100", () => {
    for (const id of SAMPLE_USER_IDS) {
      const bones = generateBones(id);
      const floor = RARITY_FLOOR[bones.rarity];
      const peakValue = bones.stats[bones.peak];
      // Formula: min(100, floor + 50 + floor(rng() * 30))  →  range [floor+50, min(100, floor+79)]
      expect(peakValue).toBeGreaterThanOrEqual(floor + 50);
      expect(peakValue).toBeLessThanOrEqual(100);
    }
  });

  test("dump stat respects its formula: floor - 10..4, clamped to >= 1", () => {
    for (const id of SAMPLE_USER_IDS) {
      const bones = generateBones(id);
      const floor = RARITY_FLOOR[bones.rarity];
      const dumpValue = bones.stats[bones.dump];
      // Formula: max(1, floor - 10 + floor(rng() * 15))  →  range [max(1, floor-10), floor+4]
      expect(dumpValue).toBeGreaterThanOrEqual(1);
      expect(dumpValue).toBeLessThanOrEqual(floor + 4);
    }
  });

  test("neutral stats are in [floor, floor + 39]", () => {
    for (const id of SAMPLE_USER_IDS) {
      const bones = generateBones(id);
      const floor = RARITY_FLOOR[bones.rarity];
      for (const name of STAT_NAMES) {
        if (name === bones.peak || name === bones.dump) continue;
        expect(bones.stats[name]).toBeGreaterThanOrEqual(floor);
        expect(bones.stats[name]).toBeLessThanOrEqual(floor + 39);
      }
    }
  });

  test("different userIds produce different bones (sanity)", () => {
    // Not a guarantee for any two arbitrary ids, but across 20 distinct ids
    // we expect several distinct combinations.
    const signatures = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const b = generateBones(`user-${i}`);
      signatures.add(
        `${b.rarity}|${b.species}|${b.eye}|${b.hat}|${b.peak}|${b.dump}`,
      );
    }
    expect(signatures.size).toBeGreaterThan(1);
  });

  // ─── Golden snapshots ──────────────────────────────────────────────────
  //
  // These lock down the exact bones for specific user IDs. They exist to
  // catch *any* unintended change to the generation algorithm — wyhash,
  // mulberry32, the rarity table, the hat/eye/species pool ordering, the
  // stat formulas, or the salt. If one of these tests fails, stop and ask
  // "did I mean to change what every existing user's buddy looks like?"
  //
  // The whole point of claude-buddy is that the same user always gets the
  // same companion, forever. That's only true if these stay green.

  test("golden snapshot: 'golden-user-alpha' (common capybara)", () => {
    expect(generateBones("golden-user-alpha")).toEqual({
      rarity: "common",
      species: "capybara",
      eye: "\u00b7",
      hat: "none",
      shiny: false,
      stats: {
        DEBUGGING: 23,
        PATIENCE: 22,
        CHAOS: 9,
        WISDOM: 32,
        SNARK: 59,
      },
      peak: "SNARK",
      dump: "CHAOS",
    });
  });

  test("golden snapshot: 'golden-user-beta' (common chonk)", () => {
    expect(generateBones("golden-user-beta")).toEqual({
      rarity: "common",
      species: "chonk",
      eye: "@",
      hat: "none",
      shiny: false,
      stats: {
        DEBUGGING: 3,
        PATIENCE: 77,
        CHAOS: 40,
        WISDOM: 33,
        SNARK: 5,
      },
      peak: "PATIENCE",
      dump: "DEBUGGING",
    });
  });

  test("golden snapshot: 'legendary-seed-1' (uncommon capybara)", () => {
    // This one is picked because it exercises the non-common rarity branch
    // where hat is drawn from HATS (even though the result still lands on
    // 'none', which is the first hat in the list).
    expect(generateBones("legendary-seed-1")).toEqual({
      rarity: "uncommon",
      species: "capybara",
      eye: "\u25c9",
      hat: "none",
      shiny: false,
      stats: {
        DEBUGGING: 11,
        PATIENCE: 16,
        CHAOS: 20,
        WISDOM: 49,
        SNARK: 76,
      },
      peak: "SNARK",
      dump: "DEBUGGING",
    });
  });

  test("golden snapshot with custom salt is isolated from the default", () => {
    // Using a custom salt should NOT match the default-salt result for the
    // same user ID (and should itself be deterministic).
    const defaultSalt = generateBones("golden-user-alpha");
    const customA = generateBones("golden-user-alpha", "custom-salt-v1");
    const customB = generateBones("golden-user-alpha", "custom-salt-v1");
    expect(customA).toEqual(customB);
    expect(customA).not.toEqual(defaultSalt);
  });
});

// ─── renderFace ────────────────────────────────────────────────────────────

describe("renderFace", () => {
  test("substitutes {E} with the eye glyph", () => {
    expect(renderFace("turtle", "·")).toBe("[·_·]");
    expect(renderFace("cat", "×")).toBe("=×ω×=");
  });

  test("uses the right template per species", () => {
    const eye = "·";
    expect(renderFace("duck", eye)).toBe("(·>");
    expect(renderFace("blob", eye)).toBe("(··)");
    expect(renderFace("robot", eye)).toBe("[··]");
  });

  test("sanitizes persisted descriptor words before face rendering", () => {
    expect(resolveEyeGlyph("normal")).toBe("\u00b0");
    expect(renderFace("duck", "normal")).toBe("(\u00b0>");
  });

  test("shared frame renderer sanitizes persisted descriptor words", () => {
    expect(getArtFrame("duck", "normal")[2]).toContain("  <(\u00b0 )___  ");
  });

  test("never leaves a literal {E} in the output", () => {
    for (const species of SPECIES) {
      for (const eye of EYES) {
        expect(renderFace(species, eye)).not.toContain("{E}");
      }
    }
  });
});

// ─── renderCompact ─────────────────────────────────────────────────────────

describe("renderCompact", () => {
  // A minimal bones fixture — enough for the renderer to consume
  const bones: BuddyBones = {
    rarity: "rare",
    species: "turtle",
    eye: "·",
    hat: "crown",
    shiny: false,
    stats: {
      DEBUGGING: 40,
      PATIENCE: 40,
      CHAOS: 40,
      WISDOM: 85,
      SNARK: 10,
    },
    peak: "WISDOM",
    dump: "SNARK",
  };

  test("includes the buddy name and face", () => {
    const out = renderCompact(bones, "Sesame");
    expect(out).toContain("Sesame");
    expect(out).toContain("[·_·]");
  });

  test("appends the reaction bubble when provided", () => {
    const out = renderCompact(bones, "Sesame", "hello!");
    expect(out).toContain("hello!");
  });

  test("has no reaction bubble when reaction is omitted", () => {
    const out = renderCompact(bones, "Sesame");
    expect(out).not.toContain('"');
  });

  test("shows sparkles for shiny buddies", () => {
    const shinyOut = renderCompact({ ...bones, shiny: true }, "Sesame");
    const plainOut = renderCompact({ ...bones, shiny: false }, "Sesame");
    expect(shinyOut).toContain("\u2728");
    expect(plainOut).not.toContain("\u2728");
  });
});

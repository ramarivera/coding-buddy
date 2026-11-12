import { describe, test, expect } from "bun:test";
import {
  extractGeneratedPersonality,
  generateFallbackName,
  generatePersonalityPrompt,
  getReaction,
  isNameMentioned,
  REACTIONS,
  type ReactionReason,
} from "./reactions.ts";
import { SPECIES, RARITIES, STAT_NAMES } from "./engine.ts";

const INTENTIONALLY_EMPTY_REACTIONS: ReactionReason[] = [
  "snark", "chaos", "patience", "debugging", "wisdom",
];

const REASONS = (Object.keys(REACTIONS) as ReactionReason[]).filter(
  (reason) => !INTENTIONALLY_EMPTY_REACTIONS.includes(reason),
);

describe("getReaction", () => {
  test("returns a non-empty string for every (reason, species, rarity) combo", () => {
    for (const reason of REASONS) {
      for (const species of SPECIES) {
        for (const rarity of RARITIES) {
          const r = getReaction(reason, species, rarity);
          expect(typeof r).toBe("string");
          expect(r.length).toBeGreaterThan(0);
        }
      }
    }
  });

  test("substitutes {line} placeholder when context.line is provided", () => {
    let sawSubstitution = false;
    for (let i = 0; i < 500; i++) {
      const r = getReaction("error", "owl", "common", undefined, { line: 42 });
      if (r.includes("42")) sawSubstitution = true;
      expect(r).not.toContain("{line}");
    }
    expect(sawSubstitution).toBe(true);
  });

  test("substitutes {count} placeholder in test-fail reactions", () => {
    let sawSubstitution = false;
    for (let i = 0; i < 500; i++) {
      const r = getReaction("test-fail", "robot", "common", undefined, { count: 7 });
      if (r.includes("7")) sawSubstitution = true;
      expect(r).not.toContain("{count}");
    }
    expect(sawSubstitution).toBe(true);
  });

  test("substitutes {lines} placeholder in large-diff reactions", () => {
    let sawSubstitution = false;
    for (let i = 0; i < 500; i++) {
      const r = getReaction("large-diff", "dragon", "legendary", undefined, { lines: 999 });
      if (r.includes("999")) sawSubstitution = true;
      expect(r).not.toContain("{lines}");
    }
    expect(sawSubstitution).toBe(true);
  });

  test("substitutes {files} placeholder in commit reactions", () => {
    let sawSubstitution = false;
    for (let i = 0; i < 500; i++) {
      const r = getReaction("commit", "blob", "common", undefined, { files: 5 });
      if (r.includes("5")) sawSubstitution = true;
      expect(r).not.toContain("{files}");
    }
    expect(sawSubstitution).toBe(true);
  });

  test("substitutes {branch} placeholder in branch reactions", () => {
    let sawSubstitution = false;
    for (let i = 0; i < 500; i++) {
      const r = getReaction("branch", "duck", "common", undefined, { branch: "feature" });
      if (r.includes("feature")) sawSubstitution = true;
      expect(r).not.toContain("{branch}");
    }
    expect(sawSubstitution).toBe(true);
  });

  test("works without stats or context", () => {
    for (let i = 0; i < 50; i++) {
      const r = getReaction("pet", "cat", "rare");
      expect(typeof r).toBe("string");
      expect(r.length).toBeGreaterThan(0);
    }
  });

  test("works with stats but no context", () => {
    const stats = { DEBUGGING: 80, PATIENCE: 20, CHAOS: 10, WISDOM: 30, SNARK: 5 };
    for (let i = 0; i < 50; i++) {
      const r = getReaction("error", "cat", "rare", stats);
      expect(typeof r).toBe("string");
      expect(r.length).toBeGreaterThan(0);
    }
  });

  test("high SNARK stats can produce snarky reactions", () => {
    const snarkyStats = { DEBUGGING: 10, PATIENCE: 10, CHAOS: 10, WISDOM: 10, SNARK: 95 };
    let sawSnark = false;
    for (let i = 0; i < 500; i++) {
      const r = getReaction("error", "blob", "common", snarkyStats);
      if (r.includes("unexpected") || r.includes("truly") || r.includes("consider")) {
        sawSnark = true;
      }
    }
    expect(sawSnark).toBe(true);
  });

  test("high PATIENCE stats can produce calm reactions", () => {
    const patientStats = { DEBUGGING: 10, PATIENCE: 95, CHAOS: 10, WISDOM: 10, SNARK: 5 };
    let sawPatience = false;
    for (let i = 0; i < 500; i++) {
      const r = getReaction("error", "blob", "common", patientStats);
      if (r.includes("worse") || r.includes("fixable") || r.includes("steady")) {
        sawPatience = true;
      }
    }
    expect(sawPatience).toBe(true);
  });

  test("low stats do not override reactions", () => {
    const lowStats = { DEBUGGING: 5, PATIENCE: 5, CHAOS: 5, WISDOM: 5, SNARK: 5 };
    for (let i = 0; i < 50; i++) {
      const r = getReaction("error", "owl", "common", lowStats);
      expect(typeof r).toBe("string");
      expect(r.length).toBeGreaterThan(0);
    }
  });

  test("legendary rarity can produce flair", () => {
    let sawFlair = false;
    for (let i = 0; i < 500; i++) {
      const r = getReaction("pet", "dragon", "legendary");
      if (r.includes("legendary") || r.includes("ancient") || r.includes("reality")) {
        sawFlair = true;
      }
    }
    expect(sawFlair).toBe(true);
  });

  test("common rarity never adds flair", () => {
    for (let i = 0; i < 100; i++) {
      const r = getReaction("pet", "cat", "common");
      expect(r).not.toMatch(/legendary aura|epic presence|rare energy|uncommon charm/);
    }
  });

  test("species with no custom pool still returns a general reaction", () => {
    for (const reason of REASONS) {
      for (let i = 0; i < 20; i++) {
        const r = getReaction(reason, "chonk", "common");
        expect(r.length).toBeGreaterThan(0);
      }
    }
  });

  test("git reason reactions work for all species", () => {
    const gitReasons = ["commit", "push", "merge-conflict", "branch", "rebase", "stash", "tag"] as const;
    for (const reason of gitReasons) {
      for (const species of SPECIES) {
        for (let i = 0; i < 10; i++) {
          const r = getReaction(reason, species, "common");
          expect(r.length).toBeGreaterThan(0);
        }
      }
    }
  });

  test("build/quality reason reactions work", () => {
    const qualityReasons = ["lint-fail", "type-error", "build-fail", "security-warning", "deprecation"] as const;
    for (const reason of qualityReasons) {
      for (let i = 0; i < 50; i++) {
        const r = getReaction(reason, "robot", "common");
        expect(r.length).toBeGreaterThan(0);
      }
    }
  });

  test("mood reason reactions work", () => {
    const moods = ["frustrated", "happy", "stuck"] as const;
    for (const mood of moods) {
      for (let i = 0; i < 50; i++) {
        const r = getReaction(mood, "cat", "common");
        expect(r.length).toBeGreaterThan(0);
      }
    }
  });

  test("milestone reason reactions work", () => {
    const milestones = ["all-green", "deploy", "release", "coverage"] as const;
    for (const reason of milestones) {
      for (let i = 0; i < 50; i++) {
        const r = getReaction(reason, "duck", "common");
        expect(r.length).toBeGreaterThan(0);
      }
    }
  });

  test("language reason reactions work", () => {
    const langs = ["lang-python", "lang-rust", "lang-typescript", "lang-go", "lang-haskell"] as const;
    for (const lang of langs) {
      for (let i = 0; i < 50; i++) {
        const r = getReaction(lang, "owl", "common");
        expect(r.length).toBeGreaterThan(0);
      }
    }
  });

  test("holiday reason reactions work", () => {
    const holidays = ["halloween", "christmas", "new-year", "april-fools"] as const;
    for (const holiday of holidays) {
      for (let i = 0; i < 50; i++) {
        const r = getReaction(holiday, "ghost", "common");
        expect(r.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("generateFallbackName", () => {
  test("returns a non-empty string", () => {
    for (let i = 0; i < 20; i++) {
      const name = generateFallbackName();
      expect(typeof name).toBe("string");
      expect(name.length).toBeGreaterThan(0);
    }
  });

  test("names look like words: capitalized, alphabetic, reasonable length", () => {
    for (let i = 0; i < 100; i++) {
      const name = generateFallbackName();
      expect(name).toMatch(/^[A-Z][a-z]+$/);
      expect(name.length).toBeGreaterThanOrEqual(3);
      expect(name.length).toBeLessThanOrEqual(12);
    }
  });

  test("picks multiple distinct names over many calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      seen.add(generateFallbackName());
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("generatePersonalityPrompt", () => {
  const sampleStats = {
    DEBUGGING: 42,
    PATIENCE: 73,
    CHAOS: 12,
    WISDOM: 88,
    SNARK: 55,
  };

  test("includes the species and uppercased rarity", () => {
    const prompt = generatePersonalityPrompt("turtle", "legendary", sampleStats, false);
    expect(prompt).toContain("Species: turtle");
    expect(prompt).toContain("Rarity: LEGENDARY");
  });

  test("includes every stat name and its value", () => {
    const prompt = generatePersonalityPrompt("owl", "rare", sampleStats, false);
    for (const [name, value] of Object.entries(sampleStats)) {
      expect(prompt).toContain(`${name}:${value}`);
    }
  });

  test("marks shiny variants with the SHINY tag", () => {
    const shinyPrompt = generatePersonalityPrompt("dragon", "epic", sampleStats, true);
    const plainPrompt = generatePersonalityPrompt("dragon", "epic", sampleStats, false);
    expect(shinyPrompt).toContain("SHINY");
    expect(plainPrompt).not.toContain("SHINY");
  });

  test("includes the JSON output instruction", () => {
    const prompt = generatePersonalityPrompt("cat", "common", sampleStats, false);
    expect(prompt).toContain('"name"');
    expect(prompt).toContain('"personality"');
  });

  test("includes exactly 4 inspiration vibe words", () => {
    for (let i = 0; i < 20; i++) {
      const prompt = generatePersonalityPrompt("blob", "uncommon", sampleStats, false);
      const match = prompt.match(/Inspiration words: (.+)/);
      expect(match).not.toBeNull();
      const words = match![1].split(",").map((w) => w.trim());
      expect(words.length).toBe(4);
      for (const w of words) {
        expect(w.length).toBeGreaterThan(0);
        expect(w).toMatch(/^[a-z]+$/);
      }
    }
  });

  test("shape is stable: same set of lines in the same order", () => {
    const prompt = generatePersonalityPrompt(
      "penguin", "rare",
      { DEBUGGING: 1, PATIENCE: 2, CHAOS: 3, WISDOM: 4, SNARK: 5 },
      false,
    );
    const lines = prompt.split("\n");
    expect(lines[0]).toMatch(/Generate a coding companion/);
    expect(prompt).toContain("distinct");
    const statsIdx = lines.findIndex((l) => l.startsWith("Stats:"));
    const vibesIdx = lines.findIndex((l) => l.startsWith("Inspiration words:"));
    expect(statsIdx).toBeGreaterThan(-1);
    expect(vibesIdx).toBeGreaterThan(statsIdx);
  });

  test("does not crash for any valid species and rarity", () => {
    for (const species of SPECIES) {
      for (const rarity of RARITIES) {
        const prompt = generatePersonalityPrompt(species, rarity, sampleStats, false);
        expect(typeof prompt).toBe("string");
        expect(prompt.length).toBeGreaterThan(0);
      }
    }
  });

  test("handles stats with arbitrary names", () => {
    const customStats = { FOO: 10, BAR: 20 };
    const prompt = generatePersonalityPrompt("mushroom", "common", customStats, false);
    expect(prompt).toContain("FOO:10");
    expect(prompt).toContain("BAR:20");
  });

  test("all canonical STAT_NAMES flow through cleanly", () => {
    const full: Record<string, number> = {};
    for (const n of STAT_NAMES) full[n] = 50;
    const prompt = generatePersonalityPrompt("duck", "rare", full, false);
    for (const n of STAT_NAMES) {
      expect(prompt).toContain(`${n}:50`);
    }
  });
});

describe("extractGeneratedPersonality", () => {
  test("extracts and trims a valid personality", () => {
    const json = JSON.stringify({ name: "Spark", personality: "  A curious coder.  " });
    expect(extractGeneratedPersonality(json)).toBe("A curious coder.");
  });

  test("extracts personality from JSON embedded in prose", () => {
    const wrapped = `Here is the result:\n\`\`\`json\n${JSON.stringify({ personality: "Embedded." })}\n\`\`\``;
    expect(extractGeneratedPersonality(wrapped)).toBe("Embedded.");
  });

  test("returns null for non-JSON or missing personality", () => {
    expect(extractGeneratedPersonality("not json")).toBeNull();
    expect(extractGeneratedPersonality(JSON.stringify({ name: "Spark" }))).toBeNull();
    expect(extractGeneratedPersonality(JSON.stringify({ personality: "" }))).toBeNull();
    expect(extractGeneratedPersonality(JSON.stringify({ personality: "   " }))).toBeNull();
  });

  test("rejects personalities that exceed the limit", () => {
    const long = "x".repeat(501);
    expect(extractGeneratedPersonality(JSON.stringify({ personality: long }))).toBeNull();
  });

  test("rejects non-string or wrongly typed personality", () => {
    expect(extractGeneratedPersonality(JSON.stringify({ personality: 42 }))).toBeNull();
    expect(extractGeneratedPersonality("[1, 2, 3]")).toBeNull();
  });
});

describe("isNameMentioned", () => {
  test("matches names delimited by punctuation, spaces, or string boundaries", () => {
    expect(isNameMentioned("hello Ember!", "Ember")).toBe(true);
    expect(isNameMentioned("Ember, can you help?", "Ember")).toBe(true);
    expect(isNameMentioned("good to see you, Ember.", "Ember")).toBe(true);
    expect(isNameMentioned("@Ember", "Ember")).toBe(true);
    expect(isNameMentioned(" Ember ", "Ember")).toBe(true);
  });

  test("matches names ending in punctuation or emoji", () => {
    expect(isNameMentioned("I love C++", "C++")).toBe(true);
    expect(isNameMentioned("C++ is great", "C++")).toBe(true);
    expect(isNameMentioned("hi C++, how are you?", "C++")).toBe(true);
    expect(isNameMentioned("Blinky✨ did it", "Blinky✨")).toBe(true);
    expect(isNameMentioned("Blinky✨", "Blinky✨")).toBe(true);
  });

  test("is case-insensitive", () => {
    expect(isNameMentioned("Hello EMBER", "Ember")).toBe(true);
    expect(isNameMentioned("ember", "Ember")).toBe(true);
  });

  test("does not match inside larger words or adjacent word chars", () => {
    expect(isNameMentioned("Emberish", "Ember")).toBe(false);
    expect(isNameMentioned("notEmber", "Ember")).toBe(false);
    expect(isNameMentioned("Ember2", "Ember")).toBe(false);
  });
});

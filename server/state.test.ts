/**
 * Tests for state.ts — pure helpers (slugify, normalizeConfig) AND
 * the F3 reaction-provenance contract. The reaction-file I/O tests
 * below redirect `CLAUDE_CONFIG_DIR` before importing `./state.ts`, which now
 * resolves its paths lazily (see the regression guard note below).
 */
import { afterEach, describe, test, expect } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Companion } from "../core/engine.ts";

// REGRESSION GUARD. `state.ts` now resolves its paths lazily, but this file must
// still redirect before importing it: a static import here previously pinned the
// module to the *real* buddy state dir, and the later `await import(...)` handed
// back that same cached instance. Not hypothetical: it silently overwrote the
// user's live companion with this file's duck fixture on every `bun test` run.
// Redirect CLAUDE_CONFIG_DIR BEFORE the first import, and never import the
// module statically from this file.
const GUARD_DIR = mkdtempSync(join(tmpdir(), "coding-buddy-state-guard-"));
process.env.CLAUDE_CONFIG_DIR = GUARD_DIR;

const { normalizeConfig, slugify } = await import("./state.ts");

function makeTempStateDir(): string {
  return mkdtempSync(join(tmpdir(), "coding-buddy-state-"));
}

const stateDirs: string[] = [];

afterEach(() => {
  for (const dir of stateDirs.splice(0)) rmSync(dir, { force: true, recursive: true });
});

describe("F3: saveReaction / writeStatusState reaction-provenance contract", () => {
  test("saveReaction without an explicit source defaults to 'fallback'", async () => {
    const stateDir = makeTempStateDir();
    stateDirs.push(stateDir);
    process.env.CLAUDE_CONFIG_DIR = stateDir;
    // Re-import after env set so the module's STATE_DIR picks it up.
    const { saveReaction, loadReaction } = await import("./state.ts");
    saveReaction("*pet line*", "pet");
    const loaded = loadReaction();
    expect(loaded?.source).toBe("fallback");
    expect(loaded?.reason).toBe("pet");
    expect(loaded?.reaction).toBe("*pet line*");
  });

  test("writeStatusState does NOT clobber an existing reaction file's source", async () => {
    const stateDir = makeTempStateDir();
    stateDirs.push(stateDir);
    process.env.CLAUDE_CONFIG_DIR = stateDir;
    const { saveReaction, loadReaction, writeStatusState } = await import("./state.ts");
    // Seed a prior tool-authored reaction.
    saveReaction("*tool wrote this*", "turn", "tool");
    const before = loadReaction();
    expect(before?.source).toBe("tool");
    // Now call writeStatusState the way `buddy_pet` would after
    // an explicit prior saveReaction — it should touch status.json only.
    const companion: Companion = {
      bones: {
        rarity: "common",
        species: "duck",
        eye: "°",
        hat: "none",
        shiny: false,
        stats: { DEBUGGING: 50, PATIENCE: 50, CHAOS: 50, WISDOM: 50, SNARK: 50 },
        peak: "SNARK",
        dump: "PATIENCE",
      },
      name: "Daffodil",
      personality: "dry wit",
      hatchedAt: 1,
      userId: "u",
    };
    writeStatusState(companion, "*hatch line*");
    const after = loadReaction();
    expect(after?.source).toBe("tool");
    expect(after?.reaction).toBe("*tool wrote this*");
  });
});

describe("normalizeConfig", () => {
  test("leaves subStatusCommand unset by default", () => {
    expect(normalizeConfig({}).subStatusCommand).toBeUndefined();
  });

  test("preserves a configured subStatusCommand", () => {
    expect(normalizeConfig({ subStatusCommand: "ccstatusline" }).subStatusCommand)
      .toBe("ccstatusline");
  });

  test("treats empty and non-string subStatusCommand values as unset", () => {
    expect(normalizeConfig({ subStatusCommand: "  " }).subStatusCommand).toBeUndefined();
    expect(normalizeConfig({ subStatusCommand: null }).subStatusCommand).toBeUndefined();
  });

  test("defaults and validates subStatusRefreshSeconds", () => {
    expect(normalizeConfig({}).subStatusRefreshSeconds).toBe(15);
    expect(normalizeConfig({ subStatusRefreshSeconds: 30 }).subStatusRefreshSeconds).toBe(30);
    expect(normalizeConfig({ subStatusRefreshSeconds: "30" }).subStatusRefreshSeconds).toBe(15);
    expect(normalizeConfig({ subStatusRefreshSeconds: 0 }).subStatusRefreshSeconds).toBe(15);
  });

  test("defaults reaction TTL to a finite lifetime", () => {
    expect(normalizeConfig({}).reactionTTL).toBe(900);
    expect(normalizeConfig({ reactionTTL: 0 }).reactionTTL).toBe(0);
  });

  test("accepts signed statusline width adjustments and rejects non-integers", () => {
    expect(normalizeConfig({ statuslineWidthAdjust: -4 }).statuslineWidthAdjust).toBe(-4);
    expect(normalizeConfig({ statuslineWidthAdjust: 6 }).statuslineWidthAdjust).toBe(6);
    expect(normalizeConfig({ statuslineWidthAdjust: "6" }).statuslineWidthAdjust).toBe(0);
  });

  test("defaults and normalizes statuslineDensity", () => {
    expect(normalizeConfig({}).statuslineDensity).toBe("auto");
    expect(normalizeConfig({ statuslineDensity: "full" }).statuslineDensity).toBe("full");
    expect(normalizeConfig({ statuslineDensity: "compact" }).statuslineDensity).toBe("compact");
    expect(normalizeConfig({ statuslineDensity: "minimal" }).statuslineDensity).toBe("minimal");
    expect(normalizeConfig({ statuslineDensity: "auto" }).statuslineDensity).toBe("auto");
    expect(normalizeConfig({ statuslineDensity: "invalid" }).statuslineDensity).toBe("auto");
    expect(normalizeConfig({ statuslineDensity: 123 }).statuslineDensity).toBe("auto");
  });
});


describe("slugify", () => {
  test("lowercases input", () => {
    expect(slugify("Sesame")).toBe("sesame");
    expect(slugify("BIG_BUDDY")).toBe("big-buddy");
  });

  test("replaces invalid characters with a dash", () => {
    expect(slugify("hello world")).toBe("hello-world");
    expect(slugify("foo@bar")).toBe("foo-bar");
  });

  test("collapses consecutive dashes", () => {
    expect(slugify("foo   bar")).toBe("foo-bar");
  });

  test("trims leading and trailing dashes", () => {
    expect(slugify("---hi---")).toBe("hi");
    expect(slugify("  buddy  ")).toBe("buddy");
  });

  test("truncates to 14 characters", () => {
    const long = "abcdefghijklmnopqrstuvwxyz";
    const result = slugify(long);
    expect(result.length).toBeLessThanOrEqual(14);
    expect(result).toBe("abcdefghijklmn");
  });

  test("falls back to 'buddy' for empty or all-invalid input", () => {
    expect(slugify("")).toBe("buddy");
    expect(slugify("!!!")).toBe("buddy");
    expect(slugify("   ")).toBe("buddy");
  });

  test("preserves digits and internal dashes", () => {
    expect(slugify("buddy-2")).toBe("buddy-2");
    expect(slugify("v1-0-3")).toBe("v1-0-3");
  });

  test("unicode / emoji input falls back to 'buddy'", () => {
    expect(slugify("🐢")).toBe("buddy");
    expect(slugify("日本語")).toBe("buddy");
  });
});

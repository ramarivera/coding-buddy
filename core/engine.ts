/**
 * coding-buddy engine — deterministic companion generation
 * Matches Claude Code's exact algorithm: wyhash → mulberry32 → species/stats
 */

export const SALT = "friend-2026-401";

export const SPECIES = [
  "duck",
  "goose",
  "blob",
  "cat",
  "dragon",
  "octopus",
  "owl",
  "penguin",
  "turtle",
  "snail",
  "ghost",
  "axolotl",
  "capybara",
  "cactus",
  "robot",
  "rabbit",
  "mushroom",
  "chonk",
  "wyvern",
  "pikachu",
] as const;

export type Species = (typeof SPECIES)[number];

export const RARITIES = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
] as const;
export type Rarity = (typeof RARITIES)[number];

export const RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 60,
  uncommon: 25,
  rare: 10,
  epic: 4,
  legendary: 1,
};

export const STAT_NAMES = [
  "DEBUGGING",
  "PATIENCE",
  "CHAOS",
  "WISDOM",
  "SNARK",
] as const;
export type StatName = (typeof STAT_NAMES)[number];

export const RARITY_FLOOR: Record<Rarity, number> = {
  common: 5,
  uncommon: 15,
  rare: 25,
  epic: 35,
  legendary: 50,
};

export const RARITY_STARS: Record<Rarity, string> = {
  common: "\u2605",
  uncommon: "\u2605\u2605",
  rare: "\u2605\u2605\u2605",
  epic: "\u2605\u2605\u2605\u2605",
  legendary: "\u2605\u2605\u2605\u2605\u2605",
};

export const EYES = [
  "\u00b7",
  "\u2726",
  "\u00d7",
  "\u25c9",
  "@",
  "\u00b0",
] as const;
export type Eye = (typeof EYES)[number];
const DEFAULT_EYE: Eye = "\u00b0";

/** Keep persisted/runtime eye values from leaking descriptor words into art. */
export function resolveEyeGlyph(eye: unknown): Eye {
  return EYES.find((candidate) => candidate === eye) ?? DEFAULT_EYE;
}


export const HATS = [
  "none",
  "crown",
  "tophat",
  "propeller",
  "halo",
  "wizard",
  "beanie",
  "tinyduck",
] as const;
export type Hat = (typeof HATS)[number];

export const HAT_ART: Record<Hat, string> = {
  none: "",
  crown: "  \\^^^/  ",
  tophat: "  [___]  ",
  propeller: "   -+-   ",
  halo: "  (   )  ",
  wizard: "   /^\\   ",
  beanie: "  (___)  ",
  tinyduck: "   ,>    ",
};

export interface BuddyStats {
  DEBUGGING: number;
  PATIENCE: number;
  CHAOS: number;
  WISDOM: number;
  SNARK: number;
}

export interface BuddyBones {
  rarity: Rarity;
  species: Species;
  eye: Eye;
  hat: Hat;
  shiny: boolean;
  stats: BuddyStats;
  peak: StatName;
  dump: StatName;
}

export interface Companion {
  bones: BuddyBones;
  name: string;
  personality: string;
  hatchedAt: number;
  userId: string;
}
export const PERSONALITY_MAX_LENGTH = 500;


// ─── Hash: wyhash via Bun.hash, pure JS fallback ───────────────────────────
// Matches Zig stdlib wyhash v4.2 (used by Bun.hash). The pure JS implementation
// uses BigInt for 128-bit multiplication — slower than native, but produces
// identical hashes so every user gets the same buddy regardless of runtime.

const MASK64 = (1n << 64n) - 1n;
const WY_SECRET: readonly bigint[] = [
  0xa0761d6478bd642fn,
  0xe7037ed1a0b428dbn,
  0x8ebc6af09c88c6e3n,
  0x589965cc75374cc3n,
];

function wyMum(a: bigint, b: bigint): [bigint, bigint] {
  const x = (a & MASK64) * (b & MASK64);
  return [x & MASK64, (x >> 64n) & MASK64];
}

function wyMix(a: bigint, b: bigint): bigint {
  const [lo, hi] = wyMum(a, b);
  return (lo ^ hi) & MASK64;
}

function wyR8(buf: Uint8Array, off: number): bigint {
  let v = 0n;
  for (let i = 0; i < 8; i++) v |= BigInt(buf[off + i]) << BigInt(i * 8);
  return v;
}

function wyR4(buf: Uint8Array, off: number): bigint {
  let v = 0n;
  for (let i = 0; i < 4; i++) v |= BigInt(buf[off + i]) << BigInt(i * 8);
  return v;
}

function wyhash(input: string, seed = 0n): bigint {
  const buf = new TextEncoder().encode(input);
  const len = buf.length;

  let s0 =
    (seed ^ wyMix((seed ^ WY_SECRET[0]) & MASK64, WY_SECRET[1])) & MASK64;
  let s1 = s0,
    s2 = s0;
  let a: bigint, b: bigint;

  if (len <= 16) {
    if (len >= 4) {
      const q = (len >> 3) << 2;
      a = ((wyR4(buf, 0) << 32n) | wyR4(buf, q)) & MASK64;
      b = ((wyR4(buf, len - 4) << 32n) | wyR4(buf, len - 4 - q)) & MASK64;
    } else if (len > 0) {
      a =
        (BigInt(buf[0]) << 16n) |
        (BigInt(buf[len >> 1]) << 8n) |
        BigInt(buf[len - 1]);
      b = 0n;
    } else {
      a = 0n;
      b = 0n;
    }
  } else {
    let i = 0;
    if (len >= 48) {
      while (i + 48 < len) {
        for (let j = 0; j < 3; j++) {
          const ra = wyR8(buf, i + 16 * j);
          const rb = wyR8(buf, i + 16 * j + 8);
          const states = [s0, s1, s2];
          states[j] = wyMix(
            (ra ^ WY_SECRET[j + 1]) & MASK64,
            (rb ^ states[j]) & MASK64,
          );
          s0 = states[0];
          s1 = states[1];
          s2 = states[2];
        }
        i += 48;
      }
      s0 = (s0 ^ s1 ^ s2) & MASK64;
    }
    const rem = buf.subarray(i);
    let ri = 0;
    while (ri + 16 < rem.length) {
      s0 = wyMix(
        (wyR8(rem, ri) ^ WY_SECRET[1]) & MASK64,
        (wyR8(rem, ri + 8) ^ s0) & MASK64,
      );
      ri += 16;
    }
    a = wyR8(buf, len - 16);
    b = wyR8(buf, len - 8);
  }

  a = (a ^ WY_SECRET[1]) & MASK64;
  b = (b ^ s0) & MASK64;
  [a, b] = wyMum(a, b);
  return wyMix(
    (a ^ WY_SECRET[0] ^ BigInt(len)) & MASK64,
    (b ^ WY_SECRET[1]) & MASK64,
  );
}

export function hashString(s: string): number {
  if (typeof Bun !== "undefined") {
    return Number(BigInt(Bun.hash(s)) & 0xffffffffn);
  }
  return Number(wyhash(s) & 0xffffffffn);
}

// ─── PRNG: Mulberry32 ───────────────────────────────────────────────────────

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Generation ─────────────────────────────────────────────────────────────

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function rollRarity(rng: () => number): Rarity {
  const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (const r of RARITIES) {
    roll -= RARITY_WEIGHTS[r];
    if (roll < 0) return r;
  }
  return "common";
}

export function generateBones(userId: string, salt: string = SALT): BuddyBones {
  const rng = mulberry32(hashString(userId + salt));

  const rarity = rollRarity(rng);
  const species = pick(rng, SPECIES);
  const eye = pick(rng, EYES);
  const hat = rarity === "common" ? "none" : pick(rng, HATS);
  const shiny = rng() < 0.01;

  const peak = pick(rng, STAT_NAMES);
  let dump = pick(rng, STAT_NAMES);
  while (dump === peak) dump = pick(rng, STAT_NAMES);

  const floor = RARITY_FLOOR[rarity];
  const stats = {} as BuddyStats;
  for (const name of STAT_NAMES) {
    if (name === peak) {
      stats[name] = Math.min(100, floor + 50 + Math.floor(rng() * 30));
    } else if (name === dump) {
      stats[name] = Math.max(1, floor - 10 + Math.floor(rng() * 15));
    } else {
      stats[name] = floor + Math.floor(rng() * 40);
    }
  }

  return { rarity, species, eye, hat, shiny, stats, peak, dump };
}

// ─── Personality ────────────────────────────────────────────────────────────

const PEAK_PHRASES: Record<StatName, string[]> = {
  DEBUGGING: [
    "spots segfaults before the stack unwinds",
    "can read a backtrace like a map",
    "finds the off-by-one before the tests do",
  ],
  PATIENCE: [
    "outlasts any flaky test suite",
    "waits for the slow CI build without complaint",
    "never merges before the green check",
  ],
  CHAOS: [
    "treats breaking changes as a love language",
    "rewrites the Makefile on a Tuesday for fun",
    "thrives wherever the incident channel is loudest",
  ],
  WISDOM: [
    "has seen this bug before — in three other repos",
    "quotes the relevant RFC from memory",
    "recognizes the abstraction that will outlive its author",
  ],
  SNARK: [
    "leaves code review comments that linger",
    "finds the edge case you forgot and mentions it twice",
    "names things with uncomfortable accuracy",
  ],
};

const DUMP_PHRASES: Record<StatName, string[]> = {
  DEBUGGING: [
    "occasionally ships the workaround instead of the fix",
    "skips the repro step",
    "trusts the logs a little too much",
  ],
  PATIENCE: [
    "starts the rebase before the review is done",
    "has been known to close slow issues as stale",
    "has been known to force-push main",
  ],
  CHAOS: [
    "prefers everything to stay exactly where it is",
    "dislikes surprise refactors",
    "writes very thorough migration guides",
  ],
  WISDOM: [
    "sometimes reinvents the wheel with enthusiasm",
    "skips the existing prior art",
    "learns by doing, not by reading",
  ],
  SNARK: [
    "only leaves encouraging comments",
    "approves PRs with genuine warmth",
    "never says what it actually thinks",
  ],
};

const RARITY_CLOSER: Record<string, string[]> = {
  common:    ["Gets the job done.", "Reliable, if unassuming."],
  uncommon:  ["Has a few tricks up its sleeve.", "Worth keeping around."],
  rare:      ["Not to be underestimated.", "Earns its keep."],
  epic:      ["Commands quiet respect.", "The kind of companion repos are built around."],
  legendary: ["The kind you find once, if you're lucky.", "Leaves every codebase better than it found it."],
};

export function generatePersonality(bones: BuddyBones, userId: string): string {
  const seed = parseInt(userId.slice(0, 8), 16);
  const pickPhrase = <T>(arr: T[], salt: number = 0): T => arr[(seed + salt) % arr.length];

  const shiny  = bones.shiny ? " Shimmers faintly in dark mode." : "";
  const peak   = pickPhrase(PEAK_PHRASES[bones.peak]);
  const dump   = pickPhrase(DUMP_PHRASES[bones.dump], 1);
  const closer = pickPhrase(RARITY_CLOSER[bones.rarity] ?? ["Gets the job done."], 2);

  return `A ${bones.rarity} ${bones.species} that ${peak}.${shiny} ${closer} Though it ${dump}.`;
}

// ─── ASCII Art ──────────────────────────────────────────────────────────────

const FACE_TEMPLATES: Record<Species, string> = {
  duck: "({E}>",
  goose: "({E}>",
  blob: "({E}{E})",
  cat: "={E}\u03c9{E}=",
  dragon: "<{E}~{E}>",
  octopus: "~({E}{E})~",
  owl: "({E})({E})",
  penguin: "({E}>)",
  turtle: "[{E}_{E}]",
  snail: "{E}(@)",
  ghost: "/{E}{E}\\",
  axolotl: "}{E}.{E}{",
  capybara: "({E}oo{E})",
  cactus: "|{E}  {E}|",
  robot: "[{E}{E}]",
  rabbit: "({E}..{E})",
  mushroom: "|{E}  {E}|",
  chonk: "({E}.{E})",
  wyvern: "\\ {E}' '{E} /",
  pikachu: "({E}ω{E})",
};

export function renderFace(species: Species, eye: string): string {
  return FACE_TEMPLATES[species].replace(/\{E\}/g, resolveEyeGlyph(eye));
}

export function renderBuddy(bones: BuddyBones): string {
  const face = renderFace(bones.species, bones.eye);
  const hat = HAT_ART[bones.hat];
  const shiny = bones.shiny ? "\u2728 " : "";
  const stars = RARITY_STARS[bones.rarity];

  const lines: string[] = [];
  if (hat) lines.push(hat);
  lines.push(`  ${face}`);
  lines.push("");
  lines.push(`${shiny}${bones.rarity} ${bones.species} ${stars}`);
  lines.push("");

  for (const stat of STAT_NAMES) {
    const val = bones.stats[stat];
    const bar =
      "\u2588".repeat(Math.floor(val / 5)) +
      "\u2591".repeat(20 - Math.floor(val / 5));
    const label = stat.padEnd(9);
    const marker =
      stat === bones.peak ? " \u25b2" : stat === bones.dump ? " \u25bc" : "";
    lines.push(`  ${label} ${bar} ${String(val).padStart(3)}${marker}`);
  }

  return lines.join("\n");
}

// ─── Compact render for status line ─────────────────────────────────────────

export function renderCompact(
  bones: BuddyBones,
  name: string,
  reaction?: string,
): string {
  const face = renderFace(bones.species, bones.eye);
  const shiny = bones.shiny ? "\u2728" : "";
  const stars = RARITY_STARS[bones.rarity];
  const msg = reaction ? ` \u2502 "${reaction}"` : "";
  return `${face} ${name} ${shiny}${stars}${msg}`;
}

// ─── Search (brute-force) ───────────────────────────────────────────────────

export interface SearchCriteria {
  species: Species;
  rarity: Rarity;
  wantShiny: boolean;
  wantPeak?: StatName;
  wantDump?: StatName;
  statOrder?: StatName[];
}

export interface SearchResult {
  userId: string;
  bones: BuddyBones;
}

export function searchBuddy(
  criteria: SearchCriteria,
  maxAttempts: number,
  onProgress?: (checked: number, found: number) => void,
): SearchResult[] {
  const { randomBytes } = require("crypto") as typeof import("crypto");
  const results: SearchResult[] = [];
  const reportInterval = 2_000_000;

  for (let i = 0; i < maxAttempts; i++) {
    if (i > 0 && i % reportInterval === 0) {
      onProgress?.(i, results.length);
    }

    const id = randomBytes(32).toString("hex");
    const rng = mulberry32(hashString(id + SALT));

    const rarity = rollRarity(rng);
    if (rarity !== criteria.rarity) continue;

    const species = pick(rng, SPECIES);
    if (species !== criteria.species) continue;

    const eye = pick(rng, EYES);
    const hat = rarity === "common" ? "none" : pick(rng, HATS);
    const shiny = rng() < 0.01;
    if (criteria.wantShiny && !shiny) continue;

    const peak = pick(rng, STAT_NAMES);
    if (criteria.wantPeak && criteria.wantPeak !== peak) continue;

    let dump = pick(rng, STAT_NAMES);
    while (dump === peak) dump = pick(rng, STAT_NAMES);
    if (criteria.wantDump && criteria.wantDump !== dump) continue;

    const floor = RARITY_FLOOR[rarity];
    const stats = {} as BuddyStats;
    for (const name of STAT_NAMES) {
      if (name === peak)
        stats[name] = Math.min(100, floor + 50 + Math.floor(rng() * 30));
      else if (name === dump)
        stats[name] = Math.max(1, floor - 10 + Math.floor(rng() * 15));
      else stats[name] = floor + Math.floor(rng() * 40);
    }

    if (criteria.statOrder && criteria.statOrder.length > 1) {
      let valid = true;
      for (let j = 0; j < criteria.statOrder.length - 1; j++) {
        if (stats[criteria.statOrder[j]] <= stats[criteria.statOrder[j + 1]]) {
          valid = false;
          break;
        }
      }
      if (!valid) continue;
    }

    results.push({
      userId: id,
      bones: { rarity, species, eye, hat, shiny, stats, peak, dump },
    });

    if (results.length >= 20) break;
  }

  return results;
}

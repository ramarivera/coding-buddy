/**
 * State management — reads/writes companion data to the buddy state dir.
 *
 * The state dir resolves via server/paths.ts (honors CLAUDE_CONFIG_DIR).
 * Default: ~/.claude-buddy/. With CLAUDE_CONFIG_DIR set:
 * $CLAUDE_CONFIG_DIR/buddy-state/.
 *
 * Storage layout (v3 — single manifest):
 *   <state-dir>/
 *     menagerie.json   <- SSOT: { active, companions: { [slot]: Companion } }
 *     reaction.$SID.json  <- transient reaction state (session-scoped)
 *     status.json      <- compact state for the status-line shell script
 *     config.json      <- user preferences (cooldown, bubble style, etc.)
 *
 * Rules:
 *   - saveCompanionSlot()  APPENDS only — throws if the slot already exists
 *   - saveCompanion()      UPDATES the currently-active slot (rename / personality)
 *   - All manifest writes are atomic (write tmp -> rename)
 *
 * Combined: PR #4 menagerie + PR #6 session isolation + config
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  renameSync,
  rmSync,
} from "fs";
import { join } from "path";
import { configuredSharedUserId } from "../core/identity.ts";
import type { BuddyBones, Companion } from "../core/engine.ts"
import type * as CoreEngine from "../core/engine.ts";
import type * as Art from "./art.ts";
import type * as MoodModule from "./mood.ts";
import type * as XpModule from "./xp.ts";
import {
  buddyStateDir,
  claudeSettingsPath,
  claudeUserConfigPath,
  toUnixPath,
} from "./path.ts";

// Resolved per call, never captured at import. ES modules are cached, so a
// module-level `buddyStateDir()` pinned these paths to whatever
// CLAUDE_CONFIG_DIR happened to be at *first* import. Once any file in a test
// process had imported this module, every later redirect was silently ignored —
// which is how `bun test` came to overwrite a user's live companion with a test
// fixture. Individually the test files were clean; only running them together
// leaked. A lazy lookup makes that class of bug impossible.
const stateDir = () => buddyStateDir();
const MANIFEST_FILE = () => join(stateDir(), "menagerie.json");
const CONFIG_FILE = () => join(stateDir(), "config.json");
const STATUS_FILE = () => join(stateDir(), "status.json");

// ─── Session ID (Claude Code session isolation, tmux pane fallback) ─────────
//
// Precedence:
//   1. $CLAUDE_CODE_SESSION_ID — Claude Code sets a UUID per session and
//      propagates it to the MCP server, hooks, and statusline. Shortened
//      to first 8 chars to keep filenames readable.
//   2. $TMUX_PANE — legacy tmux-pane isolation kept as a fallback.
//   3. "default" — single-session world.
//
// Must match the bash equivalent in scripts/paths.sh.

function sessionId(): string {
  const ccSid = process.env.CLAUDE_CODE_SESSION_ID;
  if (ccSid && ccSid.length > 0) return ccSid.slice(0, 8);
  const pane = process.env.TMUX_PANE;
  if (!pane) return "default";
  return pane.replace(/^%/, "");
}

function reactionFile(): string {
  return join(stateDir(), `reaction.${sessionId()}.json`);
}

// ─── Manifest schema ─────────────────────────────────────────────────────────

interface Manifest {
  active: string;
  companions: Record<string, Companion>;
}

function emptyManifest(): Manifest {
  return { active: "buddy", companions: {} };
}

// ─── Atomic manifest I/O ─────────────────────────────────────────────────────

function loadManifest(): Manifest {
  try {
    const raw = readFileSync(MANIFEST_FILE(), "utf8");
    const m = JSON.parse(raw) as Manifest;
    if (!m.companions) m.companions = {};
    return m;
  } catch {
    return emptyManifest();
  }
}

function saveManifest(m: Manifest): void {
  mkdirSync(stateDir(), { recursive: true });
  const tmp = MANIFEST_FILE() + ".tmp";
  writeFileSync(tmp, JSON.stringify(m, null, 2));
  renameSync(tmp, MANIFEST_FILE()); // atomic on same filesystem
}

// ─── Slot helpers ────────────────────────────────────────────────────────────

/** Normalise a string to a safe slot key (a-z0-9-, max 14 chars). */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 14) || "buddy"
  );
}

/**
 * Return a random fallback name whose slug is not already in the manifest.
 * Falls back to "buddy-<random 3 digits>" if all names are taken.
 */
export function unusedName(): string {
  const { generateFallbackName } =
    require("../core/reactions.ts") as typeof import("../core/reactions.ts");
  const taken = new Set(Object.keys(loadManifest().companions));
  for (let i = 0; i < 50; i++) {
    const n = generateFallbackName();
    if (!taken.has(slugify(n))) return n;
  }
  let suffix = 0;
  while (taken.has(`buddy-${suffix}`)) suffix++;
  return `buddy-${suffix}`;
}

// ─── Active slot ─────────────────────────────────────────────────────────────

export function loadActiveSlot(): string {
  const m = loadManifest();
  if (m.active && m.companions[m.active]) return m.active;
  const first = Object.keys(m.companions)[0];
  if (first) {
    m.active = first;
    saveManifest(m);
    return first;
  }
  return "buddy";
}

export function saveActiveSlot(slot: string): void {
  const m = loadManifest();
  m.active = slot;
  saveManifest(m);
}

// ─── Companion slot API ───────────────────────────────────────────────────────

export function loadCompanionSlot(slot: string): Companion | null {
  return loadManifest().companions[slot] ?? null;
}

/**
 * APPEND a new companion to the manifest.
 * Throws if the slot already exists — use saveCompanion() to update an existing buddy.
 */
export function saveCompanionSlot(companion: Companion, slot: string): void {
  const m = loadManifest();
  if (m.companions[slot]) {
    throw new Error(`Slot "${slot}" already exists. Choose a different name.`);
  }
  m.companions[slot] = companion;
  saveManifest(m);
}

/**
 * UPDATE an existing (possibly non-active) companion slot.
 * Throws if the slot does not exist.
 */
export function updateCompanionSlot(slot: string, companion: Companion): void {
  const m = loadManifest();
  if (!m.companions[slot]) {
    throw new Error(`Slot "${slot}" does not exist.`);
  }
  m.companions[slot] = companion;
  saveManifest(m);
}

export function deleteCompanionSlot(slot: string): void {
  const m = loadManifest();
  delete m.companions[slot];
  if (m.active === slot) {
    m.active = Object.keys(m.companions)[0] ?? "buddy";
  }
  saveManifest(m);
}

export function listCompanionSlots(): Array<{
  slot: string;
  companion: Companion;
}> {
  return Object.entries(loadManifest().companions).map(([slot, companion]) => ({
    slot,
    companion,
  }));
}

// ─── Primary companion API ────────────────────────────────────────────────────

export function loadCompanion(): Companion | null {
  migrateIfNeeded();
  const m = loadManifest();
  return m.companions[m.active] ?? null;
}

/**
 * UPDATE the currently-active companion (rename, personality changes, etc.).
 * This is the ONLY intentional in-place update path.
 */
export function saveCompanion(companion: Companion): void {
  const m = loadManifest();
  m.companions[m.active] = companion;
  saveManifest(m);
}

// ─── Migration: legacy companion.json -> single manifest ────────────────────

function migrateIfNeeded(): void {
  if (existsSync(MANIFEST_FILE())) return;

  const companions: Record<string, Companion> = {};
  let active = "buddy";

  // Absorb menagerie/<slot>.json files
  const menagerieDir = join(stateDir(), "menagerie");
  if (existsSync(menagerieDir)) {
    try {
      for (const f of readdirSync(menagerieDir).filter((f) =>
        f.endsWith(".json"),
      )) {
        const slot = f.slice(0, -5);
        try {
          companions[slot] = JSON.parse(
            readFileSync(join(menagerieDir, f), "utf8"),
          );
        } catch {
          /* skip malformed */
        }
      }
    } catch {
      /* noop */
    }
  }

  // Absorb legacy companion.json
  const legacyFile = join(stateDir(), "companion.json");
  if (existsSync(legacyFile) && Object.keys(companions).length === 0) {
    try {
      const c: Companion = JSON.parse(readFileSync(legacyFile, "utf8"));
      const slot = slugify(c.name);
      companions[slot] = c;
      active = slot;
    } catch {
      /* noop */
    }
  }

  // Read active pointer if it exists
  const activeFile = join(stateDir(), "active");
  if (existsSync(activeFile)) {
    try {
      const a = readFileSync(activeFile, "utf8").trim();
      if (a && companions[a]) active = a;
    } catch {
      /* noop */
    }
  }

  if (Object.keys(companions).length > 0) {
    active = active && companions[active] ? active : Object.keys(companions)[0];
  }

  saveManifest({ active, companions });
}

// ─── Reaction state (session-scoped for tmux isolation) ──────────────────────

/**
 * Where a reaction came from. Proves the bubble content isn't canned when
 * source === "tool" or "comment"; "fallback" means a hook picked a pool line
 * because no model-authored text surfaced; "none" is the default for legacy
 * files written before the field existed.
 *
 *   tool      — buddy_react MCP tool call (Claude wrote it; renders nowhere)
 *   comment   — old `<!-- buddy: ... -->` HTML comment (legacy / older CC)
 *   fallback  — Stop hook generated it from the canned pool
 *   none      — unknown / legacy file without a source field
 */
export type ReactionSource = "tool" | "comment" | "fallback" | "none";

export interface ReactionState {
  reaction: string;
  timestamp: number;
  reason: string;
  /** Provenance — see ReactionSource. Defaults to "none" on legacy files. */
  source?: ReactionSource;
}

export function loadReaction(): ReactionState | null {
  try {
    const data: ReactionState = JSON.parse(readFileSync(reactionFile(), "utf8"));
    const { reactionTTL } = loadConfig();
if (reactionTTL > 0 && Date.now() - data.timestamp > reactionTTL * 1000) {
  rmSync(reactionFile(), { force: true });
  return null;
}
if (data.source === undefined) data.source = "none";
    return data;
  } catch {
    return null;
  }
}

export function saveReaction(
  reaction: string,
  reason: string,
  source: ReactionSource = "fallback",
): void {
  mkdirSync(stateDir(), { recursive: true });
  const state: ReactionState = { reaction, timestamp: Date.now(), reason, source };
  // Atomic via tmp + rename — torn reads on the reaction file would
  // make the Stop hook's freshness check see an absent file, pinning
  // a stale tool reaction into the bubble forever.
  const target = reactionFile();
  const tmp = `${target}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(state));
  renameSync(tmp, target);
}

// ─── Identity resolution ─────────────────────────────────────────────────────

export function resolveUserId(): string {
  const sharedUserId = configuredSharedUserId();
  if (sharedUserId) return sharedUserId;
  try {
    const claudeJson = JSON.parse(readFileSync(claudeUserConfigPath(), "utf8"));
    return claudeJson.oauthAccount?.accountUuid ?? claudeJson.userID ?? "anon";
  } catch {
    return "anon";
  }
}
// ─── Config persistence (PR #6: tmux popup settings) ─────────────────────────
export interface BuddyConfig {
  commentCooldown: number;
  reactionTTL: number;
  bubbleStyle: "classic" | "round";
  bubblePosition: "top" | "left";
  showRarity: boolean;
  statusLineEnabled: boolean;
  statuslineDensity: "auto" | "full" | "compact" | "minimal";
  statuslineWidthAdjust: number;
  bubbleWidth: number;
  bubbleMargin: number;
  useCombinedStatus: boolean;
  subStatusCommand?: string;
  subStatusRefreshSeconds: number;
  rainbowColors?: string[];
  theme: "dark" | "light" | "auto";
  moodEnabled: boolean;
  memoryEnabled: boolean;
  suggestionsEnabled: boolean;
  suggestionCooldown: number;
}
const DEFAULT_CONFIG: BuddyConfig = {
  commentCooldown: 30,
  // Long enough that a reaction survives the turn you were reading when it was
  // written, short enough that yesterday's bubble is never still on screen.
  // Set to 0 to opt out and keep reactions until they are replaced.
  reactionTTL: 900,
  bubbleStyle: "classic",
  bubblePosition: "top",
  showRarity: true,
  statusLineEnabled: false,
  statuslineDensity: "auto",
  statuslineWidthAdjust: 0,
  bubbleWidth: 28,
  bubbleMargin: 8,
  useCombinedStatus: false,
  subStatusRefreshSeconds: 15,
  theme: "auto",
  moodEnabled: true,
  memoryEnabled: true,
  suggestionsEnabled: true,
  suggestionCooldown: 180,
};

export function normalizeConfig(data: unknown): BuddyConfig {
  const values = data && typeof data === "object" && !Array.isArray(data)
    ? data
    : {};
  const config = { ...DEFAULT_CONFIG, ...values } as BuddyConfig;
  if (typeof config.subStatusCommand !== "string" || config.subStatusCommand.trim() === "") {
    delete config.subStatusCommand;
  }
  if (!Number.isInteger(config.subStatusRefreshSeconds) || config.subStatusRefreshSeconds <= 0) {
    config.subStatusRefreshSeconds = DEFAULT_CONFIG.subStatusRefreshSeconds;
  }
  if (!Number.isInteger(config.reactionTTL) || config.reactionTTL < 0) {
    config.reactionTTL = DEFAULT_CONFIG.reactionTTL;
  }
  if (!Number.isInteger(config.statuslineWidthAdjust)) {
    config.statuslineWidthAdjust = DEFAULT_CONFIG.statuslineWidthAdjust;
  }
  const allowedDensities: BuddyConfig["statuslineDensity"][] = ["auto", "full", "compact", "minimal"];
  if (!allowedDensities.includes(config.statuslineDensity)) {
    config.statuslineDensity = DEFAULT_CONFIG.statuslineDensity;
  }
  return config;
}

export function loadConfig(): BuddyConfig {
  try {
    return normalizeConfig(JSON.parse(readFileSync(CONFIG_FILE(), "utf8")));
  } catch {
    return normalizeConfig({});
  }
}

export function saveConfig(config: Partial<BuddyConfig>): BuddyConfig {
  mkdirSync(stateDir(), { recursive: true });
  const current = loadConfig();
  const merged = { ...current, ...config };
  writeFileSync(CONFIG_FILE(), JSON.stringify(merged, null, 2));
  return merged;
}

// ─── Status line state (compact JSON for the shell script) ───────────────────

export interface StatusState {
  name: string;
  species: string;
  rarity: string;
  stars: string;
  face: string;
  eye: string;
  shiny: boolean;
  hat: string;
  reaction: string;
  muted: boolean;
  achievement: string;
  /** Epoch ms the achievement was awarded; 0 when none. The statusline expires
   *  the trophy banner on this, otherwise it latches into the shared
   *  status.json and pins every session's bubble to the last unlock. */
  achievementAt: number;
  frames: string[];
  compactFrames: string[];
  minimalFrames: string[];
  frameSequence: number[];
  level: number;
  xp: number;
  mood: string;
}

// Density frame fallbacks used when server/art.ts has not yet been updated
// to emit compactFrames/minimalFrames. The art worker owns the pre-rendered
// density frames; state.ts only derives a degraded fallback from the full
// frames so old/new status.json remains renderable.
function deriveCompactFrames(fullFrames: string[]): string[] {
  return fullFrames.map((body) => {
    const lines = body.split("\n");
    const selected: string[] = [];
    for (const line of lines) {
      if (selected.length >= 3) break;
      if (line.trim() !== "") selected.push(line);
    }
    while (selected.length < 3) selected.push("");
    return selected.join("\n");
  });
}

function deriveMinimalFrames(bones: BuddyBones, eye: string): string[] {
  const { renderFace } = require("../core/engine.ts") as typeof CoreEngine;
  const face = renderFace(bones.species, eye);
  return Array.from({ length: 4 }, () => face);
}
export function writeStatusState(
  companion: Companion,
  reaction?: string,
  muted?: boolean,
  achievement?: string,
  level?: number,
  xp?: number,
): void {
  mkdirSync(stateDir(), { recursive: true });
  const { renderFace, RARITY_STARS, resolveEyeGlyph } =
    require("../core/engine.ts") as typeof CoreEngine;
  const { getStatusFrames } =
    require("./art.ts") as typeof Art;
  const safeEye = resolveEyeGlyph(companion.bones.eye);
  const artResult = getStatusFrames(companion.bones) as {
    frames: string[];
    frameSequence: number[];
    compactFrames?: string[];
    minimalFrames?: string[];
  };
  const { frames, frameSequence } = artResult;
  const compactFrames =
    artResult.compactFrames && artResult.compactFrames.length > 0
      ? artResult.compactFrames
      : deriveCompactFrames(frames);
  const minimalFrames =
    artResult.minimalFrames && artResult.minimalFrames.length > 0
      ? artResult.minimalFrames
      : deriveMinimalFrames(companion.bones, safeEye);
  let xpLevel = level ?? 1;
  let xpTotal = xp ?? 0;
  let moodStr = "focused";
  try {
    const { getXpState } = require("./xp.ts") as typeof XpModule;
    const xpState = getXpState();
    xpLevel = xpState.level;
    xpTotal = xpState.totalXp;
  } catch {
    // XP state is optional during first install / version skew.
  }
  try {
    const { getMood } = require("./mood.ts") as typeof MoodModule;
    moodStr = getMood().current;
  } catch {
    // Mood state is optional during first install / version skew.
  }
  const state: StatusState = {
    name: companion.name,
    species: companion.bones.species,
    rarity: companion.bones.rarity,
    stars: RARITY_STARS[companion.bones.rarity],
    face: renderFace(companion.bones.species, safeEye),
    eye: safeEye,
    shiny: companion.bones.shiny,
    hat: companion.bones.hat,
    reaction: "",
    muted: muted ?? false,
    achievement: achievement ?? "",
    achievementAt: achievement ? Date.now() : 0,
    frames,
    compactFrames,
    minimalFrames,
    frameSequence,
    level: xpLevel,
    xp: xpTotal,
    mood: moodStr,
  };
  // Atomic: the statusline reads this file on a timer, so a plain write can
  // be observed half-flushed and blank the companion for a tick.
  const statusTmp = `${STATUS_FILE()}.tmp`;
  writeFileSync(statusTmp, JSON.stringify(state));
  renameSync(statusTmp, STATUS_FILE());
  // writeStatusState no longer calls saveReaction implicitly. Callers
  // that need a reaction file do so explicitly with the correct
  // `source` tag — the old implicit save had no source argument and
  // its default later flipped from "tool" to "fallback", either way
  // overwriting provenance of hatch / pet / unmute writes with whatever
  // happened to be the default. /buddy stats stopped lying when
  // this call was removed.
}

export const CLAUDE_SETTINGS_PATH = claudeSettingsPath();
/**
 * Write settings.statusLine pointing to the given buddy-status script.
 * Atomic via tmp + rename. Returns false if settings.json is unreachable.
 */
export function setBuddyStatusLine(
  statusScript: string,
  settingsPath: string = CLAUDE_SETTINGS_PATH,
): boolean {
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    settings.statusLine = {
      type: "command",
      command: toUnixPath(statusScript),
      padding: 1,
      refreshInterval: 1,
    };
    const tmp = settingsPath + ".tmp";
    writeFileSync(tmp, JSON.stringify(settings, null, 2) + "\n");
    renameSync(tmp, settingsPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove settings.statusLine — but only if it points to buddy-status.sh.
 * Leaves foreign statusLines untouched. Returns false if no buddy line was
 * present or settings.json is unreachable.
 */
export function unsetBuddyStatusLine(
  settingsPath: string = CLAUDE_SETTINGS_PATH,
): boolean {
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    if (!settings.statusLine?.command?.includes("buddy-status.sh")) return false;
    delete settings.statusLine;
    const tmp = settingsPath + ".tmp";
    writeFileSync(tmp, JSON.stringify(settings, null, 2) + "\n");
    renameSync(tmp, settingsPath);
    return true;
  } catch {
    return false;
  }
}

// ─── Plugin uninstall cleanup ───────────────────────────────────────────────

export interface CleanupResult {
  statusLineRemoved: boolean;
  foreignStatusLineKept: boolean;
  transientFilesRemoved: number;
}

const TRANSIENT_PREFIXES = [
  "popup-stop.",
  "popup-resize.",
  "popup-env.",
  "popup-scroll.",
  "popup-reopen-pid.",
  "reaction.",
  ".last_reaction.",
  ".last_comment.",
  ".substatus.",
];

/**
 * Clean up plugin-owned writes to the user's global state so that
 * `claude plugin uninstall` leaves no orphaned entries behind. Specifically:
 *   - remove settings.statusLine if it points to buddy-status.sh
 *   - delete session-scoped transient files under ~/.claude-buddy/
 *
 * Companion data (menagerie.json, status.json, config.json) is intentionally
 * kept — users reinstalling get their buddy back. Call-sites that want a full
 * wipe should delete stateDir() themselves after calling this.
 */
export function cleanupPluginState(
  settingsPath: string = CLAUDE_SETTINGS_PATH,
  stateDir: string = buddyStateDir(),
): CleanupResult {
  const statusLineRemoved = unsetBuddyStatusLine(settingsPath);

  let foreignStatusLineKept = false;
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    const cmd = settings.statusLine?.command;
    if (cmd && !cmd.includes("buddy-status.sh")) foreignStatusLineKept = true;
  } catch {
    /* missing settings.json is fine */
  }

  let transientFilesRemoved = 0;
  try {
    if (existsSync(stateDir)) {
      for (const f of readdirSync(stateDir)) {
        if (TRANSIENT_PREFIXES.some(p => f.startsWith(p))) {
          rmSync(join(stateDir, f), { force: true });
          transientFilesRemoved++;
        }
      }
    }
  } catch {
    /* state dir unreadable is fine */
  }

  return { statusLineRemoved, foreignStatusLineKept, transientFilesRemoved };
}

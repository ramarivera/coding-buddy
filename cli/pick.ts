#!/usr/bin/env bun
/**
 * cli/pick.ts — interactive two-pane buddy picker
 *
 *  Left pane                    │  Right pane
 *  ─────────────────────────    │  ──────────────────────
 *  Saved:   list of slots       │  full companion card
 *  Criteria: search form        │
 *  Results: matched buddies     │  preview of highlighted
 *  Naming:  name + save prompt  │  card with live name
 *
 * Keys — Saved:    ↑↓ navigate  [enter] summon  [r] random  [s] search  [q] quit
 * Keys — Criteria: ↑↓ field     ←→ value        [enter] run  [esc] back
 * Keys — Results:  ↑↓ navigate  [enter] pick     [esc] back  [q] quit
 * Keys — Naming:   type name    [enter] save      [esc] cancel
 */

import {
  loadActiveSlot, saveActiveSlot, listCompanionSlots,
  loadCompanionSlot, saveCompanionSlot, deleteCompanionSlot, slugify, unusedName, writeStatusState,
} from "../server/state.ts";
import { generateBones, generatePersonality, SPECIES, RARITIES, STAT_NAMES, RARITY_STARS, EYES, HATS,
type Species, type Rarity, type StatName, type Eye, type Hat,
type BuddyBones, type Companion, } from "../core/engine.ts"
import { renderCompanionCard } from "../server/art.ts";
import { randomBytes } from "crypto";

// ─── ANSI ─────────────────────────────────────────────────────────────────────

const RARITY_CLR: Record<string, string> = {
  common:    "\x1b[38;2;153;153;153m",
  uncommon:  "\x1b[38;2;78;186;101m",
  rare:      "\x1b[38;2;177;185;249m",
  epic:      "\x1b[38;2;175;135;255m",
  legendary: "\x1b[38;2;255;193;7m",
};
const B  = "\x1b[1m";
const D  = "\x1b[2m";
const RV = "\x1b[7m";
const N  = "\x1b[0m";
const CY = "\x1b[36m";
const GR = "\x1b[90m";
const YL = "\x1b[33m";
const GN = "\x1b[32m";

function stripAnsi(s: string): string { return s.replace(/\x1b\[[^m]*m/g, ""); }

// Wide characters: emojis, some Unicode symbols take 2 display columns
function charWidth(cp: number): number {
  // Emoji modifiers, variation selectors, ZWJ
  if (cp >= 0xFE00 && cp <= 0xFE0F) return 0;
  if (cp === 0x200D) return 0;
  // Common wide ranges: CJK, emoji, fullwidth, braille, box-drawing stars etc.
  if (cp >= 0x1F000) return 2;  // Most emoji (sparkles ✨ = U+2728 is below this)
  if (cp === 0x2728) return 2;  // ✨ Sparkles
  if (cp >= 0x2600 && cp <= 0x27BF) return 1;  // Misc symbols (★ ☆ etc.) — typically 1 col
  if (cp >= 0x2500 && cp <= 0x257F) return 1;  // Box drawing
  if (cp >= 0x2580 && cp <= 0x259F) return 1;  // Block elements (█░)
  if (cp >= 0x3000 && cp <= 0x9FFF) return 2;  // CJK
  if (cp >= 0xF900 && cp <= 0xFAFF) return 2;  // CJK compat
  if (cp >= 0xFF01 && cp <= 0xFF60) return 2;  // Fullwidth
  return 1;
}

function vlen(s: string): number {
  const clean = stripAnsi(s);
  let w = 0;
  for (const ch of clean) {
    w += charWidth(ch.codePointAt(0)!);
  }
  return w;
}

function rpad(s: string, w: number): string {
  const v = vlen(s);
  return v < w ? s + " ".repeat(w - v) : s;
}

// ─── Option lists ─────────────────────────────────────────────────────────────

const SP_OPTS  = ["any", ...SPECIES]    as const;
const RA_OPTS  = ["any", ...RARITIES]   as const;
const SH_OPTS  = ["any", "yes", "no"]   as const;
const ST_OPTS  = ["any", ...STAT_NAMES] as const;
const EY_OPTS  = ["any", ...EYES]       as const;
const HA_OPTS  = ["any", ...HATS]       as const;
const MIN_OPTS = ["any", "5", "10", "15", "20", "25", "30", "35", "40", "45",
                  "50", "55", "60", "65", "70", "75", "80", "85", "90", "95"] as const;
const AVG_OPTS = MIN_OPTS;

const CRITERIA_ROWS: Array<{ label: string; opts: readonly string[] }> = [
  { label: "Species", opts: SP_OPTS  },
  { label: "Rarity ", opts: RA_OPTS  },
  { label: "Shiny  ", opts: SH_OPTS  },
  { label: "Peak   ", opts: ST_OPTS  },
  { label: "Dump   ", opts: ST_OPTS  },
  { label: "Eye    ", opts: EY_OPTS  },
  { label: "Hat    ", opts: HA_OPTS  },
  { label: "Min avg", opts: AVG_OPTS },
  { label: "Min DBG", opts: MIN_OPTS },
  { label: "Min PAT", opts: MIN_OPTS },
  { label: "Min CHA", opts: MIN_OPTS },
  { label: "Min WIS", opts: MIN_OPTS },
  { label: "Min SNK", opts: MIN_OPTS },
];

// ─── State ────────────────────────────────────────────────────────────────────

type Mode = "saved" | "criteria" | "searching" | "results" | "naming";
interface SlotEntry   { slot: string; companion: Companion; }
interface BuddyResult { userId: string; bones: BuddyBones; }

interface State {
  mode:          Mode;
  searching:     boolean;
  savedSlots:    SlotEntry[];
  savedCursor:   number;
  activeSlot:    string;
  criteriaFocus: number;
  ci:            number[];   // [speciesIdx, rarityIdx, shinyIdx, peakIdx, dumpIdx, eyeIdx, hatIdx, avgIdx, dbgIdx, patIdx, chaIdx, wisIdx, snkIdx]
  results:       BuddyResult[];
  resultCursor:  number;
  searchStatus:  string;
  nameInput:     string;
  pendingResult: BuddyResult | null;
  confirmDelete: boolean;
  message:       string;
}

function fresh(): State {
  return {
    mode:          "saved",
    searching:     false,
    savedSlots:    listCompanionSlots(),
    savedCursor:   0,
    activeSlot:    loadActiveSlot(),
    criteriaFocus: 0,
    // Default criteria: legendary, any species/shiny/peak/dump/eye/hat/avg/stats
    ci: [0, RA_OPTS.indexOf("legendary"), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    results:       [],
    resultCursor:  0,
    searchStatus:  "",
    nameInput:     "",
    pendingResult: null,
    confirmDelete: false,
    message:       "",
  };
}

// ─── Pane builders ────────────────────────────────────────────────────────────

const LEFT_W = 36;

function savedPane(s: State): string[] {
  const lines: string[] = [];
  lines.push(`${B}  Your Menagerie${N}  ${GR}[s] search  [d] remove${N}`);
  lines.push(GR + "  " + "─".repeat(LEFT_W - 2) + N);

  if (s.savedSlots.length === 0) {
    lines.push(`  ${GR}your menagerie is empty${N}`);
    lines.push(`  ${GR}press [s] to search${N}`);
  }

  for (let i = 0; i < s.savedSlots.length; i++) {
    const { slot, companion: c } = s.savedSlots[i];
    const isActive = slot === s.activeSlot;
    const isCursor = i === s.savedCursor;
    const dot  = isActive ? `${GN}●${N}` : " ";
    const clr  = RARITY_CLR[c.bones.rarity] ?? "";
    const star = RARITY_STARS[c.bones.rarity];
    const shiny = c.bones.shiny ? "✨" : "  ";
    const name  = c.name.slice(0, 11).padEnd(11);
    const sp    = c.bones.species.slice(0, 7).padEnd(7);
    const row   = ` ${dot} ${clr}${name}${N} ${GR}${sp}${N} ${clr}${star}${N} ${shiny}`;
    lines.push(isCursor ? RV + row + N : row);
  }

  lines.push(GR + "  " + "─".repeat(LEFT_W - 2) + N);
  if (s.confirmDelete) {
    const entry = s.savedSlots[s.savedCursor];
    lines.push(`  ${YL}remove ${B}${entry?.companion.name ?? "?"}${N}${YL}? [d/y] yes  [any] no${N}`);
  }
  return lines;
}

function criteriaPane(s: State): string[] {
  const lines: string[] = [];
  lines.push(`${B}  Search Criteria${N}`);
  lines.push(GR + "  " + "─".repeat(LEFT_W - 2) + N);

  for (let i = 0; i < CRITERIA_ROWS.length; i++) {
    const { label, opts } = CRITERIA_ROWS[i];
    const val     = opts[s.ci[i]];
    const focus   = i === s.criteriaFocus;
    const clr     = RARITY_CLR[val] ?? "";
    const arrow   = focus ? `${YL}>${N}` : " ";
    const valDisp = focus
      ? `${RV}${B} ${val.padEnd(11)} ${N}`
      : `${D}${clr} ${val.padEnd(11)} ${N}`;
    lines.push(`  ${arrow} ${GR}${label}${N}  ${valDisp}  ${GR}←→${N}`);
  }

  lines.push(GR + "  " + "─".repeat(LEFT_W - 2) + N);
  if (s.searchStatus) lines.push(`  ${YL}${s.searchStatus}${N}`);
  return lines;
}

function searchingPane(s: State): string[] {
  const lines: string[] = [];
  lines.push(`${B}  Searching...${N}`);
  lines.push(GR + "  " + "─".repeat(LEFT_W - 2) + N);
  lines.push(`  ${YL}${s.searchStatus || "starting..."}${N}`);
  lines.push(`  ${GR}any key to stop${N}`);
  lines.push(GR + "  " + "─".repeat(LEFT_W - 2) + N);
  return lines;
}

function resultsPane(s: State): string[] {
  const lines: string[] = [];
  lines.push(`${B}  Results${N}  ${GR}${s.results.length} found${N}`);
  lines.push(GR + "  " + "─".repeat(LEFT_W - 2) + N);

  if (s.results.length === 0) {
    lines.push(`  ${GR}no matches — try broader criteria${N}`);
  }

  // Scrolling window
  const viewH  = 12;
  const offset = Math.max(0, s.resultCursor - Math.floor(viewH / 2));
  for (let i = offset; i < Math.min(s.results.length, offset + viewH); i++) {
    const b      = s.results[i].bones;
    const sel    = i === s.resultCursor;
    const clr    = RARITY_CLR[b.rarity] ?? "";
    const star   = RARITY_STARS[b.rarity];
    const shiny  = b.shiny ? "✨" : "  ";
    const ra     = b.rarity.slice(0, 3);
    const sp     = b.species.padEnd(8);
    const eye    = `e:${b.eye}`;
    const hat    = `h:${b.hat.slice(0, 6).padEnd(6)}`;
    const row    = `  ${clr}${ra}${N} ${sp} ${GR}${eye} ${hat}${N} ${shiny}`;
    lines.push(sel ? RV + row + N : row);
  }

  lines.push(GR + "  " + "─".repeat(LEFT_W - 2) + N);
  return lines;
}

function namingPane(s: State): string[] {
  const b   = s.pendingResult?.bones;
  const clr = b ? (RARITY_CLR[b.rarity] ?? "") : "";
  const lines: string[] = [];
  lines.push(`${B}  Name this buddy${N}`);
  if (b) lines.push(`  ${clr}${b.rarity} ${b.species}${N}`);
  lines.push(GR + "  " + "─".repeat(LEFT_W - 2) + N);
  lines.push(`  ${B}Name:${N} ${s.nameInput}${YL}▌${N}`);
  lines.push(`  ${GR}(type a name, or enter for random)${N}`);
  return lines;
}

function previewPane(s: State): string[] {
  let c: Companion | null = null;

  if (s.mode === "saved") {
    c = s.savedSlots[s.savedCursor]?.companion ?? null;
  } else if (s.mode === "results") {
    const r = s.results[s.resultCursor];
    if (r) c = {
      bones: r.bones, name: "???",
      personality: generatePersonality(r.bones, r.userId),
      hatchedAt: Date.now(), userId: r.userId,
    };
  } else if (s.mode === "naming" && s.pendingResult) {
    const r = s.pendingResult;
    c = {
      bones: r.bones, name: s.nameInput || "???",
      personality: generatePersonality(r.bones, r.userId),
      hatchedAt: Date.now(), userId: r.userId,
    };
  }

  if (!c) return [`  ${GR}no preview${N}`];
  const rightW = 34;
  return renderCompanionCard(c.bones, c.name, c.personality, undefined, 0, rightW).split("\n");
}

// ─── Screen render ────────────────────────────────────────────────────────────

function drawScreen(s: State): void {
  const cols = Math.max(80, process.stdout.columns || 80);
  const rows = Math.max(20, process.stdout.rows    || 24);

  const leftLines  = s.mode === "saved"      ? savedPane(s)
                   : s.mode === "criteria"   ? criteriaPane(s)
                   : s.mode === "searching"  ? searchingPane(s)
                   : s.mode === "results"    ? resultsPane(s)
                   : namingPane(s);
  const rightLines = previewPane(s);
  const contentH   = rows - 2;

  let out = "\x1b[2J\x1b[H"; // clear + home

  // Title bar
  const title    = ` coding-buddy pick `;
  const fill     = "─".repeat(Math.max(0, cols - title.length - 2));
  out += `${CY}─${B}${title}${N}${CY}${fill}─${N}\n`;

  // Content rows
  for (let i = 0; i < contentH; i++) {
    const l = rpad(leftLines[i] ?? "", LEFT_W);
    const r = rightLines[i] ?? "";
    out += l + GR + "│" + N + " " + r + "\n";
  }

  // Footer — mode-specific help
  const helpText =
    s.mode === "saved"     ? "↑↓ navigate  enter summon  r random  s search  d remove  q quit" :
    s.mode === "criteria"  ? "↑↓ field  ←→ value  enter search  esc back" :
    s.mode === "searching" ? "any key to stop and show results so far" :
    s.mode === "results"   ? "↑↓ navigate  enter name+save  esc back  q quit" :
    s.mode === "naming"    ? "type name  enter save  esc cancel" : "";
  out += `${GR}─${N} ${GR}${helpText}${N} ${GR}${"─".repeat(Math.max(0, cols - helpText.length - 4))}${N}`;

  // Message overlay on last line
  if (s.message) {
    out += `\x1b[${rows};1H  ${GN}${B}${s.message}${N}`;
  }

  process.stdout.write(out);
}

// ─── Search ───────────────────────────────────────────────────────────────────

function avgStat(bones: BuddyBones): number {
  const vals = Object.values(bones.stats) as number[];
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

async function runSearch(s: State): Promise<void> {
  const wantSp    = SP_OPTS[s.ci[0]]  !== "any" ? SP_OPTS[s.ci[0]]  as Species  : null;
  const wantRa    = RA_OPTS[s.ci[1]]  !== "any" ? RA_OPTS[s.ci[1]]  as Rarity   : null;
  const wantShiny = SH_OPTS[s.ci[2]] === "yes"  ? true
                  : SH_OPTS[s.ci[2]] === "no"   ? false : null;
  const wantPeak  = ST_OPTS[s.ci[3]]  !== "any" ? ST_OPTS[s.ci[3]]  as StatName : null;
  const wantDump  = ST_OPTS[s.ci[4]]  !== "any" ? ST_OPTS[s.ci[4]]  as StatName : null;
  const wantEye   = EY_OPTS[s.ci[5]]  !== "any" ? EY_OPTS[s.ci[5]]  as Eye      : null;
  const wantHat   = HA_OPTS[s.ci[6]]  !== "any" ? HA_OPTS[s.ci[6]]  as Hat      : null;
  const minAvg    = AVG_OPTS[s.ci[7]] !== "any" ? Number(AVG_OPTS[s.ci[7]])      : null;
  const minDBG    = MIN_OPTS[s.ci[8]]  !== "any" ? Number(MIN_OPTS[s.ci[8]])     : null;
  const minPAT    = MIN_OPTS[s.ci[9]]  !== "any" ? Number(MIN_OPTS[s.ci[9]])     : null;
  const minCHA    = MIN_OPTS[s.ci[10]] !== "any" ? Number(MIN_OPTS[s.ci[10]])    : null;
  const minWIS    = MIN_OPTS[s.ci[11]] !== "any" ? Number(MIN_OPTS[s.ci[11]])    : null;
  const minSNK    = MIN_OPTS[s.ci[12]] !== "any" ? Number(MIN_OPTS[s.ci[12]])    : null;

  // Scale attempt budget to rarity difficulty
  const maxAttempts =
    wantRa === "legendary" ? 10_000_000_000 :
    wantRa === "epic"      ?  50_000_000 :
    wantRa === "rare"      ?  20_000_000 : 10_000_000;

  const results: BuddyResult[] = [];
  const YIELD_EVERY    = 5_000_000;
  const PROGRESS_EVERY = 1_000_000;

  for (let i = 0; i < maxAttempts && results.length < 20; i++) {
    if (!s.searching) break;

    if (i > 0 && i % YIELD_EVERY === 0) {
      await new Promise<void>(resolve => setImmediate(resolve));
    }

    if (i > 0 && i % PROGRESS_EVERY === 0) {
      s.searchStatus = `${(i / 1e6).toFixed(1)}M checked — ${results.length} found`;
      drawScreen(s);
    }

    const userId = randomBytes(16).toString("hex");
    const bones  = generateBones(userId);

    if (wantSp    !== null && bones.species !== wantSp)              continue;
    if (wantRa    !== null && bones.rarity  !== wantRa)              continue;
    if (wantShiny !== null && bones.shiny   !== wantShiny)           continue;
    if (wantPeak  !== null && bones.peak    !== wantPeak)            continue;
    if (wantDump  !== null && bones.dump    !== wantDump)            continue;
    if (wantEye   !== null && bones.eye     !== wantEye)             continue;
    if (wantHat   !== null && bones.hat     !== wantHat)             continue;
    if (minAvg    !== null && avgStat(bones) < minAvg)               continue;
    if (minDBG    !== null && bones.stats.DEBUGGING < minDBG)        continue;
    if (minPAT    !== null && bones.stats.PATIENCE  < minPAT)        continue;
    if (minCHA    !== null && bones.stats.CHAOS     < minCHA)        continue;
    if (minWIS    !== null && bones.stats.WISDOM    < minWIS)        continue;
    if (minSNK    !== null && bones.stats.SNARK     < minSNK)        continue;

    results.push({ userId, bones });
  }

  s.searching    = false;
  s.searchStatus = `${results.length} found`;
  s.results      = results;
  s.resultCursor = 0;
  s.mode         = "results";
  drawScreen(s);
}

// ─── Key handlers ─────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

/** Returns true if the TUI should exit. */
function onKey(key: string, s: State): boolean {
  if (key === "\x03") return true;  // Ctrl+C always quits

  switch (s.mode) {
    case "naming": {
      if (key === "\x1b") {
        s.mode = "results"; s.nameInput = ""; s.pendingResult = null;
      } else if (key === "\r" || key === "\n") {
        // Empty input → auto-pick a random unused name
        const name = s.nameInput.trim() || unusedName();
        const slot = slugify(name);
        if (loadCompanionSlot(slot)) {
          s.message = `"${slot}" already taken — type a different name`;
          s.nameInput = "";
          break;
        }
        const r    = s.pendingResult!;
        const companion: Companion = {
          bones: r.bones, name,
          personality: generatePersonality(r.bones, r.userId),
          hatchedAt: Date.now(), userId: r.userId,
        };
        saveCompanionSlot(companion, slot);
        saveActiveSlot(slot);
        writeStatusState(companion, `*${name} arrives*`);
        s.message = `✓ ${name} saved to slot "${slot}" and set as active!`;
        return true;
      } else if (key === "\u007f" || key === "\b") {
        s.nameInput = s.nameInput.slice(0, -1);
      } else if (key.length === 1 && key >= " " && s.nameInput.length < 14) {
        s.nameInput += key;
      }
      break;
    }

    case "saved": {
      if (s.confirmDelete) {
        if (key === "d" || key === "y") {
          const entry = s.savedSlots[s.savedCursor];
          if (entry) {
            deleteCompanionSlot(entry.slot);
            s.savedSlots  = listCompanionSlots();
            s.activeSlot  = loadActiveSlot();
            s.savedCursor = clamp(s.savedCursor, 0, Math.max(0, s.savedSlots.length - 1));
            s.message     = `✗ ${entry.companion.name} removed`;
          }
        }
        s.confirmDelete = false;
        break;
      }
      if (key === "q")                          return true;
      if (key === "s")                          { s.mode = "criteria"; break; }
      if (key === "d" && s.savedSlots.length > 0) { s.confirmDelete = true; break; }
      if (key === "\x1b[A" || key === "k")      s.savedCursor = clamp(s.savedCursor - 1, 0, s.savedSlots.length - 1);
      else if (key === "\x1b[B" || key === "j") s.savedCursor = clamp(s.savedCursor + 1, 0, s.savedSlots.length - 1);
      else if (key === "r") {
        if (s.savedSlots.length > 0) {
          const entry = s.savedSlots[Math.floor(Math.random() * s.savedSlots.length)];
          s.savedCursor = s.savedSlots.indexOf(entry);
          saveActiveSlot(entry.slot);
          writeStatusState(entry.companion, `*${entry.companion.name} arrives*`);
          s.message = `✓ ${entry.companion.name} summoned at random!`;
          return true;
        }
      } else if (key === "\r" || key === "\n") {
        const entry = s.savedSlots[s.savedCursor];
        if (entry) {
          saveActiveSlot(entry.slot);
          writeStatusState(entry.companion, `*${entry.companion.name} arrives*`);
          s.message = `✓ ${entry.companion.name} summoned!`;
          return true;
        }
      }
      break;
    }

    case "criteria": {
      if (key === "q")                          return true;
      if (key === "\x1b")                       { s.mode = "saved"; break; }
      if (key === "\x1b[A" || key === "k")      s.criteriaFocus = clamp(s.criteriaFocus - 1, 0, CRITERIA_ROWS.length - 1);
      else if (key === "\x1b[B" || key === "j") s.criteriaFocus = clamp(s.criteriaFocus + 1, 0, CRITERIA_ROWS.length - 1);
      else if (key === "\x1b[C" || key === "l") {
        const len = CRITERIA_ROWS[s.criteriaFocus].opts.length;
        s.ci[s.criteriaFocus] = (s.ci[s.criteriaFocus] + 1) % len;
      } else if (key === "\x1b[D" || key === "h") {
        const len = CRITERIA_ROWS[s.criteriaFocus].opts.length;
        s.ci[s.criteriaFocus] = (s.ci[s.criteriaFocus] - 1 + len) % len;
      } else if (key === "\r" || key === "\n") {
        s.mode         = "searching";
        s.searching    = true;
        s.searchStatus = "starting...";
        drawScreen(s);
        runSearch(s);  // fire-and-forget async; updates state and redraws when done
      }
      break;
    }

    case "searching": {
      s.searching = false;  // any key stops; runSearch will drain and switch to results
      break;
    }

    case "results": {
      if (key === "q")                          return true;
      if (key === "\x1b")                       { s.mode = "criteria"; break; }
      if (key === "\x1b[A" || key === "k")      s.resultCursor = clamp(s.resultCursor - 1, 0, s.results.length - 1);
      else if (key === "\x1b[B" || key === "j") s.resultCursor = clamp(s.resultCursor + 1, 0, s.results.length - 1);
      else if (key === "\r" || key === "\n") {
        const r = s.results[s.resultCursor];
        if (r) {
          s.pendingResult = r;
          s.nameInput    = "";  // empty — user types name or presses Enter for auto
          s.mode         = "naming";
        }
      }
      break;
    }
  }
  return false;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

function cleanup(): void {
  process.stdout.write("\x1b[?25h");  // show cursor
  try { process.stdin.setRawMode(false); } catch {}
  process.stdin.pause();
}

async function main(): Promise<void> {
  if (!process.stdin.isTTY) {
    console.error("buddy pick requires an interactive terminal (TTY)");
    process.exit(1);
  }

  process.stdout.write("\x1b[?25l");  // hide cursor
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(0); });

  const s = fresh();
  drawScreen(s);

  await new Promise<void>((resolve) => {
    process.stdin.on("data", (key: string) => {
      const quit = onKey(key, s);
      drawScreen(s);
      if (quit) {
        cleanup();
        process.stdout.write("\x1b[2J\x1b[H");
        if (s.message) console.log(`\n  ${s.message}\n`);
        resolve();
      }
    });
  });

  process.exit(0);
}

main();

#!/usr/bin/env bun
/**
 * buddy-shell — terminal wrapper with fixed buddy panel at bottom.
 *
 * Intercepts specific ANSI sequences from the PTY (alternate screen,
 * screen clear, scroll region reset) and repairs the panel after each.
 * Everything else passes through unmodified.
 *
 * Usage:
 *   bun run buddy-shell                 # preferred — routes through tsx/Node.js
 *   npx tsx cli/buddy-shell.ts          # same thing, manual
 *   npx tsx cli/buddy-shell.ts bash     # runs bash instead of claude
 *
 * This script cannot be executed directly by Bun (`bun run <path>`) —
 * node-pty uses libuv functions Bun does not yet implement (oven-sh/bun
 * #18546). The preflight below refuses early with a helpful message
 * rather than letting the Bun runtime panic on the native module load.
 */

// Preflight: refuse to run under Bun. Must happen BEFORE the dynamic
// node-pty import below, otherwise Bun crashes on the module load.
if (typeof (globalThis as { Bun?: unknown }).Bun !== "undefined") {
  process.stderr.write(
    "\n  ✗ buddy-shell cannot run under Bun — node-pty triggers a known\n" +
    "    Bun issue (https://github.com/oven-sh/bun/issues/18546).\n\n" +
    "    Use the npm script instead — it routes through Node.js via tsx:\n\n" +
    "        bun run buddy-shell\n\n" +
    "    Or invoke tsx directly:\n\n" +
    "        npx tsx cli/buddy-shell.ts\n\n",
  );
  process.exit(1);
}

import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { buddyStateDir } from "../server/path.ts";
import { getArtFrame, HAT_ART } from "../server/art.ts";
import type { Species, Eye, Hat } from "../core/engine.ts"
import { getBiome, listBiomes } from "./biomes.ts";
import xtermPkg from "@xterm/headless";
import serializePkg from "@xterm/addon-serialize";

// Dynamic import so Bun doesn't try to load node-pty at module-resolution
// time — the preflight above has already exited if we're under Bun.
// Using the Homebridge fork rather than Microsoft's upstream because the
// upstream ships no Linux prebuilds, forcing every Linux user to install
// node-gyp + Python + build-essential just to run this script.
const { spawn: ptySpawn } = await import("@homebridge/node-pty-prebuilt-multiarch");

const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { Terminal } = xtermPkg as any;
const { SerializeAddon } = serializePkg as any;

if (!process.stdin.isTTY && !process.argv.includes("--biomes")) {
  console.error("buddy-shell requires an interactive terminal (TTY)");
  process.exit(1);
}

// --biomes flag: list all and exit
if (process.argv.includes("--biomes")) {
  console.log("\nAvailable biomes:\n");
  for (const b of listBiomes()) {
    const tag = b.isDefault ? " (default)" : "";
    console.log(`  ${b.name}${tag}`);
  }
  console.log(`\nUsage: npx tsx cli/buddy-shell.ts claude --biome volcano\n`);
  process.exit(0);
}

// Parse --biome <name> from args
const biomeArgIdx = process.argv.indexOf("--biome");
const biomeOverride = biomeArgIdx >= 0 ? process.argv[biomeArgIdx + 1] : undefined;

const ESC = "\x1b";
const CSI = `${ESC}[`;
const moveTo = (r: number, c: number) => `${CSI}${r};${c}H`;
const clearLine = `${CSI}2K`;
const setScrollRegion = (top: number, bot: number) => `${CSI}${top};${bot}r`;
const BOLD = `${CSI}1m`;
const DIM = `${CSI}2m`;
const NC = `${CSI}0m`;
const CYAN = `${CSI}36m`;
const GREEN = `${CSI}32m`;
const YELLOW = `${CSI}33m`;
const MAGENTA = `${CSI}35m`;
const GRAY = `${CSI}90m`;

const RED = `${CSI}31m`;
const BLUE = `${CSI}34m`;

const RARITY_CLR: Record<string, string> = {
  common: GRAY, uncommon: GREEN, rare: BLUE,
  epic: MAGENTA, legendary: YELLOW,
};

const STATE_DIR = buddyStateDir();

// ─── xterm cell → ANSI renderer ─────────────────────────────────────────────
//
// Converts a single cell's color modes (default/palette/rgb) into the
// corresponding ANSI escape sequence. Tracks previous attributes so we
// only emit escape codes when something changes (massive perf win).

function fgForCell(cell: any): string {
  if (cell.isFgDefault()) return "39";
  if (cell.isFgRGB()) {
    const color = cell.getFgColor();
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    return `38;2;${r};${g};${b}`;
  }
  // Palette (16 or 256)
  return `38;5;${cell.getFgColor()}`;
}
function bgForCell(cell: any): string {
  if (cell.isBgDefault()) return "49";
  if (cell.isBgRGB()) {
    const color = cell.getBgColor();
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;
    return `48;2;${r};${g};${b}`;
  }
  return `48;5;${cell.getBgColor()}`;
}

const SCROLLBAR_WIDTH = 2;
const SCROLLBAR_GAP = 1;
const SCROLLBAR_RESERVED = SCROLLBAR_WIDTH + SCROLLBAR_GAP;

// ─── Custom selection (buffer-coord anchors, survives scroll) ───────────────

interface SelPoint { line: number; col: number }
interface Selection {
  anchor: SelPoint;   // where the click started (xterm buffer coords)
  cursor: SelPoint;   // where the drag is now
  mode: "char" | "word" | "line";
  dragging: boolean;  // mouse button currently held
}

let selection: Selection | null = null;

// Multi-click tracking for double-click word / triple-click line selection
let lastClick: { time: number; line: number; col: number; count: number } | null = null;
const MULTI_CLICK_MS = 600;

function isWordChar(ch: string): boolean {
  return /[\w-]/.test(ch);
}

function charAt(line: number, col: number): string {
  const l = xterm.buffer.active.getLine(line);
  if (!l) return " ";
  const c = l.getCell(col);
  return c?.getChars() || " ";
}

function lineLen(line: number): number {
  return xterm.buffer.active.getLine(line)?.length ?? 0;
}

function wordBoundsAt(line: number, col: number): { start: number; end: number } {
  const len = lineLen(line);
  if (len === 0) return { start: 0, end: 0 };
  const c = Math.min(col, len - 1);
  if (!isWordChar(charAt(line, c))) return { start: c, end: c };
  let start = c;
  while (start > 0 && isWordChar(charAt(line, start - 1))) start--;
  let end = c;
  while (end < len - 1 && isWordChar(charAt(line, end + 1))) end++;
  return { start, end };
}

function rawOrder(): { s: SelPoint; e: SelPoint } | null {
  if (!selection) return null;
  const { anchor, cursor } = selection;
  const sFirst = anchor.line < cursor.line
    || (anchor.line === cursor.line && anchor.col <= cursor.col);
  return sFirst ? { s: anchor, e: cursor } : { s: cursor, e: anchor };
}

function selStart(): SelPoint | null {
  if (!selection) return null;
  const { s } = rawOrder()!;
  if (selection.mode === "word") {
    return { line: s.line, col: wordBoundsAt(s.line, s.col).start };
  }
  if (selection.mode === "line") {
    return { line: s.line, col: 0 };
  }
  return s;
}

function selEnd(): SelPoint | null {
  if (!selection) return null;
  const { e } = rawOrder()!;
  if (selection.mode === "word") {
    return { line: e.line, col: wordBoundsAt(e.line, e.col).end };
  }
  if (selection.mode === "line") {
    return { line: e.line, col: Math.max(0, lineLen(e.line) - 1) };
  }
  return e;
}

function isCellSelected(line: number, col: number): boolean {
  if (!selection) return false;
  const s = selStart()!;
  const e = selEnd()!;
  // Hide empty (single-cell, non-dragged) selections — a plain click
  // shouldn't leave a lingering inverse character on the screen.
  if (!selection.dragging && selection.mode === "char"
      && s.line === e.line && s.col === e.col) return false;
  if (line < s.line || line > e.line) return false;
  if (s.line === e.line) return col >= s.col && col <= e.col;
  if (line === s.line) return col >= s.col;
  if (line === e.line) return col <= e.col;
  return true;
}

function renderScrollbar(term: any, startRow: number, codeRows: number, col: number): string {
  const buf = term.buffer.active;
  if (buf.baseY === 0) return "";

  const ratio = buf.viewportY / buf.baseY;
  const totalLines = buf.length;
  const thumbSize = Math.max(1, Math.floor((codeRows * codeRows) / totalLines));
  const thumbTop = Math.round(ratio * (codeRows - thumbSize));

  const out: string[] = [];
  for (let i = 0; i < codeRows; i++) {
    const isThumb = i >= thumbTop && i < thumbTop + thumbSize;
    const seg = isThumb ? `${CSI}36m██${CSI}0m` : `${CSI}90m╎╎${CSI}0m`;
    out.push(moveTo(startRow + i, col - SCROLLBAR_WIDTH + 1) + seg);
  }
  return out.join("");
}

function renderXtermViewport(term: any, startRow: number, codeRows: number, cols: number): string {
  const buf = term.buffer.active;
  const viewportTop = buf.viewportY;
  const out: string[] = [];

  for (let vy = 0; vy < codeRows; vy++) {
    const bufY = viewportTop + vy;
    const line = buf.getLine(bufY);
    out.push(moveTo(startRow + vy, 1));
    out.push(`${CSI}0m`);

    if (!line) {
      out.push(" ".repeat(cols));
      continue;
    }

    let lastAttrs = "";
    let rendered = 0;

    for (let x = 0; x < Math.min(line.length, cols); x++) {
      const cell = line.getCell(x);
      if (!cell) { out.push(" "); rendered++; continue; }

      const selected = isCellSelected(bufY, x);
      const parts: string[] = ["0"];
      if (cell.isBold()) parts.push("1");
      if (cell.isDim()) parts.push("2");
      if (cell.isItalic()) parts.push("3");
      if (cell.isUnderline()) parts.push("4");
      if (Boolean(cell.isInverse()) !== selected) parts.push("7"); // XOR
      parts.push(fgForCell(cell));
      parts.push(bgForCell(cell));
      const attrs = parts.join(";");

      if (attrs !== lastAttrs) {
        out.push(`${CSI}${attrs}m`);
        lastAttrs = attrs;
      }

      const chars = cell.getChars();
      const width = cell.getWidth();
      if (width === 0) continue;
      out.push(chars || " ");
      rendered += width || 1;
    }

    // Pad remainder of row with spaces (reset first so bg doesn't bleed)
    if (rendered < cols) {
      out.push(`${CSI}0m`);
      out.push(" ".repeat(cols - rendered));
    }
  }

  return out.join("");
}

function layout() {
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;
  const panel = Math.max(5, Math.floor(rows * 0.20));
  const code = rows - panel;
  return { cols, rows, panel, code };
}

function loadStatus(): Record<string, any> | null {
  try {
    return JSON.parse(readFileSync(join(STATE_DIR, "status.json"), "utf8"));
  } catch { return null; }
}

function loadStats(): Record<string, any> | null {
  try {
    const m = JSON.parse(readFileSync(join(STATE_DIR, "menagerie.json"), "utf8"));
    return m.companions?.[m.active]?.bones ?? null;
  } catch { return null; }
}

// ─── Render panel + set scroll region ───────────────────────────────────────

// ─── Interactive panel state ────────────────────────────────────────────────

let panelFocus = false;
let menuCursor = 0;
let pauseOutput = false; // when true, swallow PTY output (Claude is "hidden")
const MENU_ITEMS = ["Dashboard"];
let panelMessage = "";

function setupPanel() {
  const { cols, code, panel } = layout();
  const s = loadStatus();
  const bones = loadStats();

  const out: string[] = [];

  // Set scroll region to code area only
  out.push(setScrollRegion(1, code));

  // Clear panel area
  for (let i = 0; i < panel; i++) {
    out.push(moveTo(code + 1 + i, 1) + clearLine);
  }

  // Separator line with focus hint
  {
    const clrLine = panelFocus ? `${CSI}33m` : CYAN;
    const label = panelFocus ? " buddy [FOCUS] " : " buddy  ";
    const hint = panelFocus ? " esc back " : " Ctrl+Space / F2 to open ";
    const used = label.length + hint.length + 2;
    out.push(moveTo(code + 1, 1) +
      `${clrLine}─${label}${DIM}${hint}${NC}${clrLine}${"─".repeat(Math.max(0, cols - used))}${NC}`);
  }

  if (!s) {
    out.push(moveTo(code + 2, 1) +
      `${DIM}  No buddy. Run: bun run install-buddy${NC}`);
    process.stdout.write(out.join(""));
    return;
  }

  const clr = RARITY_CLR[s.rarity] ?? GRAY;
  const shiny = s.shiny ? " ✨" : "";

  // ─── 3-column layout ──────────────────────────────────────────
  //
  //  | left: speech bubble | center: buddy art | far right: stats |
  //

  // Get ASCII art
  let artLines: string[] = [];
  try {
    artLines = getArtFrame(s.species as Species, s.eye as Eye, 0);
    const hatLine = HAT_ART[s.hat as Hat];
    if (hatLine && artLines[0] && !artLines[0].trim()) artLines[0] = hatLine;
    artLines = artLines.filter(l => l.trim());
  } catch {
    artLines = [s.face || "(??)"];
  }

  const contentRows = panel - 1;
  const artW = 14;
  const artStart = Math.floor(cols / 2) - Math.floor(artW / 2);

  // ── Speech bubble (simple, above buddy) ──
  let bubbleLines: string[] = [];
  const maxBubbleW = Math.min(40, artStart - 4); // up to 40 chars or available space
  const maxBubbleLines = Math.max(1, contentRows - 2); // leave room for top/bottom border

  if (s.reaction && !s.muted && maxBubbleW > 8) {
    const text = s.reaction;
    const wrapped: string[] = [];
    let line = "";
    for (const word of text.split(" ")) {
      if (line.length + word.length + 1 > maxBubbleW) {
        if (line) wrapped.push(line);
        line = word.length > maxBubbleW ? word.slice(0, maxBubbleW - 1) + "…" : word;
      } else {
        line = line ? line + " " + word : word;
      }
    }
    if (line) wrapped.push(line);
    const maxLines = Math.min(wrapped.length, maxBubbleLines);
    const bw = Math.max(...wrapped.slice(0, maxLines).map(l => l.length));
    bubbleLines.push(`╭${"─".repeat(bw + 2)}╮`);
    for (let i = 0; i < maxLines; i++) {
      bubbleLines.push(`│ ${wrapped[i].padEnd(bw)} │`);
    }
    bubbleLines.push(`╰${"─".repeat(bw + 2)}╯`);
  }
  const bubbleW = bubbleLines.length > 0 ? bubbleLines[0].length : 0;
  // Position bubble upper-left of the buddy (right edge slightly overlaps buddy's left side)
  const bubbleCol = Math.max(1, artStart + 2 - bubbleW);

  // ── Right column: name + stats (far right) ──
  const statW = 20;
  const rightStart = cols - statW;
  const rightLines: string[] = [];
  rightLines.push(`${BOLD}${clr}${s.name}${NC}${shiny}`);
  rightLines.push(`${clr}${s.rarity?.toUpperCase()} ${s.species} ${s.stars}${NC}`);

  if (bones?.stats) {
    for (const [k, v] of Object.entries(bones.stats as Record<string, number>)) {
      const marker = k === bones.peak ? "▲" : k === bones.dump ? "▼" : " ";
      const c = k === bones.peak ? GREEN : k === bones.dump ? `${CSI}31m` : DIM;
      rightLines.push(`${c}${k.padEnd(10)} ${String(v).padStart(3)}${marker}${NC}`);
    }
  }

  // ── Generate landscape from biome ──
  function renderBgRow(row: number, seed: number, isGround: boolean): string {
    const bgOut: string[] = [];
    bgOut.push(moveTo(row, 1) + clearLine);
    if (isGround) {
      bgOut.push(moveTo(row, 1));
      let line = "";
      const gc = biome.groundChars;
      for (let x = 0; x < cols; x++) {
        line += gc[(x * 13 + 7) % gc.length];
      }
      bgOut.push(`${biome.ground}${line}${NC}`);
    } else {
      const pChars = biome.particle.chars;
      for (let x = 1; x <= cols; x++) {
        const h = ((seed * 31 + x * 17) % 97);
        if (h < 3) {
          bgOut.push(moveTo(row, x) + `${biome.particle.color}${pChars[0]}${NC}`);
        } else if (h < 5 && pChars.length > 1) {
          bgOut.push(moveTo(row, x) + `${biome.particle.color}${pChars[1]}${NC}`);
        } else if (h < 6 && pChars.length > 2) {
          bgOut.push(moveTo(row, x) + `${biome.particle.color}${pChars[2]}${NC}`);
        }
      }
    }
    return bgOut.join("");
  }

  // Structure from biome (house/lighthouse/tower/etc)
  const biome = getBiome(s.rarity, biomeOverride);
  const structureLines = biome.structure.slice(-contentRows);
  const structureStart = artStart + artW + 2;

  // Position buddy so feet are on the ground (last art line = last row)
  // If art has 4 lines and contentRows is 4:
  //   row 0: art[0] (sky)
  //   row 1: art[1] (sky)
  //   row 2: art[2] (sky)
  //   row 3: art[3] (ground) — feet on grass
  const artOffset = Math.max(0, contentRows - artLines.length);
  const structOffset = Math.max(0, contentRows - structureLines.length);

  // ── Render rows ──
  for (let i = 0; i < contentRows; i++) {
    const row = code + 2 + i;
    const isLastRow = i === contentRows - 1;

    // Background: sky or ground
    out.push(renderBgRow(row, i * 3 + 1, isLastRow));

    // Interactive menu (top-left of panel)
    if (i < MENU_ITEMS.length) {
      const isCursor = panelFocus && i === menuCursor;
      const prefix = isCursor ? `${CSI}33m▸ ` : "  ";
      const text = MENU_ITEMS[i];
      const colorOn = panelFocus ? (isCursor ? `${CSI}33m${BOLD}` : `${CSI}37m`) : DIM;
      out.push(moveTo(row, 2) + `${colorOn}${prefix}${text}${NC}`);
    }

    // Panel message (bottom row if there's a message)
    if (i === contentRows - 1 && panelMessage) {
      out.push(moveTo(row, 2) + `${GREEN}✓ ${panelMessage}${NC}`);
    }

    // Structure from biome (right of buddy, on the ground)
    const structIdx = i - structOffset;
    if (structIdx >= 0 && structIdx < structureLines.length && structureStart + 16 < rightStart) {
      out.push(moveTo(row, structureStart) + structureLines[structIdx]);
    }

    // Buddy art (feet on ground) — rendered BEFORE the bubble
    const artIdx = i - artOffset;
    if (artIdx >= 0 && artIdx < artLines.length) {
      out.push(moveTo(row, artStart) + `${clr}${BOLD}${artLines[artIdx]}${NC}`);
    }

    // Stats (far right)
    if (i < rightLines.length) {
      out.push(moveTo(row, rightStart) + rightLines[i]);
    }

    // Speech bubble (rendered LAST — highest z-index, always on top)
    if (i < bubbleLines.length && bubbleCol > 0) {
      out.push(moveTo(row, bubbleCol) + `${clr}${bubbleLines[i]}${NC}`);
    }
  }

  process.stdout.write(out.join(""));
}

// ─── Sequences that destroy our panel ───────────────────────────────────────

const DESTRUCTIVE = [
  "\x1b[?1049h",   // enter alternate screen
  "\x1b[?1049l",   // leave alternate screen
  "\x1b[2J",       // clear entire screen
  "\x1b[r",        // reset scroll region
];

function containsDestructive(data: string): boolean {
  return DESTRUCTIVE.some(seq => data.includes(seq));
}

// ─── Main ───────────────────────────────────────────────────────────────────

const { cols, code } = layout();

process.stdin.setRawMode(true);
process.stdin.resume();

// Enter alternate screen buffer. Since xterm-headless manages Claude's scrollback
// internally and we intercept mouse wheel to scroll xterm, we don't need the
// terminal's native scrollback. Alt screen gives us:
//   - No native scrollbar confusion (nothing to show in main buffer)
//   - No resize pollution (alt buffer has no scrollback)
//   - Clean exit (terminal's pre-wrapper content is restored, like vim/htop)
process.stdout.write(`${CSI}?1049h`);
process.stdout.write(`${CSI}2J${moveTo(1, 1)}`);
setupPanel();

// Spawn PTY (filter out --biome args)
const rawArgs = process.argv.slice(2).filter((a, i, arr) =>
  a !== "--biome" && (i === 0 || arr[i - 1] !== "--biome")
);
const cmd = rawArgs[0] || "claude";
const args = rawArgs.slice(1);

// Create a virtual xterm terminal for Claude. We feed Claude's PTY output
// into xterm, which parses ANSI and maintains its own cell buffer + scrollback.
// Then we render the visible viewport into the top area of the real terminal.
// This gives us true scrollback isolation — the real terminal's main buffer
// is not polluted by Claude's output.
const xterm = new Terminal({
  cols: cols - SCROLLBAR_RESERVED,
  rows: code,
  scrollback: 5000,
  allowProposedApi: true,
});

// Serialize addon lets us save/restore the buffer as an ANSI string.
// Used on resize: save → clear → resize → restore → Claude's redraw goes on top.
const serializeAddon = new SerializeAddon();
xterm.loadAddon(serializeAddon);

const pty = ptySpawn(cmd, args, {
  name: "xterm-256color",
  cols: cols - SCROLLBAR_RESERVED,
  rows: code,
  cwd: process.cwd(),
  env: { ...process.env, BUDDY_SHELL: "1" } as Record<string, string>,
});

// Coalesced renderer — we don't re-render on every tiny PTY chunk,
// we accumulate and render at most every ~16ms (60 fps).
let renderPending = false;
// Track what we last told the real terminal so we only send updates on change
let lastCursorX = -1, lastCursorY = -1;
let lastCursorVisible = true;

function renderNow() {
  renderPending = false;
  if (pauseOutput) return;
  const { cols: c, code: h } = layout();
  const innerCols = c - SCROLLBAR_RESERVED;
  const buf = xterm.buffer.active;
  const isAtBottom = buf.viewportY === buf.baseY;

  const parts: string[] = [];
  parts.push(`${CSI}?25l`);
  parts.push(renderXtermViewport(xterm, 1, h, innerCols));
  parts.push(renderScrollbar(xterm, 1, h, c));
  if (isAtBottom) {
    parts.push(moveTo(buf.cursorY + 1, buf.cursorX + 1));
    parts.push(`${CSI}?25h`);
  }
  process.stdout.write(parts.join(""));
}

function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  setTimeout(renderNow, 16);
}

pty.onData((data: string) => {
  xterm.write(data);
  if (!pauseOutput) scheduleRender();
});

// Enable SGR mouse tracking: 1002 = button-event (press + motion while held),
// 1006 = SGR protocol (distinct sequences from keyboard). We implement our
// own selection + clipboard because native terminal selection can't stay in
// sync when we scroll xterm's virtual buffer.
process.stdout.write(`${CSI}?1002h${CSI}?1006h`);

// Keyboard → PTY or panel
process.stdin.on("data", (data: Buffer) => {
  const s = data.toString();

  // SGR mouse events: \x1b[<btn;x;y[Mm]
  // M = press/motion, m = release
  // btn 0 = left, btn 32 = motion-with-button, btn 64 = wheel up, btn 65 = wheel down
  // (modifier flags: +4 shift, +8 alt, +16 ctrl)
  const mouseEvents = [...s.matchAll(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/g)];
  if (mouseEvents.length > 0 && !panelFocus) {
    const { code: mouseCode } = layout();
    let handled = false;

    for (const m of mouseEvents) {
      const rawBtn = parseInt(m[1], 10);
      const mx = parseInt(m[2], 10);
      const my = parseInt(m[3], 10);
      const release = m[4] === "m";
      const btn = rawBtn & 3;       // 0=left, 1=mid, 2=right, 3=none
      const isMotion = (rawBtn & 32) !== 0;
      const isWheel = (rawBtn & 64) !== 0;

      // Wheel scroll
      if (isWheel) {
        xterm.scrollLines((rawBtn === 64 ? -3 : 3));
        handled = true;
        continue;
      }

      // Only handle mouse in the code area (not panel)
      if (my < 1 || my > mouseCode) continue;

      // Left button only (press/motion/release)
      if (btn === 0 || (release && rawBtn === 0)) {
        const buf = xterm.buffer.active;
        const bufLine = buf.viewportY + my - 1;
        const bufCol = Math.min(mx - 1, buf.getLine(bufLine)?.length ?? mx - 1);

        if (release) {
          // End of drag — finalize cursor at release point, keep selection visible
          if (selection) {
            selection.cursor = { line: bufLine, col: bufCol };
            selection.dragging = false;
          }
        } else if (isMotion) {
          // Motion with button held — update cursor (only if we have an active drag)
          if (selection && selection.dragging) {
            selection.cursor = { line: bufLine, col: bufCol };
          }
        } else {
          // Press — detect single/double/triple click by time + proximity
          const now = Date.now();
          const sameSpot = lastClick
            && now - lastClick.time < MULTI_CLICK_MS
            && Math.abs(lastClick.line - bufLine) <= 1
            && Math.abs(lastClick.col - bufCol) <= 3;
          const count = sameSpot ? Math.min(lastClick!.count + 1, 3) : 1;
          lastClick = { time: now, line: bufLine, col: bufCol, count };

          const mode = count === 1 ? "char" : count === 2 ? "word" : "line";
          selection = {
            anchor: { line: bufLine, col: bufCol },
            cursor: { line: bufLine, col: bufCol },
            mode,
            dragging: true,
          };
        }
        handled = true;
      }
    }

    if (handled) renderNow();
    return;
  }

  // Ctrl+Space (\x00) or F2 (\x1bOQ or \x1b[12~) — toggle panel focus
  if (s === "\x00" || s === "\x1bOQ" || s === "\x1b[12~") {
    panelFocus = !panelFocus;
    panelMessage = "";
    refreshPanel();
    return;
  }

  // Panel focus mode (small menu at bottom)
  if (panelFocus) {
    if (s === "\x1b[A") { menuCursor = Math.max(0, menuCursor - 1); refreshPanel(); return; }
    if (s === "\x1b[B") { menuCursor = Math.min(MENU_ITEMS.length - 1, menuCursor + 1); refreshPanel(); return; }
    if (s === "\r" || s === "\n") {
      if (menuCursor === 0) {
        panelFocus = false;
        launchDashboard();
      }
      return;
    }
    if (s === "\x1b") { panelFocus = false; panelMessage = ""; refreshPanel(); return; }
    return;
  }

  // Normal mode: typing clears any lingering selection, then forwards to PTY
  if (selection) {
    selection = null;
    scheduleRender();
  }
  pty.write(s);
});

function refreshPanel() {
  process.stdout.write(`${ESC}7`);
  setupPanel();
  process.stdout.write(`${ESC}8`);
}

// Launch the full TUI dashboard as a blocking child process.
//
// IMPORTANT: we stay in the alt-screen buffer throughout. Ink renders inline
// (it does not use its own alt-screen), so if we exited to main here the TUI
// would paint into the user's original terminal — and its remnants would
// surface when buddy-shell finally exits. By staying in alt, any TUI output
// is contained in the alt buffer which the terminal discards on exit.
function launchDashboard() {
  pauseOutput = true;

  // Release terminal state the TUI conflicts with, but keep alt screen.
  process.stdout.write(`${CSI}?1002l${CSI}?1006l`); // disable our mouse tracking
  process.stdout.write(`${CSI}r`);                  // reset scroll region
  process.stdout.write(`${CSI}2J${moveTo(1, 1)}`);  // clear alt buffer
  process.stdout.write(`${CSI}?25h`);               // show cursor
  try { process.stdin.setRawMode(false); } catch {}

  try {
    execSync("bun run tui", {
      stdio: "inherit",
      cwd: PROJECT_ROOT,
      // Propagate the flag so the TUI can show a "suppressed while in
      // buddy-shell" hint next to the Status Line setting.
      env: { ...process.env, BUDDY_SHELL: "1" },
    });
  } catch {
    // user exited or TUI errored — either way we return to the panel
  }

  // Re-acquire terminal and redraw our layout.
  try { process.stdin.setRawMode(true); } catch {}
  process.stdout.write(`${CSI}?1002h${CSI}?1006h`); // re-enable mouse
  process.stdout.write(`${CSI}2J${moveTo(1, 1)}`);  // wipe any TUI leftovers

  const { cols: c, code: h } = layout();
  const innerCols = c - SCROLLBAR_RESERVED;
  process.stdout.write(setScrollRegion(1, h));
  process.stdout.write(renderXtermViewport(xterm, 1, h, innerCols));
  process.stdout.write(renderScrollbar(xterm, 1, h, c));
  setupPanel();

  panelMessage = "";
  pauseOutput = false;
}

// Resize: clear xterm completely (no history preservation — like tmux).
// Claude's SIGWINCH redraw lands on a clean buffer. Loses conversation
// history across resize, but avoids ghost echoes.
process.stdout.on("resize", () => {
  const l = layout();
  const innerCols = l.cols - SCROLLBAR_RESERVED;
  xterm.reset();
  xterm.resize(innerCols, l.code);
  pty.resize(innerCols, l.code);
  process.stdout.write(`${CSI}2J`);
  process.stdout.write(renderXtermViewport(xterm, 1, l.code, innerCols));
  setupPanel();
  pty.write("\x0c");
});

// Periodic panel refresh (repairs gradual damage). Skipped while the TUI
// dashboard owns the terminal — pauseOutput is set during that window.
const timer = setInterval(() => {
  if (pauseOutput) return;
  process.stdout.write(`${ESC}7`);
  setupPanel();
  process.stdout.write(`${ESC}8`);
}, 3000);

// Cleanup: leave alt screen — original terminal content comes back
pty.onExit(({ exitCode }) => {
  clearInterval(timer);
  process.stdout.write(`${CSI}r`);                   // reset scroll region
  process.stdout.write(`${CSI}?1002l${CSI}?1006l`);   // disable mouse tracking
  process.stdout.write(`${CSI}?1049l`);              // leave alt screen
  process.stdout.write(`${CSI}?25h`);                // show cursor
  try { process.stdin.setRawMode(false); } catch {}
  process.stdin.pause();
  process.exit(exitCode);
});

await new Promise(() => {});

/**
 * coding-buddy hunt — brute-force search for a specific buddy
 *
 * Rules:
 *   - Asks for a name before saving
 *   - If no name given, picks a random unused name from the manifest
 *   - Appends to the manifest — never overwrites an existing slot
 */

import { searchBuddy, renderBuddy, SPECIES, RARITIES, STAT_NAMES,
type Species, type Rarity, type StatName, type SearchCriteria, } from "../core/engine.ts"
import {
  saveCompanionSlot, saveActiveSlot, writeStatusState,
  slugify, unusedName, listCompanionSlots,
} from "../server/state.ts";
import { createInterface } from "readline";

const CYAN  = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED   = "\x1b[31m";
const BOLD  = "\x1b[1m";
const DIM   = "\x1b[2m";
const NC    = "\x1b[0m";

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

function pickFromList<T extends string>(label: string, items: readonly T[]): Promise<T> {
  return new Promise(async (resolve) => {
    console.log(`\n${BOLD}${label}${NC}`);
    items.forEach((item, i) => console.log(`  ${CYAN}${(i + 1).toString().padStart(2)}${NC}) ${item}`));
    while (true) {
      const ans = await ask(`\n  Choice [1-${items.length}]: `);
      const idx = parseInt(ans) - 1;
      if (idx >= 0 && idx < items.length) { resolve(items[idx]); return; }
      console.log(`  ${RED}Invalid. Enter 1-${items.length}.${NC}`);
    }
  });
}

async function main() {
  console.log(`
${CYAN}╔══════════════════════════════════════════════════════════╗${NC}
${CYAN}║${NC}  ${BOLD}coding-buddy hunt${NC} — find your perfect companion          ${CYAN}║${NC}
${CYAN}╚══════════════════════════════════════════════════════════╝${NC}
`);

  const species = await pickFromList("Species:", SPECIES);
  console.log(`${GREEN}✓${NC} ${species}`);

  const rarity = await pickFromList("Rarity:", RARITIES);
  console.log(`${GREEN}✓${NC} ${rarity}`);

  const shinyAns = await ask(`\n  Shiny? (much longer search) [y/N]: `);
  const wantShiny = shinyAns.toLowerCase() === "y";
  console.log(`${GREEN}✓${NC} shiny: ${wantShiny ? "yes" : "any"}`);

  let wantPeak: StatName | undefined;
  let wantDump: StatName | undefined;

  const statsAns = await ask(`\n  Configure stats? [Y/n]: `);
  if (statsAns.toLowerCase() !== "n") {
    wantPeak = await pickFromList("Peak stat (highest):", STAT_NAMES);
    const dumpOptions = STAT_NAMES.filter((s) => s !== wantPeak);
    wantDump = await pickFromList("Dump stat (lowest):", dumpOptions as any);
    console.log(`${GREEN}✓${NC} peak=${wantPeak} dump=${wantDump}`);
  }

  let maxAttempts = 10_000_000;
  if (rarity === "legendary") maxAttempts = 200_000_000;
  else if (rarity === "epic") maxAttempts = 50_000_000;
  if (wantShiny) maxAttempts *= 3;

  console.log(`\n${DIM}  Max attempts: ${(maxAttempts / 1e6).toFixed(0)}M${NC}`);

  const startAns = await ask(`\n  Start search? [Y/n]: `);
  if (startAns.toLowerCase() === "n") { rl.close(); return; }

  console.log(`\n${CYAN}→${NC}  Searching...\n`);

  const criteria: SearchCriteria = { species, rarity, wantShiny };
  if (wantPeak) criteria.wantPeak = wantPeak;
  if (wantDump) criteria.wantDump = wantDump;

  const results = searchBuddy(criteria, maxAttempts, (checked, found) => {
    process.stderr.write(`\r  ${(checked / 1e6).toFixed(0)}M checked, ${found} matches   `);
  });

  console.log("");

  if (results.length === 0) {
    console.log(`${RED}✗${NC}  No matches found. Try less restrictive criteria.`);
    rl.close();
    return;
  }

  console.log(`${GREEN}✓${NC}  ${results.length} matches found!\n`);

  // Show top 5
  const top = results.slice(0, 5);
  for (let i = 0; i < top.length; i++) {
    const r = top[i];
    const stats = STAT_NAMES.map((n) => `${n.slice(0, 3)}:${r.bones.stats[n]}`).join(" ");
    const shiny = r.bones.shiny ? "✨ " : "   ";
    console.log(`  ${CYAN}${i + 1}${NC}) ${shiny}eye=${r.bones.eye} hat=${r.bones.hat}  ${stats}`);
  }

  const pickAns = await ask(`\n  Apply which? [1-${top.length}, q to cancel]: `);
  if (pickAns === "q") { rl.close(); return; }

  const pickIdx = parseInt(pickAns) - 1;
  if (pickIdx < 0 || pickIdx >= top.length) {
    console.log(`${RED}Invalid.${NC}`);
    rl.close();
    return;
  }

  const chosen = top[pickIdx];
  console.log(`\n${renderBuddy(chosen.bones)}\n`);

  // ─── Ask for a name ────────────────────────────────────────────────────────
  const existing = new Set(listCompanionSlots().map((e) => slugify(e.companion.name)));
  const suggested = unusedName();
  console.log(`\n${DIM}  Existing buddies: ${[...existing].join(", ") || "none"}${NC}`);

  let chosenName = "";
  while (true) {
    const raw = await ask(
      `  Name this buddy (Enter for "${suggested}"): `,
    );
    chosenName = raw.trim() || suggested;
    const slot = slugify(chosenName);
    if (existing.has(slot)) {
      console.log(`  ${YELLOW}⚠${NC}  Slot "${slot}" already taken — pick another name.`);
    } else {
      break;
    }
  }

  const slot = slugify(chosenName);
  const companion = {
    bones: chosen.bones,
    name: chosenName,
    personality: `A ${chosen.bones.rarity} ${chosen.bones.species} who watches code with quiet intensity.`,
    hatchedAt: Date.now(),
    userId: chosen.userId,
  };

  saveCompanionSlot(companion, slot);
  saveActiveSlot(slot);
  writeStatusState(companion, `*${chosenName} arrives*`);

  console.log(`${GREEN}✓${NC}  ${chosenName} saved to slot "${slot}" and set as active.`);
  console.log(`\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}`);
  console.log(`${GREEN}  Done! Restart Claude Code to see your new buddy.${NC}`);
  console.log(`${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n`);

  rl.close();
}

main();

#!/usr/bin/env bun
/**
 * coding-buddy skin — opt the ACTIVE companion into a custom skin.
 *
 *   bun run skin                 list skins that fit your active companion
 *   bun run skin <name>          wear <name> (must be drawn for your species)
 *   bun run skin --clear         back to the built-in art
 *   bun run skin check <file>    validate a skin JSON without installing it
 *
 * Skins live in <state-dir>/custom-art/*.json (see custom-art/README.md).
 */

import { readFileSync } from "fs";
import { validateSkin } from "../core/custom-art.ts";
import { customArtDir, loadCustomSkins } from "../server/custom-art.ts";
import { loadCompanion, saveCompanion, writeStatusState } from "../server/state.ts";

const [cmd, arg] = process.argv.slice(2);

if (cmd === "check") {
  if (!arg) {
    console.error("Usage: bun run skin check <file.json>");
    process.exit(1);
  }
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(arg, "utf8"));
  } catch (e) {
    console.error(`✗ ${arg}: cannot read/parse JSON (${(e as Error).message})`);
    process.exit(1);
  }
  const { skin, errors } = validateSkin(data);
  if (!skin) {
    console.error(`✗ ${arg}:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`✓ ${arg}: skin "${skin.name}" for species ${skin.species}`);
  process.exit(0);
}

const companion = loadCompanion();
if (!companion) {
  console.error("No companion found. Run 'coding-buddy install' first.");
  process.exit(1);
}
const species = companion.bones.species;
const skins = loadCustomSkins();
const fitting = Object.values(skins).filter((s) => s.species === species).map((s) => s.name);

if (!cmd) {
  console.log(`Active: ${companion.name} (${species}), skin: ${companion.bones.skin ?? "(built-in)"}`);
  console.log(`Skins in ${customArtDir()} for ${species}: ${fitting.length ? fitting.join(", ") : "(none)"}`);
  process.exit(0);
}

if (cmd === "--clear") {
  delete companion.bones.skin;
} else {
  const s = skins[cmd];
  if (!s) {
    console.error(`No valid skin "${cmd}" in ${customArtDir()}. Run \`bun run skin check <file>\` to see why.`);
    process.exit(1);
  }
  if (s.species !== species) {
    console.error(`Skin "${cmd}" is drawn for ${s.species}; ${companion.name} is a ${species}.`);
    process.exit(1);
  }
  companion.bones.skin = cmd;
}
saveCompanion(companion);
writeStatusState(companion);
console.log(cmd === "--clear" ? `${companion.name} is back to built-in art.` : `${companion.name} now wears "${cmd}".`);

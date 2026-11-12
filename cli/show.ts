/**
 * coding-buddy show — display current companion in terminal
 */

import { renderBuddy, renderFace, RARITY_STARS } from "../core/engine.ts"
import { loadCompanion, loadReaction } from "../server/state.ts";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const NC = "\x1b[0m";

const companion = loadCompanion();

if (!companion) {
  console.log("No companion found. Run 'coding-buddy install' first.");
  process.exit(1);
}

console.log("");
console.log(renderBuddy(companion.bones));
console.log("");
console.log(`  ${BOLD}${companion.name}${NC}`);
console.log(`  ${DIM}${companion.personality}${NC}`);
console.log("");

const reaction = loadReaction();
if (reaction) {
  const face = renderFace(companion.bones.species, companion.bones.eye);
  console.log(`  ${face} "${reaction.reaction}"`);
  console.log("");
}

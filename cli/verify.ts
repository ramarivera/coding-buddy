/**
 * coding-buddy verify — show what buddy a user ID produces
 */

import { generateBones, renderBuddy, STAT_NAMES } from "../core/engine.ts"
import { resolveUserId } from "../server/state.ts";

const userId = process.argv[3] || resolveUserId();

console.log(`\nUser ID: ${userId.slice(0, 16)}...`);
console.log("");

const bones = generateBones(userId);
console.log(renderBuddy(bones));

const statLine = STAT_NAMES.map((n) => `${n}:${bones.stats[n]}`).join(" | ");
console.log(`\n  ${statLine}`);
console.log(`  peak=${bones.peak}  dump=${bones.dump}`);
console.log("");

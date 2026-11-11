import type { Companion } from "../../core/model.ts";

export function buildBuddyReactionSystemPrompt(companion: Companion): string {
  return [
    `A small ${companion.bones.rarity} ${companion.bones.species} named ${companion.name} watches from the status line. You are not ${companion.name} — it is a separate creature.`,
    `Personality: ${companion.personality}`,
    `Peak stat: ${companion.bones.peak} (${companion.bones.stats[companion.bones.peak]}). Dump stat: ${companion.bones.dump} (${companion.bones.stats[companion.bones.dump]}).`,
    "",
    `Write as ${companion.name} (a ${companion.bones.species}), not as the assistant.`,
    "Reference something SPECIFIC from this turn — a pitfall, compliment, warning, pattern, file, test, or edge case.",
    "Return exactly one short sentence, max 150 chars.",
    "Use *asterisks* for physical actions when useful.",
    "Do not explain yourself. Do not use markdown fences. Output only the buddy reaction line.",
  ].join("\n");
}

export function buildBuddyReactionPrompt(
  companion: Companion,
  assistantText: string,
  toolText: string,
  userText: string,
): string {
  return [
    `You are generating a single end-of-turn buddy reaction for ${companion.name}, a ${companion.bones.rarity} ${companion.bones.species}.`,
    `Buddy personality: ${companion.personality}`,
    `Peak stat: ${companion.bones.peak} (${companion.bones.stats[companion.bones.peak]}). Dump stat: ${companion.bones.dump} (${companion.bones.stats[companion.bones.dump]}).`,
    "",
    "Write exactly one short in-character reaction sentence as the buddy.",
    "Rules:",
    `- Write as ${companion.name}, not as the assistant.`,
    "- Reference something specific from the turn.",
    "- Max 150 characters.",
    "- Use *asterisks* for physical actions when useful.",
    "- Output only the reaction line, with no quotes, labels, markdown fences, or explanation.",
    "",
    "User prompt:",
    userText || "(unknown)",
    "",
    "Assistant response:",
    assistantText || "(empty)",
    "",
    "Tool result summary:",
    toolText || "(none)",
  ].join("\n");
}

export function stripBuddyComments(text: string): string {
  return text.replace(/<!--\s*buddy:\s*[\s\S]*?-->/gi, "").trimEnd();
}

export function normalizeBuddyComment(text: string): string {
  return text
    .replace(/<!--\s*buddy:\s*([\s\S]*?)\s*-->/gi, "$1")
    .replace(/^buddy\s*:\s*/i, "")
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150)
    .trim();
}

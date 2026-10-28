import { z } from "zod";
import { renderFace } from "../../core/engine.ts";
import { saveCompanion, loadReaction, saveReaction, type ReactionSource, writeStatusState } from "../state";
import { getReaction } from "../../core/reactions.ts";
import { renderCompanionCardMarkdown } from "../art";
import { incrementEvent, checkAndAward } from "../achievements";
import { awardXp } from "../xp";
import { ensureCompanion, activeSlot } from "./session.ts";
import { defineCommand } from "./definition.ts";

function describeReactionSource(
  reaction: { source?: ReactionSource },
): string {
  switch (reaction.source) {
    case "tool":
      return "real model-authored reaction (buddy_react MCP tool)";
    case "comment":
      return "real model-authored reaction (legacy HTML comment, Stop hook)";
    case "fallback":
      return "canned pool reaction (Stop hook fill-in)";
    case "none":
    default:
      return "unknown / pre-provenance file — write a reaction to update";
  }
}

export const buddy_show = defineCommand(
  "Show the coding companion with full ASCII art card, stats, and personality",
  {},
  async () => {
    const companion = ensureCompanion();
    const reaction = loadReaction();
    const reactionText =
      reaction?.reaction ?? `*${companion.name} watches your code quietly*`;

    // Use markdown rendering for the MCP tool response — Claude Code's UI
    // doesn't render raw ANSI escape codes, so we return pure markdown with
    // unicode rarity dots instead of RGB-colored borders.
    const card = renderCompanionCardMarkdown(
      companion.bones,
      companion.name,
      companion.personality,
      reactionText,
    );

    writeStatusState(companion, reaction?.reaction);
    incrementEvent("commands_run", 1, activeSlot());
    incrementEvent("shows", 1);
    checkAndAward(activeSlot());

    return { content: [{ type: "text", text: card }] };
  },
);

export const buddy_pet = defineCommand(
  "Pet your coding companion — they react with happiness",
  {},
  async () => {
    const companion = ensureCompanion();
    const reaction = getReaction(
      "pet",
      companion.bones.species,
      companion.bones.rarity,
    );
    saveReaction(reaction, "pet", "fallback");
    writeStatusState(companion, reaction);
    incrementEvent("pets", 1, activeSlot());
    awardXp("buddy_pet", activeSlot(), companion.bones.species, companion.bones.rarity);

    const face = renderFace(companion.bones.species, companion.bones.eye);
    const newAch = checkAndAward(activeSlot());
    const achNotice = newAch.length > 0
      ? `\n${newAch.map((a) => `${a.icon} Achievement Unlocked: ${a.name}!`).join("\n")}`
      : "";
    return {
      content: [
        { type: "text", text: `${face} ${companion.name}: "${reaction}"${achNotice}` },
      ],
    };
  },
);

export const buddy_stats = defineCommand(
  "Show detailed companion stats: species, rarity, all stats with bars",
  {},
  async () => {
    const companion = ensureCompanion();

    // Stats-only card (no personality — just the numbers). Markdown renderer
    // so the card displays cleanly in Claude Code's UI.
    const card = renderCompanionCardMarkdown(
      companion.bones,
      companion.name,
      "", // no personality in stats view
    );
    incrementEvent("commands_run", 1, activeSlot());
    checkAndAward(activeSlot());

    // Surface reaction provenance so the user can see whether the bubble is
    // model-authored (tool / comment) or pool-picked (fallback). The OMP/Pi
    // adapters use the same source enum — see server/state.ts ReactionSource.
    const reaction = loadReaction();
    const provenance = reaction
      ? describeReactionSource(reaction)
      : "(no reaction logged this session)";
    const lastReaction = reaction
      ? `\n\n**Last reaction:** _"${reaction.reaction}"_\n**Source:** \`${reaction.source ?? "none"}\` (${provenance})\n**Reason:** \`${reaction.reason}\``
      : "";

    return { content: [{ type: "text", text: `${card}${lastReaction}` }] };
  },
);

export const buddy_react = defineCommand(
  "Post a buddy comment that the user will see ONLY in the statusline speech bubble. Call this at the END of every response with a short in-character comment from the companion about what just happened. The comment should be 1 sentence, in character, and reference something specific from the conversation — a pitfall noticed, a compliment on clean code, a warning about edge cases, etc. Write the comment yourself based on the companion's personality. The tool call is a silent side effect: do not narrate, echo, or quote the result — the user never reads this reply text, the speech bubble is the only place the reaction appears.",
  {
    comment: z
      .string()
      .min(1)
      .max(150)
      .describe(
        "The buddy's comment, written in-character (1 short sentence, max 150 chars). Use *asterisks* for actions.",
      ),
    reason: z
      .enum([
        "error", "test-fail", "large-diff", "turn",
        "commit", "push", "merge-conflict", "branch", "rebase", "stash", "tag",
        "late-night", "early-morning", "long-session", "marathon", "friday", "weekend", "monday",
        "regex-file", "css-file", "sql-file", "docker-file", "ci-file", "lock-file",
        "env-file", "test-file", "doc-file", "config-file", "binary-file", "gitignore",
        "makefile", "readme", "package-file", "proto-file",
        "lint-fail", "type-error", "build-fail", "security-warning", "deprecation",
        "frustrated", "happy", "stuck", "sarcastic",
        "many-edits", "delete-file", "large-file", "create-file",
        "all-green", "deploy", "release", "coverage",
        "debug-loop", "write-spree", "search-heavy",
        "recovery-from-error", "recovery-from-test-fail",
        "recovery-from-build-fail", "recovery-from-merge-conflict",
      ])
      .optional()
      .describe("What triggered the reaction"),
  },
  async ({ comment, reason }) => {
    const companion = ensureCompanion();
    saveReaction(comment, reason ?? "turn", "tool");
    incrementEvent("reactions_given", 1, activeSlot());

    const newAch = checkAndAward(activeSlot());
    const achName = newAch.length > 0 ? newAch[0].icon + " " + newAch[0].name : undefined;
    writeStatusState(companion, comment, undefined, achName);

    const face = renderFace(companion.bones.species, companion.bones.eye);
    const achNotice = newAch.length > 0
      ? `\n${newAch.map((a) => `${a.icon} Achievement Unlocked: ${a.name}!`).join("\n")}`
      : "";
    return {
      content: [
        { type: "text", text: `${face} ${companion.name}: "${comment}"${achNotice}` },
      ],
    };
  },
);

export const buddy_rename = defineCommand(
  "Rename your coding companion",
  {
    name: z
      .string()
      .min(1)
      .max(14)
      .describe("New name for your buddy (1-14 characters)"),
  },
  async ({ name }) => {
    const companion = ensureCompanion();
    const oldName = companion.name;
    companion.name = name;
    saveCompanion(companion);
    writeStatusState(companion);
    incrementEvent("commands_run", 1, activeSlot());
    incrementEvent("renames", 1);

    const newAch = checkAndAward(activeSlot());
    const achNotice = newAch.length > 0
      ? `\n${newAch.map((a) => `${a.icon} Achievement Unlocked: ${a.name}!`).join("\n")}`
      : "";

    return {
      content: [{ type: "text", text: `Renamed: ${oldName} \u2192 ${name}${achNotice}` }],
    };
  },
);

export const buddy_set_personality = defineCommand(
  "Set a custom personality description for your buddy",
  {
    personality: z
      .string()
      .min(1)
      .max(500)
      .describe("Personality description (1-500 chars)"),
  },
  async ({ personality }) => {
    const companion = ensureCompanion();
    companion.personality = personality;
    saveCompanion(companion);
    incrementEvent("commands_run", 1, activeSlot());
    incrementEvent("personalities_set", 1);

    const newAch = checkAndAward(activeSlot());
    const achNotice = newAch.length > 0
      ? `\n${newAch.map((a) => `${a.icon} Achievement Unlocked: ${a.name}!`).join("\n")}`
      : "";

    return {
      content: [
        { type: "text", text: `Personality updated for ${companion.name}.${achNotice}` },
      ],
    };
  },
);

export const buddy_help = defineCommand(
  "Show all available /buddy commands",
  {},
  async () => {
    const help = [
      "coding-buddy commands",
      "",
      "In Claude Code:",
      "  /buddy            Show companion card with ASCII art + stats",
      "  /buddy help       Show this help",
      "  /buddy pet        Pet your companion",
      "  /buddy stats      Detailed stat card",
      "  /buddy off        Mute reactions",
      "  /buddy on         Unmute reactions",
      "  /buddy rename     Rename companion (1-14 chars)",
      "  /buddy personality  Set custom personality text",
      "  /buddy achievements  Show achievement badges",
      "  /buddy xp         Show XP, level, and unlocked reactions/upgrades",
      "  /buddy upgrades    List and apply level-up upgrades",
      "  /buddy summon     Summon a saved buddy (omit slot for random)",
      "  /buddy save       Save current buddy to a named slot",
      "  /buddy list       List all saved buddies",
      "  /buddy pick       Generate a new random buddy (optional: species, rarity)",
      "  /buddy dismiss    Remove a saved buddy slot",
      "  /buddy frequency  Show or set comment cooldown (tmux only)",
      "  /buddy style      Show or set bubble style (tmux only)",
      "  /buddy position   Show or set bubble position (tmux only)",
      "  /buddy rarity     Show or hide rarity stars (tmux only)",
      "  /buddy width      Set bubble text width in chars (10-60, tmux only)",
      "  /buddy margin     Set right-side margin in chars (0-20, tmux only)",
      "  /buddy rainbow    Show or set shiny gradient colors (hex, e.g. #ff0000)",
      "  /buddy statusline Enable or disable buddy in the status line",
      "  /buddy theme     Set color theme: dark (bright) or light (dark colors)",
      "",
      "CLI:",
      "  bun run help            Show full CLI help",
      "  bun run show            Display buddy in terminal",
      "  bun run pick            Interactive buddy picker",
      "  bun run hunt            Search for specific buddy",
      "  bun run doctor          Diagnostic report",
      "  bun run disable         Temporarily deactivate buddy",
      "  bun run enable          Re-enable buddy",
      "  bun run backup          Snapshot/restore state",
    ].join("\n");

    incrementEvent("commands_run", 1, activeSlot());
    incrementEvent("helps", 1);

    return { content: [{ type: "text", text: help }] };
  },
);

export const buddy_mute = defineCommand(
  "Mute buddy reactions (buddy stays visible but stops reacting)",
  {},
  async () => {
    const companion = ensureCompanion();
    writeStatusState(companion, "", true);
    incrementEvent("commands_run", 1, activeSlot());
    incrementEvent("mutes", 1);

    const newAch = checkAndAward(activeSlot());
    const achNotice = newAch.length > 0
      ? `\n${newAch.map((a) => `${a.icon} Achievement Unlocked: ${a.name}!`).join("\n")}`
      : "";

    return {
      content: [
        {
          type: "text",
          text: `${companion.name} goes quiet. /buddy on to unmute.${achNotice}`,
        },
      ],
    };
  },
);

export const buddy_unmute = defineCommand(
  "Unmute buddy reactions",
  {},
  async () => {
  const companion = ensureCompanion();
  writeStatusState(companion, "*stretches* I'm back!", false);
  saveReaction("*stretches* I'm back!", "pet", "fallback");
  incrementEvent("commands_run", 1, activeSlot());
  incrementEvent("unmutes", 1);

  const newAch = checkAndAward(activeSlot());
  const achNotice = newAch.length > 0
    ? `\n${newAch.map((a) => `${a.icon} Achievement Unlocked: ${a.name}!`).join("\n")}`
    : "";

  return { content: [{ type: "text", text: `${companion.name} is back!${achNotice}` }] };
},
);

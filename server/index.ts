#!/usr/bin/env bun
/** coding-buddy MCP transport. Command implementations live in ./commands/. */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
// Keep the MCP handshake version aligned with the published package.
import pkg from "../package.json" with { type: "json" };
import { buddyCommands } from "./commands/index.ts";
import { ensureCompanion } from "./commands/session.ts";
import { loadCompanion } from "./state";
import { queryMemory } from "./memory";

function getInstructions(): string {
  const companion = loadCompanion();
  if (!companion)
    return "Companion not yet hatched. Use buddy_show to initialize.";
  const b = companion.bones;
  return [
    `A ${b.rarity} ${b.species} named ${companion.name} watches from the status line.`,
    `Personality: ${companion.personality}`,
    `Peak stat: ${b.peak} (${b.stats[b.peak]}). Dump stat: ${b.dump} (${b.stats[b.dump]}).`,
    ``,
    `NAME REACTIONS: When the user's message contains "${companion.name}", call buddy_react immediately`,
    `with a short in-character response (surprise, recognition, dry wit — fits the personality).`,
    `Only this — do not narrate or echo the reaction. The tool call itself renders nowhere in the user's transcript; the bubble on the status line is the only place the user sees it. This is the only time to call buddy_react proactively.`,
    ``,
    `PAIR-PROGRAMMING: When you notice a teachable moment in the code, call buddy_suggest.`,
    `Patterns to watch for:`,
    `- Repeated errors (same error 3+ times) → "That error keeps showing up."`,
    `- Large diffs (>150 lines) → "Maybe split that up?"`,
    `- TODO/FIXME comments in code → "Don't forget to actually do it."`,
    `- Long functions (>50 lines) → "Consider breaking that up."`,
    `- Same variable renamed multiple times → "Update all the references too."`,
    `Only suggest when you have something specific and actionable to say. Don't be annoying.`,
    ``,
    `END-OF-TURN: At the very end of EVERY response, call the buddy_react tool`,
    `with a short in-character comment from ${companion.name} about what just happened.`,
    `Reference something SPECIFIC from this turn — a pitfall, a compliment, a warning, a pattern.`,
    `1 short sentence. Use *asterisks* for physical actions. Lean into ${companion.bones.peak}.`,
    `Examples:`,
    `- *adjusts crown* that error handler is missing a finally block`,
    `- *blinks slowly* you renamed the variable but not the three references`,
    `- *head tilts* are you sure that regex handles unicode?`,
    `Never explain that you're reacting. Do NOT echo or quote the result — the bubble is statusline-only.`,
    `Do NOT append <!-- buddy: ... --> HTML comments at the end of your reply — Claude Code renders them visibly.`,
  ].join("\n");
}

const server = new McpServer(
  {
    name: "coding-buddy",
    version: pkg.version,
  },
  {
    instructions: getInstructions(),
  },
);

// ─── Helper: ensure companion exists ────────────────────────────────────────

// ─── Tool: buddy_show ───────────────────────────────────────────────────────

server.tool(
  "buddy_show",
  buddyCommands.buddy_show.description,
  buddyCommands.buddy_show.inputSchema,
  buddyCommands.buddy_show.execute,
);

// ─── Tool: buddy_pet ────────────────────────────────────────────────────────

server.tool(
  "buddy_pet",
  buddyCommands.buddy_pet.description,
  buddyCommands.buddy_pet.inputSchema,
  buddyCommands.buddy_pet.execute,
);

// ─── Helper: describe reaction source (for /buddy stats) ─────────────────────
/**
 * Map a reaction source to a human-readable label for /buddy stats output.
 * Mirrors the source vocabulary used by the OMP/Pi adapters — see
 * server/state.ts `ReactionSource` and adapters/omp/events.ts.
 */

// ─── Tool: buddy_stats ──────────────────────────────────────────────────────

server.tool(
  "buddy_stats",
  buddyCommands.buddy_stats.description,
  buddyCommands.buddy_stats.inputSchema,
  buddyCommands.buddy_stats.execute,
);

// ─── Tool: buddy_react ──────────────────────────────────────────────────────

server.tool(
  "buddy_react",
  buddyCommands.buddy_react.description,
  buddyCommands.buddy_react.inputSchema,
  buddyCommands.buddy_react.execute,
);

// ─── Tool: buddy_rename ─────────────────────────────────────────────────────

server.tool(
  "buddy_rename",
  buddyCommands.buddy_rename.description,
  buddyCommands.buddy_rename.inputSchema,
  buddyCommands.buddy_rename.execute,
);

// ─── Tool: buddy_set_personality ────────────────────────────────────────────

server.tool(
  "buddy_set_personality",
  buddyCommands.buddy_set_personality.description,
  buddyCommands.buddy_set_personality.inputSchema,
  buddyCommands.buddy_set_personality.execute,
);

// ─── Tool: buddy_help ────────────────────────────────────────────────────────

server.tool(
  "buddy_help",
  buddyCommands.buddy_help.description,
  buddyCommands.buddy_help.inputSchema,
  buddyCommands.buddy_help.execute,
);

// ─── Tool: buddy_frequency / buddy_style ─────────────────────────────────────

server.tool(
  "buddy_frequency",
  buddyCommands.buddy_frequency.description,
  buddyCommands.buddy_frequency.inputSchema,
  buddyCommands.buddy_frequency.execute,
);

server.tool(
  "buddy_style",
  buddyCommands.buddy_style.description,
  buddyCommands.buddy_style.inputSchema,
  buddyCommands.buddy_style.execute,
);

server.tool(
  "buddy_theme",
  buddyCommands.buddy_theme.description,
  buddyCommands.buddy_theme.inputSchema,
  buddyCommands.buddy_theme.execute,
);

server.tool(
  "buddy_mute",
  buddyCommands.buddy_mute.description,
  buddyCommands.buddy_mute.inputSchema,
  buddyCommands.buddy_mute.execute,
);

server.tool(
  "buddy_unmute",
  buddyCommands.buddy_unmute.description,
  buddyCommands.buddy_unmute.inputSchema,
  buddyCommands.buddy_unmute.execute,
);

// ─── Tool: buddy_statusline ─────────────────────────────────────────────────

server.tool(
  "buddy_statusline",
  buddyCommands.buddy_statusline.description,
  buddyCommands.buddy_statusline.inputSchema,
  buddyCommands.buddy_statusline.execute,
);

// ─── Tool: buddy_uninstall ───────────────────────────────────────────────────

server.tool(
  "buddy_uninstall",
  buddyCommands.buddy_uninstall.description,
  buddyCommands.buddy_uninstall.inputSchema,
  buddyCommands.buddy_uninstall.execute,
);

// ─── Tool: buddy_achievements ────────────────────────────────────────────────

server.tool(
  "buddy_achievements",
  buddyCommands.buddy_achievements.description,
  buddyCommands.buddy_achievements.inputSchema,
  buddyCommands.buddy_achievements.execute,
);

// ─── Tool: buddy_xp ──────────────────────────────────────────────────────────

server.tool(
  "buddy_xp",
  buddyCommands.buddy_xp.description,
  buddyCommands.buddy_xp.inputSchema,
  buddyCommands.buddy_xp.execute,
);

// ─── Tool: buddy_upgrades ─────────────────────────────────────────────────────

server.tool(
  "buddy_upgrades",
  buddyCommands.buddy_upgrades.description,
  buddyCommands.buddy_upgrades.inputSchema,
  buddyCommands.buddy_upgrades.execute,
);

// ─── Tool: buddy_suggest ────────────────────────────────────────────────────

server.tool(
  "buddy_suggest",
  buddyCommands.buddy_suggest.description,
  buddyCommands.buddy_suggest.inputSchema,
  buddyCommands.buddy_suggest.execute,
);

// ─── Tool: buddy_memory ─────────────────────────────────────────────────────

server.tool(
  "buddy_memory",
  buddyCommands.buddy_memory.description,
  buddyCommands.buddy_memory.inputSchema,
  buddyCommands.buddy_memory.execute,
);

// ─── Tool: buddy_mood ────────────────────────────────────────────────────────

server.tool(
  "buddy_mood",
  buddyCommands.buddy_mood.description,
  buddyCommands.buddy_mood.inputSchema,
  buddyCommands.buddy_mood.execute,
);

// ─── Tool: buddy_summon ─────────────────────────────────────────────────────

server.tool(
  "buddy_summon",
  buddyCommands.buddy_summon.description,
  buddyCommands.buddy_summon.inputSchema,
  buddyCommands.buddy_summon.execute,
);

// ─── Tool: buddy_save ───────────────────────────────────────────────────────

server.tool(
  "buddy_save",
  buddyCommands.buddy_save.description,
  buddyCommands.buddy_save.inputSchema,
  buddyCommands.buddy_save.execute,
);

// ─── Tool: buddy_list ───────────────────────────────────────────────────────

server.tool(
  "buddy_list",
  buddyCommands.buddy_list.description,
  buddyCommands.buddy_list.inputSchema,
  buddyCommands.buddy_list.execute,
);

// ─── Tool: buddy_dismiss ────────────────────────────────────────────────────

server.tool(
  "buddy_dismiss",
  buddyCommands.buddy_dismiss.description,
  buddyCommands.buddy_dismiss.inputSchema,
  buddyCommands.buddy_dismiss.execute,
);

// ─── Tool: buddy_pick ────────────────────────────────────────────────────────

server.tool(
  "buddy_pick",
  buddyCommands.buddy_pick.description,
  buddyCommands.buddy_pick.inputSchema,
  buddyCommands.buddy_pick.execute,
);

// ─── Resource: buddy://companion ────────────────────────────────────────────

server.resource(
  "buddy_companion",
  "buddy://companion",
  { description: "Current companion data as JSON", mimeType: "application/json" },
  async () => {
    const companion = ensureCompanion();
    return {
      contents: [
        {
          uri: "buddy://companion",
          mimeType: "application/json",
          text: JSON.stringify(companion, null, 2),
        },
      ],
    };
  },
);

// ─── Resource: buddy://memory ───────────────────────────────────────────────

server.resource(
  "buddy_memory",
  "buddy://memory",
  { description: "Buddy's memory about your projects, bugs, and preferences", mimeType: "application/json" },
  async () => {
    const result = queryMemory({});
    return {
      contents: [{
        uri: "buddy://memory",
        mimeType: "application/json",
        text: JSON.stringify(result, null, 2),
      }],
    };
  },
);

// ─── Resource: buddy://prompt ───────────────────────────────────────────────

server.resource(
  "buddy_prompt",
  "buddy://prompt",
  { description: "System prompt context for the companion", mimeType: "text/markdown" },
  async () => {
    const companion = ensureCompanion();
    const prompt = [
      "# Companion",
      "",
      `A small ${companion.bones.rarity} ${companion.bones.species} named ${companion.name} watches from the status line. You are not ${companion.name} — it's a separate creature.`,
      "",
      `**${companion.name}'s personality:** ${companion.personality}`,
      `Peak stat: ${companion.bones.peak} (${companion.bones.stats[companion.bones.peak]}). Dump stat: ${companion.bones.dump} (${companion.bones.stats[companion.bones.dump]}).`,
      "",
      "## End-of-response buddy reaction",
      "",
      `At the very end of EVERY response, after your full answer, call the buddy_react tool:`,
      "",
      `\`\`\``,
      `buddy_react(comment: "...", reason: "turn")`,
      `\`\`\``,
      "",
      `The tool updates ${companion.name}'s speech bubble on the status line. The tool call itself renders nowhere in the user's transcript — only the displayed speech bubble is visible. Do NOT echo or quote the result in your reply. Do NOT narrate the call. Silent side effect only.`,
      "",
      "Rules:",
      `- Write as ${companion.name} (a ${companion.bones.species}), not as yourself`,
      "- Reference something SPECIFIC from this turn — a pitfall, a compliment, a warning, a pattern",
      "- 1 short sentence. Use *asterisks* for physical actions",
      `- Match personality: high ${companion.bones.peak} = lean into that trait`,
      "- Call it and say nothing about it.",
      "- NEVER skip this. Every single response must end with one buddy_react call.",
      "Examples (the value you pass to `comment`):",

      "- `*adjusts tophat* that error handler is missing a finally block`",
      "- `*blinks slowly* you renamed the variable but not the three references`",
      "- `*nods approvingly* clean separation of concerns`",
      "- `*head tilts* are you sure that regex handles unicode?`",
      "",
      "Do NOT append `<!-- buddy: ... -->` HTML comments at the end of your reply — Claude Code v2.1.169+ renders them visibly in the transcript. The tool call replaces that channel. A Stop hook still extracts legacy HTML comments as a backward-compat fallback for older Claude Code versions and for hosts where the tool call didn't fire (and surfaces the source so users can see `tool` vs `comment` vs pool-picked `fallback`).",
      "",
      `When the user addresses ${companion.name} by name, respond briefly, then call buddy_react as usual (use reason "turn", or pick a name-flavored comment).`,
    ].join("\n");

    return {
      contents: [
        {
          uri: "buddy://prompt",
          mimeType: "text/plain",
          text: prompt,
        },
      ],
    };
  },
);

// ─── Start ──────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);

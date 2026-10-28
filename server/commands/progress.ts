import { z } from "zod";
import { loadCompanion, saveCompanion, loadConfig } from "../state";
import { incrementEvent, checkAndAward, renderAchievementsCardMarkdown } from "../achievements";
import { getXpState, renderXpCardMarkdown, UNLOCKABLE_UPGRADES, isUpgradeUnlocked, applyUpgrade } from "../xp";
import { getMood, MOOD_NAMES, MOOD_COLORS } from "../mood";
import { queryMemory, resolveBug as resolveBugMemory } from "../memory";
import { pickSuggestion } from "../suggestions";
import { ensureCompanion, activeSlot } from "./session.ts";
import { defineCommand } from "./definition.ts";

export const buddy_achievements = defineCommand(
  "Show all achievement badges — earned and locked. Displays a card with progress bar and status for each badge.",
  {},
  async () => {
    ensureCompanion();
    checkAndAward(activeSlot());
    incrementEvent("achievement_views", 1);
    const card = renderAchievementsCardMarkdown();
    return { content: [{ type: "text", text: card }] };
  },
);

export const buddy_xp = defineCommand(
  "Show your companion's XP, level, and unlocked reactions and upgrades.",
  {},
  async () => {
    ensureCompanion();
    const card = renderXpCardMarkdown();
    return { content: [{ type: "text", text: card }] };
  },
);

export const buddy_upgrades = defineCommand(
  "List and apply upgrades unlocked by leveling up. Shows available upgrades, their level requirements, and applies them to your companion.",
  {
    apply: z.string().optional().describe("Upgrade ID to apply (e.g. 'bonus_eye', 'shiny_aura')"),
  },
  async ({ apply }) => {
    ensureCompanion();
    const state = getXpState();

    if (apply) {
      if (!isUpgradeUnlocked(apply)) {
        return {
          content: [
            {
              type: "text",
              text: `Upgrade "${apply}" is not yet unlocked. Reach the required level first.`,
            },
          ],
        };
      }
      const companion = loadCompanion();
      if (!companion) {
        return { content: [{ type: "text", text: "No active companion." }] };
      }
      const updated = applyUpgrade(companion, apply);
      if (updated) {
        saveCompanion(updated);
        const upg = UNLOCKABLE_UPGRADES.find((u) => u.id === apply);
        return {
          content: [
            {
              type: "text",
              text: `${upg?.icon ?? ""} Applied: ${upg?.name}. ${upg?.description ?? ""}`,
            },
          ],
        };
      }
    }

    // No apply specified — list all upgrades with unlock status
    const currentLevel = state.level;
    const lines: string[] = [];
    lines.push(`### Level ${currentLevel} \u2014 Upgrades`);
    lines.push("");
    for (const upg of UNLOCKABLE_UPGRADES) {
      const unlocked = currentLevel >= upg.level;
      const status = unlocked ? "\u2705" : `\u{1F512} Lvl ${upg.level}`;
      lines.push(`${status} ${upg.icon} **${upg.name}**: ${upg.description}`);
    }
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },
);

export const buddy_suggest = defineCommand(
  "Called proactively by the buddy when it detects a teachable moment in your code. Do NOT call this unprompted — the Stop hook handles pattern detection automatically. This tool is only for buddy-initiated suggestions when YOU notice a pattern.",
  {
    pattern: z.enum([
      "repeated_error",
      "escalated_large_diff",
      "new_file_no_test",
      "sequence_rename",
      "no_tests_long_session",
      "long_function",
      "todo_comment",
    ] as const).optional().describe("The pattern type detected"),
    context: z.string().optional().describe("Brief context about what triggered this suggestion"),
  },
  async ({ pattern, context }) => {
    // If no pattern specified, generate a general suggestion
    if (!pattern) {
      const companion = ensureCompanion();
      const generalSuggestions: string[] = [
        "Remember to write tests for new functions.",
        "That error might be a sign of a deeper issue.",
        "Consider breaking up that long function.",
        "Good variable names pay off later.",
      ];
      const msg = generalSuggestions[Math.floor(Math.random() * generalSuggestions.length)];
      return { content: [{ type: "text", text: msg }] };
    }

    const suggestion = pickSuggestion(pattern);
    const message = context ? `${suggestion.message} (${context})` : suggestion.message;
    return { content: [{ type: "text", text: message }] };
  },
);

export const buddy_memory = defineCommand(
  "Query and manage buddy's cross-session memory — remembered projects, bugs, and preferences.",
  {
    project: z.string().optional().describe("Filter by project name"),
    type: z.enum(["projects", "bugs", "preferences", "all"]).optional().describe("Type of memory to query (default: all)"),
    resolved: z.boolean().optional().describe("For bugs: filter by resolved status"),
    resolveBug: z.string().optional().describe("Bug ID to mark as resolved"),
  },
  async ({ project, type, resolved, resolveBug }) => {
    // Handle bug resolution
    if (resolveBug) {
      const bug = resolveBugMemory(resolveBug);
      if (!bug) {
        return { content: [{ type: "text", text: `Bug "${resolveBug}" not found.` }] };
      }
      incrementEvent("bugs_resolved", 1, activeSlot());
      checkAndAward(activeSlot());
      return {
        content: [{
          type: "text",
          text: `Bug marked as resolved: ${bug.summary.slice(0, 100)}`,
        }],
      };
    }

    // Query memory
    const result = queryMemory({ project, type, resolved });
    const lines: string[] = [];

    if (result.projects.length > 0) {
      lines.push("### Projects");
      lines.push("");
      for (const proj of result.projects) {
        lines.push(`**${proj.name}** (${proj.language.join(", ") || "unknown"})`);
        if (proj.framework) lines.push(`  Framework: ${proj.framework}`);
        lines.push(`  Last seen: ${new Date(proj.lastSeen).toLocaleDateString()}`);
        lines.push("");
      }
    }

    if (result.bugs.length > 0) {
      lines.push("### Bugs");
      lines.push("");
      for (const bug of result.bugs) {
        const status = bug.resolved ? "\u2705" : "\u274c";
        lines.push(`${status} **${bug.summary.slice(0, 80)}...**`);
        lines.push(`  Occurrences: ${bug.occurrenceCount} | First seen: ${new Date(bug.firstSeen).toLocaleDateString()}`);
        lines.push(`  ID: \`${bug.id}\``);
        lines.push("");
      }
    }

    if (result.preferences.length > 0) {
      lines.push("### Preferences");
      lines.push("");
      for (const pref of result.preferences) {
        lines.push(`**${pref.key}** = "${pref.value}" (${Math.round(pref.confidence * 100)}% confidence)`);
        lines.push(`  Context: ${pref.context}`);
        lines.push("");
      }
    }

    if (lines.length === 0) {
      lines.push("No memory yet. Start coding and buddy will remember your projects, bugs, and preferences.");
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  },
);

export const buddy_mood = defineCommand(
  "Show your buddy's current mood and what influences it. Mood shifts based on coding events, test results, and time of day.",
  {},
  async () => {
    const moodState = getMood();
    const mood = moodState.current;
    const color = MOOD_COLORS[mood] ?? "\ud83d\udcab";
    const name = MOOD_NAMES[mood] ?? mood;

    const cfg = loadConfig();
    const lines: string[] = [];
    lines.push(`### ${color} ${name}`);
    lines.push("");
    lines.push(`**Current mood:** ${name}`);
    lines.push(`**Intensity:** ${moodState.intensity}/3`);
    lines.push("");

    // Show recent activity that affects mood
    if (moodState.recentErrors > 0) {
      lines.push(`Recent errors: ${moodState.recentErrors}`);
    }
    if (moodState.recentTests > 0) {
      lines.push(`Recent tests passed: ${moodState.recentTests}`);
    }
    if (moodState.recentDiffs > 0) {
      lines.push(`Recent large diffs: ${moodState.recentDiffs}`);
    }

    lines.push("");
    lines.push("Mood shifts based on: tests, errors, session length, and time of day.");
    if (!cfg.moodEnabled) {
      lines.push("\n*(Mood is currently disabled)*");
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  },
);

import { z } from "zod";
import { existsSync } from "fs";
import { join, resolve } from "path";
import { loadConfig, saveConfig, setBuddyStatusLine, unsetBuddyStatusLine, cleanupPluginState } from "../state";
import { buddyStateDir, buddyAppDir, claudeConfigDir, claudeSettingsPath } from "../path";
import { defineCommand } from "./definition.ts";

export const buddy_frequency = defineCommand(
  "Configure how often buddy comments appear in the speech bubble. Returns current settings if called without arguments.",
  {
    cooldown: z.number().int().min(0).max(300).optional().describe("Minimum seconds between displayed comments (default 30, 0 = no throttling). The buddy always writes comments, but the display only updates this often."),
  },
  async ({ cooldown }) => {
    if (cooldown === undefined) {
      const cfg = loadConfig();
      return {
        content: [
          {
            type: "text",
            text: `Comment cooldown: ${cfg.commentCooldown}s between displayed comments.\nUse /buddy frequency <seconds> to change.`,
          },
        ],
      };
    }
    const cfg = saveConfig({ commentCooldown: cooldown });
    return {
      content: [
        {
          type: "text",
          text: `Updated: ${cfg.commentCooldown}s cooldown between displayed comments.`,
        },
      ],
    };
  },
);

export const buddy_style = defineCommand(
  "Configure the buddy bubble appearance. Returns current settings if called without arguments.",
  {
    style: z
      .enum(["classic", "round"])
      .optional()
      .describe(
        "Bubble border style: classic (pipes/dashes like status line) or round (parens/tildes)",
      ),
    position: z
      .enum(["top", "left"])
      .optional()
      .describe(
        "Bubble position relative to buddy: top (above) or left (beside)",
      ),
    showRarity: z
      .boolean()
      .optional()
      .describe("Show or hide the stars + rarity line in the status line"),
    width: z
      .number()
      .int()
      .min(10)
      .max(60)
      .optional()
      .describe("Bubble inner text width in characters (10–60, default 28)"),
    margin: z
      .number()
      .int()
      .min(0)
      .max(20)
      .optional()
      .describe("Right-side margin between buddy and terminal edge (0–20, default 3)"),
    rainbow: z
      .array(z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #ff0000"))
      .max(16)
      .optional()
      .describe(
        "Custom rainbow gradient for shiny buddies — array of 1–16 hex colors (e.g. [\"#ff0000\",\"#00ff00\"]). Pass [] to reset to default ROYGBIV.",
      ),
  },
  async ({ style, position, showRarity, width, margin, rainbow }) => {
    if (
      style === undefined &&
      position === undefined &&
      showRarity === undefined &&
      width === undefined &&
      margin === undefined &&
      rainbow === undefined
    ) {
      const cfg = loadConfig();
      const rainbowDisplay = cfg.rainbowColors
        ? cfg.rainbowColors.join(", ")
        : "default (ROYGBIV)";
      return {
        content: [
          {
            type: "text",
            text: `Bubble style: ${cfg.bubbleStyle}\nBubble position: ${cfg.bubblePosition}\nShow rarity: ${cfg.showRarity}\nBubble width: ${cfg.bubbleWidth}\nBubble margin: ${cfg.bubbleMargin}\nShiny rainbow: ${rainbowDisplay}\nUse /buddy style <classic|round>, /buddy position <top|left>, /buddy rarity <on|off>, /buddy width <10-60>, /buddy margin <0-20>, /buddy rainbow [<#hex>...] to change.`,
          },
        ],
      };
    }
    const updates: Partial<import("../state.ts").BuddyConfig> = {};
    if (style !== undefined) updates.bubbleStyle = style;
    if (position !== undefined) updates.bubblePosition = position;
    if (showRarity !== undefined) updates.showRarity = showRarity;
    if (width !== undefined) updates.bubbleWidth = width;
    if (margin !== undefined) updates.bubbleMargin = margin;
    if (rainbow !== undefined) updates.rainbowColors = rainbow.length > 0 ? rainbow : undefined;
    const cfg = saveConfig(updates);
    const rainbowDisplay = cfg.rainbowColors
      ? cfg.rainbowColors.join(", ")
      : "default (ROYGBIV)";
    return {
      content: [
        {
          type: "text",
          text: `Updated: style=${cfg.bubbleStyle}, position=${cfg.bubblePosition}, showRarity=${cfg.showRarity}, width=${cfg.bubbleWidth}, margin=${cfg.bubbleMargin}, rainbow=${rainbowDisplay}\nRestart Claude Code for changes to take effect.`,
        },
      ],
    };
  },
);

export const buddy_theme = defineCommand(
  "Set buddy's color theme. dark = bright colors for dark terminal backgrounds; light = dark colors for light backgrounds; auto = follow system (currently falls back to dark).",
  {
    theme: z
      .enum(["dark", "light", "auto"])
      .optional()
      .describe("Theme: dark, light, or auto"),
  },
  async ({ theme }) => {
    if (theme === undefined) {
      const cfg = loadConfig();
      return {
        content: [
          {
            type: "text",
            text: `Theme: ${cfg.theme ?? "auto"}\nUse /buddy theme <dark|light|auto> to change.`,
          },
        ],
      };
    }
    const cfg = saveConfig({ theme });
    return {
      content: [
        {
          type: "text",
          text: `Theme set to ${cfg.theme}. Restart Claude Code to apply.`,
        },
      ],
    };
  },
);

export const buddy_statusline = defineCommand(
  "Enable or disable the buddy status line, toggle combined mode (shows rate-limit usage bars alongside the buddy), or set a cached asynchronous sub-status command. Returns current status if called without arguments.",
  {
    enabled: z
      .boolean()
      .optional()
      .describe(
        "true to enable, false to disable. Omit to show current status.",
      ),
    combined: z
      .boolean()
      .optional()
      .describe(
        "true to show rate-limit usage bars alongside buddy (requires python3), false for buddy-only mode.",
      ),
    subStatusCommand: z
      .string()
      .optional()
      .describe(
        "Shell command whose cached output is appended below the buddy panel. Empty string clears it; the command always runs asynchronously.",
      ),
  },
  async ({ enabled, combined, subStatusCommand }) => {
    if (enabled === undefined && combined === undefined && subStatusCommand === undefined) {
      const cfg = loadConfig();
      const state = cfg.statusLineEnabled ? "enabled" : "disabled";
      const mode = cfg.useCombinedStatus ? "combined (with rate-limit bars)" : "basic (buddy only)";
      const subStatus = cfg.subStatusCommand ?? "unset";
      return {
        content: [
          {
            type: "text",
            text: `Status line: ${state}\nMode: ${mode}\nSub-status command: ${subStatus}\nUse /buddy statusline on|off to toggle, /buddy statusline combined to add rate-limit bars, or set subStatusCommand to append cached command output.\nRestart Claude Code after changes for them to take effect.`,
          },
        ],
      };
    }

    if (combined !== undefined) {
      saveConfig({ useCombinedStatus: combined });
    }

    if (subStatusCommand !== undefined) {
      saveConfig({ subStatusCommand: subStatusCommand.trim() ? subStatusCommand : undefined });
    }

    if (enabled !== undefined) {
      saveConfig({ statusLineEnabled: enabled });
    }

    const cfg = loadConfig();

    if (cfg.statusLineEnabled) {
      const installedRoot = buddyAppDir();
      const pluginRoot = existsSync(join(installedRoot, "statusline", "buddy-status.sh"))
        ? installedRoot
        : resolve(import.meta.dir, "../..");
      const scriptName = cfg.useCombinedStatus ? "combined-status.sh" : "buddy-status.sh";
      const statusScript = join(pluginRoot, "statusline", scriptName);
      setBuddyStatusLine(statusScript);
      return {
        content: [
          {
            type: "text",
            text:
              `Status line enabled (${cfg.useCombinedStatus ? "combined" : "basic"} mode)! Restart Claude Code to apply.\n\n` +
              `Note: this writes an entry to ${claudeSettingsPath()} that \`claude plugin uninstall\` does not remove. ` +
              "Run `/buddy uninstall` before uninstalling the plugin to clean it up.",
          },
        ],
      };
    } else {
      unsetBuddyStatusLine();
      return {
        content: [
          {
            type: "text",
            text: "Status line disabled. Restart Claude Code to apply.",
          },
        ],
      };
    }
  },
);

export const buddy_uninstall = defineCommand(
  "Clean up coding-buddy's writes to Claude Code's settings.json and transient session files in the buddy state dir (resolved via CLAUDE_CONFIG_DIR), in preparation for `claude plugin uninstall`. Companion data (menagerie, status, config) is intentionally preserved so reinstalling restores the buddy. The tool only cleans the plugin's own settings — it never removes a foreign statusLine.",
  {},
  async () => {
    const result = cleanupPluginState();

    const settingsPath = claudeSettingsPath();
    const stateDir = buddyStateDir();
    const pluginsCacheDir = join(claudeConfigDir(), "plugins", "cache", "coding-buddy");

    const lines: string[] = [];
    lines.push("coding-buddy: settings.json cleanup complete.");
    lines.push("");
    lines.push(
      result.statusLineRemoved
        ? `  \u2713 statusLine entry removed from ${settingsPath}`
        : "  \u2014 no buddy statusLine was present (nothing to remove)",
    );
    if (result.foreignStatusLineKept) {
      lines.push(
        "  \u2713 a non-buddy statusLine was detected and left untouched",
      );
    }
    lines.push(
      `  \u2713 ${result.transientFilesRemoved} transient session file(s) removed from ${stateDir}`,
    );
    lines.push(`  \u2014 companion data at ${stateDir} preserved`);
    lines.push("");
    lines.push("Now run these commands via the Bash tool, in order:");
    lines.push("");
    lines.push("  claude plugin uninstall coding-buddy@coding-buddy");
    lines.push("  claude plugin marketplace remove coding-buddy");
    lines.push(`  rm -rf ${pluginsCacheDir}`);
    lines.push("");
    lines.push(
      "After those three commands the plugin is fully removed. Restart Claude Code to apply.",
    );

    return { content: [{ type: "text", text: lines.join("\n") }] };
  },
);

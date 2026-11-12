#!/usr/bin/env bun
/**
 * cli/tui.tsx — fullscreen 3-pane dashboard for coding-buddy (Ink/React)
 *
 * Layout: persistent sidebar | content list | detail preview
 * The sidebar is always visible. Selecting a section opens the
 * middle + right panes for that section's content.
 *
 * Usage:  bun run tui
 */

import React, { useState } from "react";
import { render, Box, Text, useInput, useApp, useStdout } from "ink";
import {
  readFileSync, existsSync, readdirSync, statSync,
  mkdirSync, writeFileSync, copyFileSync, rmSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { join, resolve, dirname } from "node:path";
import {
  buddyStateDir,
  claudeConfigDir,
  claudeSettingsPath,
  claudeSkillDir,
  claudeUserConfigPath,
} from "../server/path.ts";
import {
  listCompanionSlots, loadActiveSlot, saveActiveSlot,
  loadConfig, saveConfig, writeStatusState, loadReaction,
  resolveUserId, saveCompanionSlot, updateCompanionSlot, slugify, unusedName,
  setBuddyStatusLine, unsetBuddyStatusLine,
  type BuddyConfig,
} from "../server/state.ts";
import {
  RARITY_STARS, STAT_NAMES, SPECIES, RARITIES, generateBones, searchBuddy,
  type Companion, type StatName, type Species, type Rarity,
  type SearchCriteria, type SearchResult, type BuddyBones,
} from "../core/engine.ts";
import { getArtFrame, HAT_ART } from "../server/art.ts";
import {
  ACHIEVEMENTS, loadUnlocked, loadEvents,
  type Achievement, type UnlockedAchievement, type EventCounters,
} from "../server/achievements.ts";

// ─── Types ──────────────────────────────────────────────────────────────────

type Section = "menagerie" | "settings" | "achievements" | "hunt" | "verify" | "doctor" | "backup" | "system";
type Focus = "sidebar" | "list" | "edit";
interface SlotEntry { slot: string; companion: Companion }

const RARITY_COLOR: Record<string, string> = {
  common: "gray", uncommon: "green", rare: "blue",
  epic: "magenta", legendary: "yellow",
};


const CLAUDE_DIR = claudeConfigDir();
const CLAUDE_JSON = claudeUserConfigPath();
const STATE_DIR = buddyStateDir();
const SETTINGS_PATH = claudeSettingsPath();
const SKILL_PATH = join(claudeSkillDir("buddy"), "SKILL.md");
const PROJECT_ROOT = resolve(dirname(import.meta.dir));

// ─── Sidebar ────────────────────────────────────────────────────────────────

interface SidebarItem {
  key: Section; icon: string; label: string; description: string[];
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  {
    key: "menagerie", icon: "🏠", label: "Pets",
    description: [
      "Browse and manage all your saved buddies.",
      "",
      "Filter by typing, navigate with arrows,",
      "press Enter to summon a buddy as active.",
      "",
      "Use the \"Edit Personality\" button at the",
      "bottom to rewrite a buddy's voice.",
    ],
  },
  {
    key: "settings", icon: "🔧", label: "Config",
    description: [
      "Configure the status line behaviour:",
      "comment cooldown, reaction TTL, bubble",
      "style/position, and rarity visibility.",
      "",
      "Changes are written to config.json and",
      "take effect after restarting Claude Code.",
    ],
  },
  {
    key: "achievements", icon: "🏆", label: "Achievements",
    description: [
      "View all 16 milestone badges you can",
      "unlock with your buddy — pets, coding",
      "streaks, errors witnessed, and more.",
      "",
      "Locked badges show a progress bar;",
      "3 secret ones stay hidden until earned.",
    ],
  },
  {
    key: "hunt", icon: "🎯", label: "Hunt",
    description: [
      "Brute-force search for a specific buddy.",
      "",
      "Choose species, rarity, shiny flag, peak",
      "and dump stats — then start hunting.",
      "",
      "Legendary + shiny may take many minutes.",
      "Pick from results, name and save.",
    ],
  },
  {
    key: "verify", icon: "🔍", label: "Verify",
    description: [
      "Show the deterministic buddy generated",
      "from any user ID — useful for debugging",
      "or exploring what IDs produce.",
      "",
      "Random / Current / Custom hex input.",
    ],
  },
  {
    key: "doctor", icon: "🩺", label: "Doctor",
    description: [
      "Run diagnostic checks on your install:",
      "environment (bun, jq, claude CLI),",
      "filesystem paths, MCP registration,",
      "hooks, status line, and buddy state.",
      "",
      "Green = OK, yellow = warn, red = error.",
    ],
  },
  {
    key: "backup", icon: "💾", label: "Backup",
    description: [
      "Create and browse snapshots of your",
      "coding-buddy state — settings, hooks,",
      "skill, menagerie, status, and config.",
      "",
      "Restore is currently manual (copy from",
      `${STATE_DIR}/backups/<ts>/ folders).`,
    ],
  },
  {
    key: "system", icon: "🚨", label: "System",
    description: [
      "Manage coding-buddy's installation:",
      "",
      "• Re-Enable — runs install-buddy",
      "• Disable  — keeps data, removes MCP",
      "• Uninstall — destructive, requires",
      "  typing UNINSTALL to confirm",
      "",
      "Auto-backup runs before any uninstall.",
    ],
  },
];

function Sidebar({ cursor, section, focus }: {
  cursor: number; section: Section; focus: Focus;
}) {
  const isFocused = focus === "sidebar";
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">{" 🐢 coding-buddy"}</Text>
      <Text>{""}</Text>
      {SIDEBAR_ITEMS.map((item, i) => {
        const isActive = item.key === section && focus !== "sidebar";
        const isCursor = isFocused && i === cursor;
        const borderColor = isCursor ? "cyan" : isActive ? "green" : "gray";
        const borderStyle = isCursor || isActive ? "round" : "single";
        return (
          <Box key={item.key}
            borderStyle={borderStyle as any}
            borderColor={borderColor}
            paddingX={1}
            marginBottom={0}
          >
            <Text bold={isCursor || isActive} color={isCursor ? "cyan" : isActive ? "green" : "white"}>
              {item.icon} {item.label}
            </Text>
          </Box>
        );
      })}
      <Text>{""}</Text>
      <Box
        borderStyle={isFocused && cursor >= SIDEBAR_ITEMS.length ? "round" as any : "single" as any}
        borderColor={isFocused && cursor >= SIDEBAR_ITEMS.length ? "red" : "gray"}
        paddingX={1}
      >
        <Text color={isFocused && cursor >= SIDEBAR_ITEMS.length ? "red" : "gray"}>
          👋 Exit
        </Text>
      </Box>
    </Box>
  );
}

// ─── Middle: Buddy List ─────────────────────────────────────────────────────

function BuddyListPane({ slots, cursor, activeSlot, focused, searchTerm }: {
  slots: SlotEntry[]; cursor: number; activeSlot: string; focused: boolean;
  searchTerm: string;
}) {
  const editIdx = slots.length;
  const isEditCursor = focused && cursor === editIdx;
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color={focused ? "cyan" : "gray"}>{" 🏠 Menagerie"}</Text>
      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>🔎 </Text>
        {searchTerm ? (
          <Text bold color="yellow">{searchTerm}</Text>
        ) : (
          <Text dimColor>filter by name, species, rarity…</Text>
        )}
      </Box>
      <Text>{""}</Text>
      {slots.length === 0 ? (
        <Text dimColor>{" "}No buddies match.</Text>
      ) : (
        slots.map(({ slot, companion: c }, i) => {
          const isActive = slot === activeSlot;
          const color = RARITY_COLOR[c.bones.rarity] ?? "white";
          const stars = RARITY_STARS[c.bones.rarity];
          const shiny = c.bones.shiny ? "✨" : "";
          const isCursor = focused && i === cursor;
          return (
            <Box key={slot}
              borderStyle={isCursor ? "round" as any : isActive ? "round" as any : "single" as any}
              borderColor={isCursor ? "cyan" : isActive ? "green" : "gray"}
              paddingX={1}
            >
              <Text color={isActive ? "green" : "gray"}>{isActive ? "● " : "○ "}</Text>
              <Text color={color} bold={isCursor || isActive}>{c.name.padEnd(8)}</Text>
              <Text dimColor>{c.bones.species.padEnd(7)}{stars}{shiny}</Text>
            </Box>
          );
        })
      )}
      {slots.length > 0 ? (
        <>
          <Text>{""}</Text>
          <Box
            borderStyle={isEditCursor ? "round" as any : "single" as any}
            borderColor={isEditCursor ? "magenta" : "gray"}
            paddingX={1}
          >
            <Text bold={isEditCursor} color={isEditCursor ? "magenta" : "gray"}>
              ✏  Edit Personality
            </Text>
          </Box>
        </>
      ) : null}
    </Box>
  );
}

// ─── Middle: Settings List ──────────────────────────────────────────────────

const SETTINGS_ITEMS = [
  { key: "commentCooldown", label: "Comment Cooldown" },
  { key: "reactionTTL", label: "Reaction TTL" },
  { key: "bubbleStyle", label: "Bubble Style" },
  { key: "bubblePosition", label: "Bubble Position" },
  { key: "showRarity", label: "Show Rarity" },
  { key: "statusLineEnabled", label: "Status Line" },
] as const;

function SettingsListPane({ cursor, config, focused }: {
  cursor: number; config: BuddyConfig; focused: boolean;
}) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color={focused ? "cyan" : "gray"}>{" 🔧 Settings"}</Text>
      <Text>{""}</Text>
      {SETTINGS_ITEMS.map((item, i) => {
        const val = String(config[item.key as keyof BuddyConfig]);
        const isCursor = focused && i === cursor;
        return (
          <Box key={item.key}
            borderStyle={isCursor ? "round" as any : "single" as any}
            borderColor={isCursor ? "cyan" : "gray"}
            paddingX={1}
          >
            <Text bold={isCursor} color={isCursor ? "cyan" : "white"}>{item.label.padEnd(16)}</Text>
            <Text color="yellow">{val}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

// ─── Achievements: progress map + panes ─────────────────────────────────────

// Maps each achievement id to the counter key + threshold it tracks.
// Kept here (not in achievements.ts) so the UI can render progress bars
// without baking threshold data into the achievement check functions.
const ACHIEVEMENT_PROGRESS: Record<string, { counter: keyof EventCounters; threshold: number } | null> = {
  first_steps: null,
  good_boy: { counter: "pets", threshold: 10 },
  best_friend: { counter: "pets", threshold: 50 },
  pet_overflow: { counter: "pets", threshold: 100 },
  pet_legend: { counter: "pets", threshold: 250 },
  pet_obsessed: { counter: "pets", threshold: 500 },
  pet_god: { counter: "pets", threshold: 1000 },
  bug_spotter: { counter: "errors_seen", threshold: 1 },
  error_whisperer: { counter: "errors_seen", threshold: 25 },
  battle_scarred: { counter: "errors_seen", threshold: 100 },
  error_titan: { counter: "errors_seen", threshold: 500 },
  error_god: { counter: "errors_seen", threshold: 1000 },
  error_apocalypse: { counter: "errors_seen", threshold: 5000 },
  test_witness: { counter: "tests_failed", threshold: 1 },
  test_veteran: { counter: "tests_failed", threshold: 50 },
  test_survivor: { counter: "tests_failed", threshold: 200 },
  test_masochist: { counter: "tests_failed", threshold: 500 },
  test_immortal: { counter: "tests_failed", threshold: 1000 },
  big_mover: { counter: "large_diffs", threshold: 1 },
  refactor_machine: { counter: "large_diffs", threshold: 10 },
  massive_mover: { counter: "large_diffs", threshold: 25 },
  earth_mover: { counter: "large_diffs", threshold: 50 },
  continental_drift: { counter: "large_diffs", threshold: 100 },
  tectonic_shift: { counter: "large_diffs", threshold: 250 },
  chatterbox: { counter: "reactions_given", threshold: 100 },
  social_butterfly: { counter: "reactions_given", threshold: 250 },
  hypersocial: { counter: "reactions_given", threshold: 500 },
  never_shuts_up: { counter: "reactions_given", threshold: 1000 },
  chatterbox_elite: { counter: "reactions_given", threshold: 2500 },
  no_off_switch: { counter: "reactions_given", threshold: 5000 },
  week_streak: { counter: "days_active", threshold: 7 },
  two_week_streak: { counter: "days_active", threshold: 14 },
  month_streak: { counter: "days_active", threshold: 30 },
  quarter_streak: { counter: "days_active", threshold: 90 },
  hundred_days: { counter: "days_active", threshold: 100 },
  year_streak: { counter: "days_active", threshold: 365 },
  power_user: { counter: "commands_run", threshold: 50 },
  commander: { counter: "commands_run", threshold: 200 },
  command_overlord: { counter: "commands_run", threshold: 500 },
  command_addict: { counter: "commands_run", threshold: 1000 },
  command_deity: { counter: "commands_run", threshold: 2500 },
  dedicated: { counter: "turns", threshold: 200 },
  thousand_turns: { counter: "turns", threshold: 1000 },
  five_thousand_turns: { counter: "turns", threshold: 5000 },
  ten_thousand_turns: { counter: "turns", threshold: 10000 },
  twenty_five_k_turns: { counter: "turns", threshold: 25000 },
  fifty_k_turns: { counter: "turns", threshold: 50000 },
  session_regular: { counter: "sessions", threshold: 10 },
  session_veteran: { counter: "sessions", threshold: 50 },
  session_centurion: { counter: "sessions", threshold: 100 },
  session_addict: { counter: "sessions", threshold: 250 },
  session_machine: { counter: "sessions", threshold: 500 },
  collector: { counter: "buddies_collected", threshold: 3 },
  zookeeper: { counter: "buddies_collected", threshold: 5 },
  menagerie: { counter: "buddies_collected", threshold: 10 },
  buddy_hoarder: { counter: "buddies_collected", threshold: 20 },
  buddy_tycoon: { counter: "buddies_collected", threshold: 50 },
  identity_crisis: { counter: "renames", threshold: 1 },
  name_chameleon: { counter: "renames", threshold: 5 },
  serial_renamer: { counter: "renames", threshold: 10 },
  identity_thief: { counter: "renames", threshold: 25 },
  method_acting: { counter: "personalities_set", threshold: 1 },
  fashionista: { counter: "personalities_set", threshold: 3 },
  personality_crisis: { counter: "personalities_set", threshold: 10 },
  silent_treatment: { counter: "mutes", threshold: 1 },
  prodigal: { counter: "summons", threshold: 1 },
  menagerie_hop: { counter: "summons", threshold: 10 },
  menagerie_hopper: { counter: "summons", threshold: 25 },
  summoner: { counter: "summons", threshold: 50 },
  heartbreaker: { counter: "dismissals", threshold: 1 },
  serial_dumper: { counter: "dismissals", threshold: 5 },
  cold_blooded: { counter: "dismissals", threshold: 10 },
  show_off: { counter: "shows", threshold: 10 },
  exhibitionist: { counter: "shows", threshold: 50 },
  help_me: { counter: "helps", threshold: 1 },
  help_addict: { counter: "helps", threshold: 10 },
  achievement_hunter: { counter: "achievement_views", threshold: 5 },
  achievement_stalker: { counter: "achievement_views", threshold: 25 },
  pack_rat: { counter: "saves", threshold: 1 },
  compulsive_saver: { counter: "saves", threshold: 10 },
  roster_check: { counter: "lists", threshold: 1 },
  roster_obsessed: { counter: "lists", threshold: 10 },
  completionist: { counter: "achievements_unlocked", threshold: ACHIEVEMENTS.length - 1 },
  // Compound checks (multiple counters) — no single-counter progress bar.
  on_off: null,
  indecisive: null,
  troubled: null,
  disaster_zone: null,
  apocalypse_survivor: null,
  well_rounded: null,
  renaissance: null,
  big_and_broken: null,
  collector_and_destroyer: null,
};

function AchievementsListPane({ cursor, unlockedIds, focused, rows }: {
  cursor: number; unlockedIds: Set<string>; focused: boolean; rows: number;
}) {
  const total = ACHIEVEMENTS.length;
  const done = ACHIEVEMENTS.filter(a => unlockedIds.has(a.id)).length;

  // Each bordered row costs ~3 lines; header + indicators + chrome ~8.
  const visibleCount = Math.max(3, Math.min(total, Math.floor((rows - 8) / 3)));
  let start = cursor - Math.floor(visibleCount / 2);
  start = Math.max(0, Math.min(start, total - visibleCount));
  const end = Math.min(total, start + visibleCount);
  const above = start;
  const below = total - end;

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color={focused ? "cyan" : "gray"}>{" 🏆 Achievements"}</Text>
      <Text dimColor>{"  "}{done}/{total} unlocked</Text>
      <Text>{""}</Text>
      {above > 0 ? <Text dimColor>{"  ▲ "}{above}{" more"}</Text> : null}
      {ACHIEVEMENTS.slice(start, end).map((a, i) => {
        const absIdx = start + i;
        const isUnlocked = unlockedIds.has(a.id);
        const isHidden = a.secret && !isUnlocked;
        const isCursor = focused && absIdx === cursor;
        const name = isHidden ? "???" : a.name;
        const icon = isHidden ? "🔒" : a.icon;
        return (
          <Box key={a.id}
            borderStyle={isCursor ? "round" as any : "single" as any}
            borderColor={isCursor ? "cyan" : isUnlocked ? "yellow" : "gray"}
            paddingX={1}
          >
            <Text bold={isCursor} color={isUnlocked ? "yellow" : isHidden ? "gray" : "white"}>
              {icon} {name.padEnd(18)}
            </Text>
            <Text color={isUnlocked ? "green" : "gray"}>{isUnlocked ? "✓" : "·"}</Text>
          </Box>
        );
      })}
      {below > 0 ? <Text dimColor>{"  ▼ "}{below}{" more"}</Text> : null}
    </Box>
  );
}

function AchievementDetailPane({ achievement, unlockedIds, unlocked, events }: {
  achievement: Achievement;
  unlockedIds: Set<string>;
  unlocked: UnlockedAchievement[];
  events: EventCounters;
}) {
  const isUnlocked = unlockedIds.has(achievement.id);
  const isHidden = achievement.secret && !isUnlocked;

  if (isHidden) {
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Text>{""}</Text>
        <Text bold color="gray">🔒 ??? (Secret)</Text>
        <Text>{""}</Text>
        <Text dimColor>This achievement is hidden.</Text>
        <Text dimColor>Keep coding to discover it.</Text>
      </Box>
    );
  }

  const meta = unlocked.find(u => u.id === achievement.id);
  const prog = ACHIEVEMENT_PROGRESS[achievement.id];

  let bar = "";
  let progressText = "";
  if (prog && !isUnlocked) {
    const current = events[prog.counter] ?? 0;
    const filled = Math.min(10, Math.floor((current / prog.threshold) * 10));
    bar = "█".repeat(filled) + "░".repeat(10 - filled);
    progressText = `${current} / ${prog.threshold}`;
  }

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Text>{""}</Text>
      <Text bold color={isUnlocked ? "yellow" : "cyan"}>
        {achievement.icon} {achievement.name}
      </Text>
      {achievement.secret ? <Text dimColor>(Secret)</Text> : null}
      <Text>{""}</Text>
      <Text dimColor>{achievement.description}</Text>
      <Text>{""}</Text>
      <Text dimColor>{"─".repeat(28)}</Text>
      <Text>{""}</Text>
      {isUnlocked ? (
        <Box flexDirection="column">
          <Text color="green" bold>✓ Unlocked</Text>
          {meta ? <Text dimColor>on {new Date(meta.unlockedAt).toLocaleDateString()}</Text> : null}
          {meta?.slot ? <Text dimColor>by buddy: {meta.slot}</Text> : null}
        </Box>
      ) : prog ? (
        <Box flexDirection="column">
          <Text dimColor>Progress:</Text>
          <Box>
            <Text color="yellow">{bar}</Text>
            <Text>{" "}</Text>
            <Text bold>{progressText}</Text>
          </Box>
        </Box>
      ) : (
        <Text dimColor>Locked</Text>
      )}
    </Box>
  );
}

// ─── Doctor: data collection ────────────────────────────────────────────────

interface DiagCheck { label: string; value: string; status: "ok" | "warn" | "err" }

interface DiagCategory { name: string; icon: string; checks: DiagCheck[] }

function tryExec(cmd: string, fallback = "(failed)"): string {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { return fallback; }
}

function runDiagnostics(): DiagCategory[] {
  const categories: DiagCategory[] = [];

  // Environment
  const env: DiagCheck[] = [];
  const bunVer = tryExec("bun --version");
  env.push({ label: "Bun", value: bunVer, status: bunVer === "(failed)" ? "err" : "ok" });
  const jqVer = tryExec("jq --version", "(not installed)");
  env.push({ label: "jq", value: jqVer, status: jqVer === "(not installed)" ? "warn" : "ok" });
  const claudeVer = tryExec("claude --version", "(not in PATH)");
  env.push({ label: "Claude Code", value: claudeVer, status: claudeVer === "(not in PATH)" ? "warn" : "ok" });
  env.push({ label: "OS", value: tryExec("uname -srm"), status: "ok" });
  env.push({ label: "Shell", value: process.env.SHELL ?? "(unset)", status: "ok" });
  categories.push({ name: "Environment", icon: "💻", checks: env });

  // Filesystem
  const fs: DiagCheck[] = [];
  const dirs: [string, string][] = [
    [CLAUDE_DIR, CLAUDE_DIR],
    [CLAUDE_JSON, CLAUDE_JSON],
    [STATE_DIR, STATE_DIR],
    ["Status script", join(PROJECT_ROOT, "statusline", "buddy-status.sh")],
  ];
  for (const [label, path] of dirs) {
    const exists = existsSync(path);
    fs.push({ label, value: exists ? "found" : "MISSING", status: exists ? "ok" : "err" });
  }
  categories.push({ name: "Filesystem", icon: "📁", checks: fs });

  // MCP & Hooks
  const mcp: DiagCheck[] = [];
  try {
    const claudeJson = JSON.parse(readFileSync(CLAUDE_JSON, "utf8"));
    const registered = !!claudeJson?.mcpServers?.["claude-buddy"];
    mcp.push({ label: "MCP server", value: registered ? "registered" : "NOT registered", status: registered ? "ok" : "err" });
  } catch {
    mcp.push({ label: "MCP server", value: "cannot read config", status: "err" });
  }
  try {
    const settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
    const hookCount = Object.keys(settings.hooks ?? {}).reduce((n: number, k: string) => n + (settings.hooks[k]?.length ?? 0), 0);
    mcp.push({ label: "Hooks", value: `${hookCount} entries`, status: hookCount > 0 ? "ok" : "warn" });
    mcp.push({ label: "Status line", value: settings.statusLine ? "configured" : "not set", status: settings.statusLine ? "ok" : "warn" });
  } catch {
    mcp.push({ label: "Settings", value: "cannot read", status: "err" });
  }
  const skillPath = SKILL_PATH;
  mcp.push({ label: "Skill", value: existsSync(skillPath) ? "installed" : "MISSING", status: existsSync(skillPath) ? "ok" : "err" });
  categories.push({ name: "Integration", icon: "🔌", checks: mcp });

  // Buddy state
  const state: DiagCheck[] = [];
  try {
    const menagerie = JSON.parse(readFileSync(join(STATE_DIR, "menagerie.json"), "utf8"));
    const slots = Object.keys(menagerie.companions ?? {});
    state.push({ label: "Menagerie", value: `${slots.length} buddy(s)`, status: slots.length > 0 ? "ok" : "warn" });
    state.push({ label: "Active slot", value: menagerie.active ?? "(none)", status: menagerie.active ? "ok" : "warn" });
    const active = menagerie.companions?.[menagerie.active];
    if (active) {
      state.push({ label: "Active buddy", value: `${active.name} (${active.bones?.rarity} ${active.bones?.species})`, status: "ok" });
    }
  } catch {
    state.push({ label: "Menagerie", value: "not found", status: "warn" });
  }
  const statusJson = join(STATE_DIR, "status.json");
  if (existsSync(statusJson)) {
    try {
      const s = JSON.parse(readFileSync(statusJson, "utf8"));
      state.push({ label: "Status muted", value: String(s.muted ?? false), status: "ok" });
      state.push({ label: "Last reaction", value: s.reaction || "(none)", status: "ok" });
    } catch {
      state.push({ label: "Status", value: "corrupt", status: "err" });
    }
  }
  categories.push({ name: "Buddy State", icon: "🐢", checks: state });

  return categories;
}

// ─── Middle: Doctor Categories ──────────────────────────────────────────────

function DoctorListPane({ categories, cursor, focused }: {
  categories: DiagCategory[]; cursor: number; focused: boolean;
}) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color={focused ? "cyan" : "gray"}>{" 🩺 Doctor"}</Text>
      <Text>{""}</Text>
      {categories.map((cat, i) => {
        const oks = cat.checks.filter(c => c.status === "ok").length;
        const total = cat.checks.length;
        const allOk = oks === total;
        const isCursor = focused && i === cursor;
        return (
          <Box key={cat.name}
            borderStyle={isCursor ? "round" as any : "single" as any}
            borderColor={isCursor ? "cyan" : allOk ? "green" : "yellow"}
            paddingX={1}
          >
            <Text bold={isCursor} color={isCursor ? "cyan" : "white"}>
              {cat.icon} {cat.name.padEnd(14)}
            </Text>
            <Text color={allOk ? "green" : "yellow"}>{oks}/{total} ✓</Text>
          </Box>
        );
      })}
    </Box>
  );
}

// ─── Right: Doctor Detail ───────────────────────────────────────────────────

function DoctorDetailPane({ category }: { category: DiagCategory }) {
  const statusIcon = (s: string) => s === "ok" ? "✓" : s === "warn" ? "⚠" : "✗";
  const statusColor = (s: string) => s === "ok" ? "green" : s === "warn" ? "yellow" : "red";

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Text>{""}</Text>
      <Text bold color="cyan">{category.icon} {category.name}</Text>
      <Text>{""}</Text>
      {category.checks.map((check, i) => (
        <Box key={i}>
          <Text color={statusColor(check.status)}>{" "}{statusIcon(check.status)} </Text>
          <Text dimColor>{check.label.padEnd(18)}</Text>
          <Text>{check.value}</Text>
        </Box>
      ))}
    </Box>
  );
}

// ─── Backup: data ───────────────────────────────────────────────────────────

const BACKUPS_DIR = join(STATE_DIR, "backups");

interface BackupEntry { ts: string; fileCount: number }

function getBackups(): BackupEntry[] {
  if (!existsSync(BACKUPS_DIR)) return [];
  return readdirSync(BACKUPS_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}-\d{6}$/.test(f))
    .filter(f => statSync(join(BACKUPS_DIR, f)).isDirectory())
    .sort()
    .reverse()
    .map(ts => {
      let fileCount = 0;
      try {
        const m = JSON.parse(readFileSync(join(BACKUPS_DIR, ts, "manifest.json"), "utf8"));
        fileCount = m.files?.length ?? 0;
      } catch {}
      return { ts, fileCount };
    });
}

function createBackup(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const dir = join(BACKUPS_DIR, ts);
  mkdirSync(dir, { recursive: true });

  const manifest: { timestamp: string; files: string[] } = { timestamp: ts, files: [] };
  const tryRead = (p: string) => { try { return readFileSync(p, "utf8"); } catch { return null; } };

  const settingsPath = SETTINGS_PATH;
  if (existsSync(settingsPath)) { writeFileSync(join(dir, "settings.json"), readFileSync(settingsPath)); manifest.files.push("settings.json"); }

  const claudeJsonRaw = tryRead(CLAUDE_JSON);
  if (claudeJsonRaw) {
    try {
      const mcp = JSON.parse(claudeJsonRaw).mcpServers?.["claude-buddy"];
      if (mcp) { writeFileSync(join(dir, "mcpserver.json"), JSON.stringify(mcp, null, 2)); manifest.files.push("mcpserver.json"); }
    } catch {}
  }

  const skillPath = SKILL_PATH;
  if (existsSync(skillPath)) { copyFileSync(skillPath, join(dir, "SKILL.md")); manifest.files.push("SKILL.md"); }

  const stateDir = join(dir, "claude-buddy");
  mkdirSync(stateDir, { recursive: true });
  for (const f of ["menagerie.json", "status.json", "config.json"]) {
    const src = join(STATE_DIR, f);
    if (existsSync(src)) { copyFileSync(src, join(stateDir, f)); manifest.files.push(`claude-buddy/${f}`); }
  }

  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return ts;
}

function deleteBackup(ts: string): boolean {
  const dir = join(BACKUPS_DIR, ts);
  if (!existsSync(dir)) return false;
  rmSync(dir, { recursive: true });
  return true;
}

// ─── Middle: Backup List ────────────────────────────────────────────────────

const BACKUP_ACTIONS = [
  { key: "create", icon: "➕", label: "Create new backup" },
] as const;

function BackupListPane({ backups, cursor, focused }: {
  backups: BackupEntry[]; cursor: number; focused: boolean;
}) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color={focused ? "cyan" : "gray"}>{" 💾 Backup"}</Text>
      <Text>{""}</Text>
      {BACKUP_ACTIONS.map((a, i) => {
        const isCursor = focused && i === cursor;
        return (
          <Box key={a.key}
            borderStyle={isCursor ? "round" as any : "single" as any}
            borderColor={isCursor ? "cyan" : "gray"}
            paddingX={1}
          >
            <Text bold={isCursor} color={isCursor ? "cyan" : "white"}>
              {a.icon} {a.label}
            </Text>
          </Box>
        );
      })}
      <Text>{""}</Text>
      <Text dimColor>{" "}Snapshots:</Text>
      <Text>{""}</Text>
      {backups.length === 0 ? (
        <Text dimColor>{" "}No backups yet.</Text>
      ) : (
        backups.map((b, bi) => {
          const idx = bi + BACKUP_ACTIONS.length;
          const isCursor = focused && cursor === idx;
          return (
            <Box key={b.ts}
              borderStyle={isCursor ? "round" as any : "single" as any}
              borderColor={isCursor ? "cyan" : bi === 0 ? "green" : "gray"}
              paddingX={1}
            >
              <Text bold={isCursor} color={isCursor ? "cyan" : "white"}>{b.ts}</Text>
              <Text dimColor>{" "}{b.fileCount} files</Text>
              {bi === 0 ? <Text color="green">{" latest"}</Text> : null}
            </Box>
          );
        })
      )}
    </Box>
  );
}

// ─── Right: Backup Detail ───────────────────────────────────────────────────

function BackupDetailPane({ backups, cursor }: {
  backups: BackupEntry[]; cursor: number;
}) {
  if (cursor < BACKUP_ACTIONS.length) {
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Text>{""}</Text>
        <Text bold color="cyan">➕ Create Backup</Text>
        <Text>{""}</Text>
        <Text dimColor>Creates a snapshot of all</Text>
        <Text dimColor>coding-buddy state files:</Text>
        <Text>{""}</Text>
        <Text>{" "}• settings.json</Text>
        <Text>{" "}• MCP server config</Text>
        <Text>{" "}• SKILL.md</Text>
        <Text>{" "}• menagerie.json</Text>
        <Text>{" "}• status.json</Text>
        <Text>{" "}• config.json</Text>
        <Text>{""}</Text>
        <Text dimColor>Press enter to create</Text>
      </Box>
    );
  }

  const b = backups[cursor - BACKUP_ACTIONS.length];
  if (!b) return <Text dimColor>{" "}No selection</Text>;

  let files: string[] = [];
  try {
    const m = JSON.parse(readFileSync(join(BACKUPS_DIR, b.ts, "manifest.json"), "utf8"));
    files = m.files ?? [];
  } catch {}

  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Text>{""}</Text>
      <Text bold color="cyan">📦 {b.ts}</Text>
      <Text>{""}</Text>
      <Text dimColor>Files in this snapshot:</Text>
      <Text>{""}</Text>
      {files.map((f, i) => (
        <Text key={i}>{" "}• {f}</Text>
      ))}
      <Text>{""}</Text>
      <Text dimColor>{"─".repeat(28)}</Text>
      <Text>{""}</Text>
      <Text color="red">d = delete this backup</Text>
    </Box>
  );
}

// ─── System section: install / disable / uninstall ──────────────────────────

type SystemAction = "enable" | "disable" | "uninstall";

const SYSTEM_ACTIONS: { key: SystemAction; icon: string; label: string; color: string }[] = [
  { key: "enable",    icon: "🔄", label: "Re-Enable Buddy",   color: "green" },
  { key: "disable",   icon: "☠ ", label: "Disable Buddy",     color: "red" },
  { key: "uninstall", icon: "💥", label: "Uninstall (delete all)", color: "red" },
];

function SystemListPane({ cursor, focused }: {
  cursor: number; focused: boolean;
}) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color={focused ? "cyan" : "gray"}>{" 🚨 System"}</Text>
      <Text dimColor>{"  "}Manage buddy installation</Text>
      <Text>{""}</Text>
      {SYSTEM_ACTIONS.map((a, i) => {
        const isCursor = focused && i === cursor;
        const borderColor = isCursor ? "cyan" : a.key === "enable" ? "green" : "gray";
        return (
          <Box key={a.key}
            borderStyle={isCursor ? "round" as any : "single" as any}
            borderColor={borderColor}
            paddingX={1}
          >
            <Text bold={isCursor} color={isCursor ? "cyan" : a.color}>
              {a.icon} {a.label}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
}

interface InstallResult { ok: string[]; warn: string[]; error?: string }

function runInstall(): InstallResult {
  try {
    execSync("bun run install-buddy", {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: ["Install completed", "Restart Claude Code to apply"], warn: [], error: undefined };
  } catch (e: any) {
    return { ok: [], warn: [], error: e?.message ?? "install failed" };
  }
}

function runUninstall(keepState: boolean): InstallResult {
  const ok: string[] = [];
  const warn: string[] = [];
  try {
    execSync("bun run uninstall", {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    ok.push("MCP, hooks, skill removed");
  } catch (e: any) {
    warn.push(`uninstall script: ${e?.message ?? "failed"}`);
  }
  if (!keepState) {
    try {
      const stateDir = STATE_DIR;
      if (existsSync(stateDir)) {
        rmSync(stateDir, { recursive: true, force: true });
        ok.push("State directory deleted");
      }
    } catch (e: any) {
      warn.push(`state cleanup: ${e?.message ?? "failed"}`);
    }
  } else {
    ok.push(`State preserved at ${STATE_DIR}`);
  }
  return { ok, warn };
}

type UninstallStage = "warning" | "typing" | "done";

function EnableDetailPane({ result, running }: {
  result: InstallResult | null; running: boolean;
}) {
  if (running) {
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Text>{""}</Text>
        <Text bold color="cyan">🔄 Installing…</Text>
        <Text>{""}</Text>
        <Text dimColor>Running: bun run install-buddy</Text>
        <Text dimColor>This may take a few seconds.</Text>
      </Box>
    );
  }
  if (result) {
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Text>{""}</Text>
        <Text bold color={result.error ? "red" : "green"}>
          {result.error ? "✗ Install failed" : "✓ Install completed"}
        </Text>
        <Text>{""}</Text>
        {result.error ? (
          <Text color="red">{result.error.slice(0, 200)}</Text>
        ) : (
          <>
            {result.ok.map((m, i) => <Text key={i} color="green">{" ✓ "}{m}</Text>)}
            {result.warn.map((m, i) => <Text key={i} color="yellow">{" ⚠ "}{m}</Text>)}
          </>
        )}
        <Text>{""}</Text>
        <Text dimColor>Press enter / esc to continue</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Text>{""}</Text>
      <Text bold color="green">🔄 Re-Enable coding-buddy</Text>
      <Text>{""}</Text>
      <Text dimColor>This will register:</Text>
      <Text>{"  "}• MCP server in {CLAUDE_JSON}</Text>
      <Text>{"  "}• Hooks in settings.json</Text>
      <Text>{"  "}• Status line</Text>
      <Text>{"  "}• Skill files</Text>
      <Text>{""}</Text>
      <Text dimColor>Idempotent — safe to re-run.</Text>
      <Text>{""}</Text>
      <Text dimColor>{"─".repeat(28)}</Text>
      <Text>{""}</Text>
      <Text>Press <Text bold color="green">enter</Text> to install</Text>
    </Box>
  );
}

function UninstallDetailPane({ stage, typed, result, keepState }: {
  stage: UninstallStage; typed: string; result: InstallResult | null; keepState: boolean;
}) {
  if (stage === "done" && result) {
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Text>{""}</Text>
        <Text bold color="green">✓ Uninstalled</Text>
        <Text>{""}</Text>
        {result.ok.map((m, i) => <Text key={i} color="green">{" ✓ "}{m}</Text>)}
        {result.warn.map((m, i) => <Text key={i} color="yellow">{" ⚠ "}{m}</Text>)}
        <Text>{""}</Text>
        <Text dimColor>Press enter / esc to continue</Text>
      </Box>
    );
  }
  if (stage === "typing") {
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Text>{""}</Text>
        <Text bold color="red">💥 Final confirmation</Text>
        <Text>{""}</Text>
        <Text color="red">Type UNINSTALL to proceed:</Text>
        <Text>{""}</Text>
        <Box borderStyle="round" borderColor="red" paddingX={1}>
          <Text bold color="yellow">{typed || " "}</Text>
          <Text color="yellow">▌</Text>
        </Box>
        <Text>{""}</Text>
        <Text dimColor>Keep companion data: <Text bold color={keepState ? "green" : "red"}>{keepState ? "YES" : "NO (delete all!)"}</Text></Text>
        <Text dimColor>Press <Text bold>k</Text> to toggle keep-state</Text>
        <Text>{""}</Text>
        <Text dimColor>esc to cancel</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Text>{""}</Text>
      <Text bold color="red">💥 Uninstall coding-buddy</Text>
      <Text>{""}</Text>
      <Text color="yellow">⚠  This will remove:</Text>
      <Text>{"  "}• MCP server registration</Text>
      <Text>{"  "}• Hooks & status line</Text>
      <Text>{"  "}• Skill files</Text>
      <Text>{"  "}• Optional: {STATE_DIR} (all buddies + backups!)</Text>
      <Text>{""}</Text>
      <Text dimColor>An auto-backup will be created before uninstall.</Text>
      <Text>{""}</Text>
      <Text dimColor>{"─".repeat(28)}</Text>
      <Text>{""}</Text>
      <Text>Press <Text bold color="red">enter</Text> to continue</Text>
      <Text dimColor>(you'll be asked to type UNINSTALL)</Text>
    </Box>
  );
}

// ─── Disable confirm pane ───────────────────────────────────────────────────

function DisableConfirmPane({ result, confirming }: {
  result: DisableResult | null; confirming: boolean;
}) {
  if (result) {
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Text>{""}</Text>
        <Text bold color="green">✓ Buddy disabled</Text>
        <Text>{""}</Text>
        {result.ok.map((m, i) => <Text key={i} color="green">{" ✓ "}{m}</Text>)}
        {result.warn.map((m, i) => <Text key={i} color="yellow">{" ⚠ "}{m}</Text>)}
        <Text>{""}</Text>
        <Text dimColor>Companion data preserved at</Text>
        <Text dimColor>{STATE_DIR}</Text>
        <Text>{""}</Text>
        <Text dimColor>Restart Claude Code to apply.</Text>
        <Text dimColor>Re-enable: bun run install-buddy</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Text>{""}</Text>
      <Text bold color="red">☠ Disable coding-buddy</Text>
      <Text>{""}</Text>
      <Text dimColor>This will remove:</Text>
      <Text>{"  "}• MCP server from {CLAUDE_JSON}</Text>
      <Text>{"  "}• Hooks from settings.json</Text>
      <Text>{"  "}• Status line configuration</Text>
      <Text>{""}</Text>
      <Text dimColor>Kept:</Text>
      <Text>{"  "}• All companions</Text>
      <Text>{"  "}• Backups</Text>
      <Text>{"  "}• SKILL.md</Text>
      <Text>{""}</Text>
      <Text dimColor>{"─".repeat(28)}</Text>
      <Text>{""}</Text>
      {!confirming ? (
        <Text>Press <Text bold color="red">enter</Text> to confirm</Text>
      ) : (
        <Text color="red" bold>Really disable? y = yes, n = cancel</Text>
      )}
    </Box>
  );
}

// ─── Disable helpers ────────────────────────────────────────────────────────

const CLAUDE_JSON_PATH = CLAUDE_JSON;
const CLAUDE_SETTINGS_PATH = SETTINGS_PATH;

interface DisableResult { ok: string[]; warn: string[] }

function disableBuddy(): DisableResult {
  const ok: string[] = [];
  const warn: string[] = [];

  try {
    const claudeJson = JSON.parse(readFileSync(CLAUDE_JSON_PATH, "utf8"));
    if (claudeJson.mcpServers?.["claude-buddy"]) {
      delete claudeJson.mcpServers["claude-buddy"];
      if (Object.keys(claudeJson.mcpServers).length === 0) delete claudeJson.mcpServers;
      writeFileSync(CLAUDE_JSON_PATH, JSON.stringify(claudeJson, null, 2));
      ok.push("MCP server removed");
    } else {
      warn.push("MCP was not registered");
    }
  } catch {
    warn.push(`Could not update ${CLAUDE_JSON}`);
  }

  try {
    const settings = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, "utf8"));
    let changed = false;

    if (settings.statusLine?.command?.includes("buddy")) {
      delete settings.statusLine;
      changed = true;
    }

    if (settings.hooks) {
      for (const hookType of ["PostToolUse", "Stop", "SessionStart", "SessionEnd"]) {
        if (settings.hooks[hookType]) {
          const before = settings.hooks[hookType].length;
          settings.hooks[hookType] = settings.hooks[hookType].filter(
            (h: any) => !h.hooks?.some((hh: any) => hh.command?.includes("coding-buddy") || hh.command?.includes("claude-buddy")),
          );
          if (settings.hooks[hookType].length < before) changed = true;
          if (settings.hooks[hookType].length === 0) delete settings.hooks[hookType];
        }
      }
      if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
    }

    if (changed) {
      writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
      ok.push("Hooks & status line removed");
    } else {
      warn.push("Nothing to remove from settings.json");
    }
  } catch {
    warn.push("Could not update settings.json");
  }

  return { ok, warn };
}

// ─── Verify: buddy from user ID ──────────────────────────────────────────────

const VERIFY_BUTTONS = [
  { key: "random",  icon: "🎲", label: "Random ID" },
  { key: "current", icon: "📍", label: "Use my current ID" },
  { key: "edit",    icon: "✏ ", label: "Enter custom hex" },
] as const;

function VerifyPane({ userIdInput, editing, preview, buttonCursor, focused }: {
  userIdInput: string; editing: boolean; preview: { userId: string; bones: BuddyBones } | null;
  buttonCursor: number; focused: boolean;
}) {
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color={focused ? "cyan" : "gray"}>{" 🔍 Verify"}</Text>
      <Text>{""}</Text>
      <Text dimColor>Show the deterministic buddy</Text>
      <Text dimColor>generated from a user ID.</Text>
      <Text>{""}</Text>
      <Box borderStyle={editing ? "round" as any : "single" as any} borderColor={editing ? "cyan" : "gray"} paddingX={1} flexDirection="column">
        <Text dimColor>User ID:</Text>
        <Box>
          <Text bold color="yellow">{userIdInput.slice(0, 32) || "(none)"}{userIdInput.length > 32 ? "…" : ""}</Text>
          {editing ? <Text color="yellow">▌</Text> : null}
        </Box>
      </Box>
      <Text>{""}</Text>
      {!editing ? (
        <Box flexDirection="column">
          {VERIFY_BUTTONS.map((b, i) => {
            const isCursor = focused && i === buttonCursor;
            return (
              <Box key={b.key}
                borderStyle={isCursor ? "round" as any : "single" as any}
                borderColor={isCursor ? "cyan" : "gray"}
                paddingX={1}
              >
                <Text bold={isCursor} color={isCursor ? "cyan" : "white"}>
                  {b.icon} {b.label}
                </Text>
              </Box>
            );
          })}
        </Box>
      ) : (
        <Text dimColor>{"  "}type hex  ⏎ confirm  esc cancel</Text>
      )}
      {preview && !editing ? (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>{"─".repeat(28)}</Text>
          <Text dimColor>Preview shown on the right →</Text>
        </Box>
      ) : null}
    </Box>
  );
}

// ─── Hunt: criteria + async search + results ─────────────────────────────────

type HuntPhase = "form" | "searching" | "results";
const HUNT_FIELDS = ["species", "rarity", "shiny", "peak", "dump"] as const;
type HuntField = typeof HUNT_FIELDS[number];

interface HuntCriteria {
  species: Species;
  rarity: Rarity;
  shiny: boolean;
  peak?: StatName;
  dump?: StatName;
}

const HUNT_OPTS: Record<HuntField, readonly string[]> = {
  species: SPECIES,
  rarity: RARITIES,
  shiny: ["no", "yes"],
  peak: ["any", ...STAT_NAMES],
  dump: ["any", ...STAT_NAMES],
};

function huntMaxAttempts(rarity: Rarity, shiny: boolean): number {
  let n = 10_000_000;
  if (rarity === "legendary") n = 200_000_000;
  else if (rarity === "epic") n = 50_000_000;
  if (shiny) n *= 3;
  return n;
}

function HuntFormPane({ criteria, fieldCursor, optCursors, focused }: {
  criteria: HuntCriteria;
  fieldCursor: number;
  optCursors: Record<HuntField, number>;
  focused: boolean;
}) {
  const valueFor = (f: HuntField): string => {
    if (f === "species") return criteria.species;
    if (f === "rarity") return criteria.rarity;
    if (f === "shiny") return criteria.shiny ? "yes" : "no";
    if (f === "peak") return criteria.peak ?? "any";
    return criteria.dump ?? "any";
  };
  const maxAttempts = huntMaxAttempts(criteria.rarity, criteria.shiny);
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color={focused ? "cyan" : "gray"}>{" 🎯 Hunt"}</Text>
      <Text dimColor>{"  "}Search criteria:</Text>
      <Text>{""}</Text>
      {HUNT_FIELDS.map((f, i) => {
        const isCursor = focused && i === fieldCursor;
        return (
          <Box key={f}
            borderStyle={isCursor ? "round" as any : "single" as any}
            borderColor={isCursor ? "cyan" : "gray"}
            paddingX={1}
          >
            <Text bold={isCursor} color={isCursor ? "cyan" : "white"}>{f.padEnd(9)}</Text>
            <Text color="yellow">{valueFor(f)}</Text>
          </Box>
        );
      })}
      <Box
        borderStyle={focused && fieldCursor === HUNT_FIELDS.length ? "round" as any : "single" as any}
        borderColor={focused && fieldCursor === HUNT_FIELDS.length ? "green" : "gray"}
        paddingX={1}
      >
        <Text bold color={focused && fieldCursor === HUNT_FIELDS.length ? "green" : "white"}>
          ▶ Start Hunt
        </Text>
      </Box>
      <Text>{""}</Text>
      <Text dimColor>{"  "}Max attempts: {(maxAttempts / 1e6).toFixed(0)}M</Text>
    </Box>
  );
}

function HuntProgressPane({ checked, maxAttempts, found }: {
  checked: number; maxAttempts: number; found: number;
}) {
  const pct = Math.min(100, Math.floor((checked / maxAttempts) * 100));
  const filled = Math.floor(pct / 5);
  const bar = "█".repeat(filled) + "░".repeat(20 - filled);
  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Text>{""}</Text>
      <Text bold color="cyan">Searching…</Text>
      <Text>{""}</Text>
      <Text color="yellow">{bar}</Text>
      <Text dimColor>{(checked / 1e6).toFixed(1)}M / {(maxAttempts / 1e6).toFixed(0)}M  ({pct}%)</Text>
      <Text>{""}</Text>
      <Text>Matches found: <Text bold color="green">{found}</Text></Text>
      <Text>{""}</Text>
      <Text dimColor>Press esc to cancel</Text>
    </Box>
  );
}

function HuntResultsPane({ results, cursor, focused }: {
  results: SearchResult[]; cursor: number; focused: boolean;
}) {
  if (results.length === 0) {
    return (
      <Box flexDirection="column" paddingLeft={1}>
        <Text>{""}</Text>
        <Text color="red" bold>✗ No matches found</Text>
        <Text>{""}</Text>
        <Text dimColor>Try less restrictive criteria.</Text>
        <Text>{""}</Text>
        <Text dimColor>Press esc to go back</Text>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Text>{""}</Text>
      <Text bold color="green">✓ {results.length} matches — pick one</Text>
      <Text>{""}</Text>
      {results.slice(0, 5).map((r, i) => {
        const isCursor = focused && i === cursor;
        const b = r.bones;
        const statLine = (STAT_NAMES as readonly StatName[]).map(n => `${n.slice(0, 3)}:${b.stats[n]}`).join(" ");
        return (
          <Box key={i}
            borderStyle={isCursor ? "round" as any : "single" as any}
            borderColor={isCursor ? "cyan" : "gray"}
            paddingX={1}
            flexDirection="column"
          >
            <Text bold={isCursor} color={isCursor ? "cyan" : "white"}>
              {b.shiny ? "✨ " : "   "}eye={b.eye} hat={b.hat}
            </Text>
            <Text dimColor>{statLine}</Text>
          </Box>
        );
      })}
      <Text>{""}</Text>
      <Text dimColor>⏎ save & activate  esc discard</Text>
    </Box>
  );
}

function HuntNamingPane({ nameInput, chosenBones }: {
  nameInput: string; chosenBones: BuddyBones;
}) {
  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Text>{""}</Text>
      <Text bold color="yellow">Name your new buddy</Text>
      <Text>{""}</Text>
      <Text dimColor>{chosenBones.rarity} {chosenBones.species}{chosenBones.shiny ? " ✨" : ""}</Text>
      <Text>{""}</Text>
      <Box>
        <Text dimColor>Name: </Text>
        <Text bold color="yellow">{nameInput || " "}</Text>
        <Text color="yellow">▌</Text>
      </Box>
      <Text>{""}</Text>
      <Text dimColor>type name  ⏎ save  esc cancel</Text>
    </Box>
  );
}

// ─── Right: Buddy Card ──────────────────────────────────────────────────────

function BuddyCardPane({ companion, slot, isActive, editablePersonality, editCursor = 0 }: {
  companion: Companion; slot: string; isActive: boolean;
  editablePersonality?: string;
  editCursor?: number;
}) {
  const b = companion.bones;
  const color = RARITY_COLOR[b.rarity] ?? "white";
  const stars = RARITY_STARS[b.rarity];
  const shiny = b.shiny ? " ✨" : "";
  const art = getArtFrame(b.species, b.eye, 0);
  const hatLine = HAT_ART[b.hat];
  if (hatLine && !art[0].trim()) art[0] = hatLine;
  const reaction = loadReaction();
  const isEditing = typeof editablePersonality === "string";
  const displayPersonality = isEditing ? editablePersonality! : companion.personality;
  const overLimit = isEditing && (editablePersonality?.length ?? 0) > 500;

  const mkBar = (val: number) => {
    const f = Math.round(val / 10);
    return "█".repeat(f) + "░".repeat(10 - f);
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={2} paddingY={1} width={48}>

      {/* Header: rarity + species */}
      <Box justifyContent="space-between">
        <Text color={color}>{stars} {b.rarity.toUpperCase()}{shiny}</Text>
        <Text dimColor>{b.species.toUpperCase()}</Text>
      </Box>

      {/* ASCII art */}
      <Box flexDirection="column" marginTop={2} marginBottom={2}>
        {art.map((line, i) => line.trim() ? <Text key={i}>{"  "}{line}</Text> : null)}
      </Box>

      {/* Name */}
      <Box marginBottom={1}>
        <Text bold color={color}>{companion.name}</Text>
      </Box>

      {/* Personality — editable when editablePersonality provided */}
      {isEditing ? (
        <Box flexDirection="column" marginBottom={1}>
          <Box borderStyle="round" borderColor={overLimit ? "red" : "magenta"} paddingX={1}>
            <Text italic color={overLimit ? "red" : "yellow"}>
              {displayPersonality.slice(0, editCursor)}
              <Text color="yellow" inverse>{displayPersonality.slice(editCursor, editCursor + 1) || " "}</Text>
              {displayPersonality.slice(editCursor + 1)}
            </Text>
          </Box>
          <Text dimColor>
            {displayPersonality.length} / 500
            {overLimit ? " — over limit" : ""}  ⏎ save  esc cancel  ←→ move
          </Text>
        </Box>
      ) : (
        <Box marginBottom={1}>
          <Text dimColor italic>"{companion.personality}"</Text>
        </Box>
      )}

      {/* Stats */}
      <Box flexDirection="column" marginBottom={1}>
        {(STAT_NAMES as readonly StatName[]).map(stat => {
          const val = b.stats[stat];
          const isPeak = stat === b.peak;
          const isDump = stat === b.dump;
          const marker = isPeak ? " ▲" : isDump ? " ▼" : "";
          const statColor = isPeak ? "green" : isDump ? "red" : undefined;
          return (
            <Box key={stat} justifyContent="space-between">
              <Text dimColor>{stat.padEnd(10)}</Text>
              <Text> {mkBar(val)} </Text>
              <Text bold color={statColor}>{String(val).padStart(3)}{marker.padEnd(2)}</Text>
            </Box>
          );
        })}
      </Box>

      {/* Reaction */}
      {reaction?.reaction ? (
        <Box marginBottom={1}>
          <Text>💬 <Text italic>{reaction.reaction}</Text></Text>
        </Box>
      ) : null}

      {/* Footer */}
      <Box>
        <Text dimColor>eye: {b.eye}  hat: {b.hat}  slot: </Text>
        <Text bold>{slot}</Text>
        {isActive ? <Text color="green" bold>{" ●"}</Text> : null}
      </Box>

    </Box>
  );
}

// ─── Right: Setting Detail ──────────────────────────────────────────────────

interface SettingDef {
  key: string; label: string; description: string[];
  type: "number" | "options"; options?: string[];
  min?: number; default: string;
}

const SETTING_DEFS: SettingDef[] = [
  { key: "commentCooldown", label: "Comment Cooldown", description: ["Minimum seconds between", "buddy status line comments.", "", "Lower = chatty, Higher = quiet"], type: "number", min: 0, default: "30" },
  { key: "reactionTTL", label: "Reaction TTL", description: ["How long reactions stay", "visible in status line.", "", "0 = permanent"], type: "number", min: 0, default: "900" },
  { key: "bubbleStyle", label: "Bubble Style", description: ["Speech bubble style.", "", 'classic → "quoted"', "round → (parens)"], type: "options", options: ["classic", "round"], default: "classic" },
  { key: "bubblePosition", label: "Bubble Position", description: ["Bubble placement.", "", "top → above buddy", "left → beside buddy"], type: "options", options: ["top", "left"], default: "top" },
  { key: "showRarity", label: "Show Rarity", description: ["Show rarity stars in", "the status line.", "", "true → ★★★★ visible", "false → hidden"], type: "options", options: ["true", "false"], default: "true" },
  { key: "statusLineEnabled", label: "Status Line", description: ["Animated buddy in Claude Code's", "status line bar.", "", "true  → patches settings.json", "false → removes it", "", "Restart Claude Code after toggle."], type: "options", options: ["true", "false"], default: "false" },
];

function SettingDetailPane({ settingIndex, config, editing, numInput, optCursor }: {
  settingIndex: number; config: BuddyConfig; editing: boolean; numInput: string; optCursor: number;
}) {
  const def = SETTING_DEFS[settingIndex];
  const currentVal = String(config[def.key as keyof BuddyConfig]);
  const inBuddyShell = process.env.BUDDY_SHELL === "1";
  const showBuddyShellHint = def.key === "statusLineEnabled" && inBuddyShell;
  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Text>{""}</Text>
      <Text bold color="cyan">{def.label}</Text>
      <Text>{""}</Text>
      {def.description.map((line, i) => <Text key={i} dimColor>{line}</Text>)}
      {showBuddyShellHint ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color="yellow">⚠  Currently suppressed</Text>
          <Text dimColor>You're inside buddy-shell — the</Text>
          <Text dimColor>status line is hidden automatically</Text>
          <Text dimColor>(buddy already shown in the panel).</Text>
          <Text dimColor>This setting still persists; it takes</Text>
          <Text dimColor>effect when you run claude without</Text>
          <Text dimColor>the shell wrapper.</Text>
        </Box>
      ) : null}
      <Text>{""}</Text>
      <Text dimColor>{"─".repeat(28)}</Text>
      <Text>{""}</Text>
      {!editing ? (
        <Box flexDirection="column">
          <Text>Current: <Text bold color="yellow">{currentVal}</Text></Text>
          <Text dimColor>Default: {def.default}</Text>
          <Text>{""}</Text>
          <Text dimColor>Press enter to edit</Text>
        </Box>
      ) : def.type === "options" ? (
        <Box flexDirection="column">
          {def.options!.map((opt, i) => (
            <Text key={opt}>
              {i === optCursor ? <Text color="green" bold>{" ▸ "}{opt}</Text> : opt === currentVal ? <Text>{" ● "}{opt}</Text> : <Text dimColor>{" ○ "}{opt}</Text>}
              {opt === def.default ? <Text dimColor>{" (default)"}</Text> : null}
            </Text>
          ))}
          <Text>{""}</Text>
          <Text dimColor>↑↓ select  enter confirm  esc cancel</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          <Box>
            <Text dimColor>{"Value: "}</Text>
            <Text bold color="yellow" underline>{numInput || " "}</Text>
            <Text color="yellow">▌</Text>
            <Text dimColor> seconds</Text>
          </Box>
          <Text>{""}</Text>
          <Text dimColor>Was: {currentVal}  Default: {def.default}</Text>
          <Text>{""}</Text>
          <Text dimColor>Type number  enter confirm  esc cancel</Text>
        </Box>
      )}
    </Box>
  );
}

// ─── Right: Sidebar Description ─────────────────────────────────────────────

function SidebarDescriptionPane({ cursor }: { cursor: number }) {
  if (cursor >= SIDEBAR_ITEMS.length) {
    return (
      <Box flexDirection="column" paddingLeft={2} paddingY={1}>
        <Text bold color="red">👋 Exit</Text>
        <Text>{""}</Text>
        <Text dimColor>Close the dashboard and</Text>
        <Text dimColor>return to your shell.</Text>
      </Box>
    );
  }
  const item = SIDEBAR_ITEMS[cursor];
  if (!item) return null;
  return (
    <Box flexDirection="column" paddingLeft={2} paddingY={1}>
      <Text bold color="cyan">{item.icon} {item.label}</Text>
      <Text>{""}</Text>
      {item.description.map((line, i) => (
        <Text key={i} dimColor={line !== ""}>{line || " "}</Text>
      ))}
      <Text>{""}</Text>
      <Text dimColor>{"─".repeat(30)}</Text>
      <Text>{""}</Text>
      <Text dimColor>Press ⏎ to open this section</Text>
    </Box>
  );
}

// ─── App ────────────────────────────────────────────────────────────────────

function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 80;
  const rows = stdout?.rows ?? 24;

  const [section, setSection] = useState<Section>("menagerie");
  const [focus, setFocus] = useState<Focus>("sidebar");
  const [sidebarCursor, setSidebarCursor] = useState(0);
  const [listCursor, setListCursor] = useState(0);
  const [settCursor, setSettCursor] = useState(0);
  const [optCursor, setOptCursor] = useState(0);
  const [numInput, setNumInput] = useState("");
  const [config, setConfig] = useState<BuddyConfig>(loadConfig());
  const [message, setMessage] = useState("");
  const [diagData] = useState(() => runDiagnostics());
  const [backups, setBackups] = useState(() => getBackups());
  const [achData] = useState(() => ({
    unlocked: loadUnlocked(),
    events: loadEvents(loadActiveSlot()),
  }));
  const unlockedIds = React.useMemo(
    () => new Set(achData.unlocked.map(u => u.id)),
    [achData.unlocked],
  );

  // Menagerie search/filter (always-active text input)
  const [menagSearch, setMenagSearch] = useState("");

  // Menagerie personality editor
  // input + cursor live in one object so rapid key-repeat (held backspace,
  // held arrows) can update both atomically via a single functional setter.
  const [personalityEditing, setPersonalityEditing] = useState(false);
  const [personalitySlot, setPersonalitySlot] = useState("");
  const [personalityEdit, setPersonalityEdit] = useState<{ input: string; cursor: number }>({ input: "", cursor: 0 });
  const personalityInput = personalityEdit.input;
  const personalityCursor = personalityEdit.cursor;

  // Verify
  const [verifyInput, setVerifyInput] = useState("");
  const [verifyEditing, setVerifyEditing] = useState(false);
  const [verifyPreview, setVerifyPreview] = useState<{ userId: string; bones: BuddyBones } | null>(null);
  const [verifyButtonCursor, setVerifyButtonCursor] = useState(0);

  // Hunt
  const [huntPhase, setHuntPhase] = useState<HuntPhase | "naming">("form");
  const [huntCriteria, setHuntCriteria] = useState<HuntCriteria>({
    species: SPECIES[0] as Species,
    rarity: "uncommon" as Rarity,
    shiny: false,
  });
  const [huntFieldCursor, setHuntFieldCursor] = useState(0);
  const [huntOptCursors, setHuntOptCursors] = useState<Record<HuntField, number>>({
    species: 0, rarity: 1, shiny: 0, peak: 0, dump: 0,
  });
  const [huntChecked, setHuntChecked] = useState(0);
  const [huntResults, setHuntResults] = useState<SearchResult[]>([]);
  const [huntResultCursor, setHuntResultCursor] = useState(0);
  const [huntNameInput, setHuntNameInput] = useState("");
  const huntCancelRef = React.useRef(false);

  // System (enable / disable / uninstall)
  const [systemCursor, setSystemCursor] = useState(0);
  const [disableConfirming, setDisableConfirming] = useState(false);
  const [disableResult, setDisableResult] = useState<DisableResult | null>(null);
  const [enableRunning, setEnableRunning] = useState(false);
  const [enableResult, setEnableResult] = useState<InstallResult | null>(null);
  const [uninstallStage, setUninstallStage] = useState<UninstallStage>("warning");
  const [uninstallTyped, setUninstallTyped] = useState("");
  const [uninstallKeepState, setUninstallKeepState] = useState(true);
  const [uninstallResult, setUninstallResult] = useState<InstallResult | null>(null);

  const rawSlots = listCompanionSlots();
  const activeSlot = loadActiveSlot();
  const slots = React.useMemo(() => {
    if (!menagSearch) return rawSlots;
    const q = menagSearch.toLowerCase();
    return rawSlots.filter(s =>
      s.companion.name.toLowerCase().includes(q)
      || s.companion.bones.species.toLowerCase().includes(q)
      || s.companion.bones.rarity.toLowerCase().includes(q),
    );
  }, [rawSlots, menagSearch]);

  // Hunt async chunked search
  React.useEffect(() => {
    if (huntPhase !== "searching") return;
    huntCancelRef.current = false;
    const maxAttempts = huntMaxAttempts(huntCriteria.rarity, huntCriteria.shiny);
    const CHUNK = 500_000;
    let total = 0;
    const allResults: SearchResult[] = [];

    const sc: SearchCriteria = {
      species: huntCriteria.species,
      rarity: huntCriteria.rarity,
      wantShiny: huntCriteria.shiny,
      wantPeak: huntCriteria.peak,
      wantDump: huntCriteria.dump,
    };
    const step = () => {
      if (huntCancelRef.current) return;
      const chunkResults = searchBuddy(sc, CHUNK);
      allResults.push(...chunkResults);
      total += CHUNK;
      setHuntChecked(total);
      setHuntResults([...allResults]);
      if (total >= maxAttempts || allResults.length >= 20) {
        setHuntPhase("results");
        setHuntResultCursor(0);
        return;
      }
      setTimeout(step, 0);
    };
    setTimeout(step, 0);

    return () => { huntCancelRef.current = true; };
  }, [huntPhase]);

  const sidebarWidth = 35;
  const middleWidth = 35;

  useInput((input, key) => {
    setMessage("");

    // Unified: Enter or Space = primary action
    const isSelect = key.return || input === " ";

    // ─── Sidebar ────────────────────────────
    if (focus === "sidebar") {
      if (key.upArrow) setSidebarCursor(c => Math.max(0, c - 1));
      if (key.downArrow) setSidebarCursor(c => Math.min(SIDEBAR_ITEMS.length, c + 1));
      if (input === "q") exit();
      if (isSelect) {
        if (sidebarCursor >= SIDEBAR_ITEMS.length) { exit(); return; }
        const selected = SIDEBAR_ITEMS[sidebarCursor].key;
        setSection(selected);
        setFocus("list");
        setListCursor(0);
        setSettCursor(0);
        setSystemCursor(0);
        setMenagSearch("");
        setPersonalityEditing(false);
        setPersonalitySlot("");
        setPersonalityEdit({ input: "", cursor: 0 });
        setDisableConfirming(false);
        setDisableResult(null);
        setEnableResult(null);
        setUninstallStage("warning");
        setUninstallTyped("");
        if (selected === "backup") setBackups(getBackups());
      }
    }

    // ─── Personality Edit ───────────────────
    // Enter = save, Esc = discard + exit, ↑↓ = switch buddy (discards unsaved),
    // ←→ = move cursor within the text.
    else if (focus === "list" && section === "menagerie" && personalityEditing) {
      if (key.escape) {
        setPersonalityEditing(false);
        setPersonalitySlot("");
        setPersonalityEdit({ input: "", cursor: 0 });
        return;
      }

      if (key.return) {
        if (personalityInput.length === 0 || personalityInput.length > 500) {
          setMessage("✗ personality must be 1-500 chars");
          return;
        }
        const entry = rawSlots.find(s => s.slot === personalitySlot);
        if (!entry) return;
        if (entry.companion.personality === personalityInput) {
          setMessage("(no changes)");
          return;
        }
        try {
          updateCompanionSlot(personalitySlot, { ...entry.companion, personality: personalityInput });
          setMessage(`✓ ${entry.companion.name}'s personality saved`);
        } catch (e: any) {
          setMessage(`✗ ${e?.message ?? "failed"}`);
        }
        return;
      }

      if (key.leftArrow) {
        setPersonalityEdit(st => ({ input: st.input, cursor: Math.max(0, st.cursor - 1) }));
        return;
      }
      if (key.rightArrow) {
        setPersonalityEdit(st => ({ input: st.input, cursor: Math.min(st.input.length, st.cursor + 1) }));
        return;
      }

      if (key.upArrow || key.downArrow) {
        // Switch buddy — discards unsaved changes of current buddy
        const maxIdx = slots.length - 1;
        const newIdx = key.upArrow
          ? Math.max(0, listCursor - 1)
          : Math.min(maxIdx, listCursor + 1);
        setListCursor(newIdx);
        const nextBuddy = slots[newIdx];
        if (nextBuddy) {
          setPersonalitySlot(nextBuddy.slot);
          setPersonalityEdit({ input: nextBuddy.companion.personality, cursor: nextBuddy.companion.personality.length });
        }
        return;
      }

      if (key.backspace || key.delete) {
        setPersonalityEdit(st => {
          if (st.cursor === 0) return st;
          return {
            input: st.input.slice(0, st.cursor - 1) + st.input.slice(st.cursor),
            cursor: st.cursor - 1,
          };
        });
        return;
      }

      // Insert printable chars (handles typed input and paste).
      // Strip bracketed-paste markers and any control characters.
      if (input && input.length > 0) {
        const cleaned = input
          .replace(/\x1b\[200~|\x1b\[201~/g, "")
          .replace(/[\x00-\x1f\x7f]/g, "");
        if (cleaned.length > 0) {
          setPersonalityEdit(st => {
            const remaining = Math.max(0, 500 - st.input.length);
            const toInsert = cleaned.slice(0, remaining);
            if (toInsert.length === 0) return st;
            return {
              input: st.input.slice(0, st.cursor) + toInsert + st.input.slice(st.cursor),
              cursor: st.cursor + toInsert.length,
            };
          });
        }
      }
      return;
    }

    // ─── List: Menagerie ────────────────────
    // Filter is always active while in list mode: typing filters live,
    // arrows navigate (incl. the "Edit Personality" button at the end),
    // Enter activates buddy or opens edit mode.
    else if (focus === "list" && section === "menagerie") {
      const editIdx = slots.length; // cursor position for the edit button
      if (key.escape) {
        if (menagSearch) { setMenagSearch(""); setListCursor(0); return; }
        setFocus("sidebar");
        return;
      }
      if (key.upArrow) { setListCursor(c => Math.max(0, c - 1)); return; }
      if (key.downArrow) { setListCursor(c => Math.min(editIdx, c + 1)); return; }
      if (key.return) {
        if (listCursor === editIdx) {
          // Edit Personality button — use buddy just above the button
          const buddyIdx = Math.min(Math.max(0, listCursor - 1), slots.length - 1);
          const target = slots[buddyIdx];
          if (target) {
            setListCursor(buddyIdx); // move cursor back onto that buddy
            setPersonalitySlot(target.slot);
            setPersonalityEdit({ input: target.companion.personality, cursor: target.companion.personality.length });
            setPersonalityEditing(true);
          }
          return;
        }
        if (slots[listCursor]) {
          const { slot, companion } = slots[listCursor];
          saveActiveSlot(slot);
          writeStatusState(companion, `*${companion.name} arrives*`);
          setMessage(`✓ ${companion.name} is now active!`);
        }
        return;
      }
      if (key.backspace || key.delete) {
        setMenagSearch(s => s.slice(0, -1));
        setListCursor(0);
        return;
      }
      // Any printable char → append to filter (reset cursor to top)
      if (input && input.length === 1 && input >= " " && input !== "\x7f") {
        setMenagSearch(s => s + input);
        setListCursor(0);
      }
    }

    // ─── List: Settings ─────────────────────
    else if (focus === "list" && section === "settings") {
      if (key.escape) setFocus("sidebar");
      if (input === "q") exit();
      if (key.upArrow) setSettCursor(c => Math.max(0, c - 1));
      if (key.downArrow) setSettCursor(c => Math.min(SETTINGS_ITEMS.length - 1, c + 1));
      if (isSelect) {
        const def = SETTING_DEFS[settCursor];
        if (def.type === "options") {
          const current = String(config[def.key as keyof BuddyConfig]);
          setOptCursor(def.options!.indexOf(current));
        } else {
          setNumInput(String(config[def.key as keyof BuddyConfig]));
        }
        setFocus("edit");
      }
    }

    // ─── List: Achievements ─────────────────
    else if (focus === "list" && section === "achievements") {
      if (key.escape) setFocus("sidebar");
      if (input === "q") exit();
      if (key.upArrow) setListCursor(c => Math.max(0, c - 1));
      if (key.downArrow) setListCursor(c => Math.min(ACHIEVEMENTS.length - 1, c + 1));
    }

    // ─── List: Verify ───────────────────────
    else if (focus === "list" && section === "verify") {
      if (verifyEditing) {
        if (key.escape) { setVerifyEditing(false); setVerifyInput(""); return; }
        if (key.return) {
          const id = verifyInput.trim();
          if (id) { setVerifyPreview({ userId: id, bones: generateBones(id) }); }
          setVerifyEditing(false);
          return;
        }
        if (key.backspace || key.delete) { setVerifyInput(s => s.slice(0, -1)); return; }
        if (input && input.length === 1 && /^[0-9a-fA-F]$/.test(input)) {
          setVerifyInput(s => s + input);
        }
        return;
      }
      if (key.escape) setFocus("sidebar");
      if (input === "q") exit();
      if (key.upArrow) setVerifyButtonCursor(c => Math.max(0, c - 1));
      if (key.downArrow) setVerifyButtonCursor(c => Math.min(VERIFY_BUTTONS.length - 1, c + 1));

      const doRandom = () => {
        const hex = Array.from({ length: 32 }, () =>
          Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join("");
        setVerifyInput(hex);
        setVerifyPreview({ userId: hex, bones: generateBones(hex) });
      };
      const doCurrent = () => {
        const id = resolveUserId();
        setVerifyInput(id);
        setVerifyPreview({ userId: id, bones: generateBones(id) });
      };
      const doEdit = () => { setVerifyEditing(true); setVerifyInput(""); };

      if (isSelect) {
        const b = VERIFY_BUTTONS[verifyButtonCursor];
        if (b.key === "random") doRandom();
        else if (b.key === "current") doCurrent();
        else if (b.key === "edit") doEdit();
      }
      // Power-user shortcuts (not shown in help, but kept for speed)
      if (input === "r") doRandom();
      if (input === "c") doCurrent();
    }

    // ─── List: Hunt ─────────────────────────
    else if (focus === "list" && section === "hunt") {
      if (huntPhase === "form") {
        if (key.escape) setFocus("sidebar");
        if (input === "q") exit();
        const maxIdx = HUNT_FIELDS.length; // +1 for Start button
        if (key.upArrow) setHuntFieldCursor(c => Math.max(0, c - 1));
        if (key.downArrow) setHuntFieldCursor(c => Math.min(maxIdx, c + 1));
        if (isSelect) {
          if (huntFieldCursor === HUNT_FIELDS.length) {
            // Start Hunt
            setHuntChecked(0);
            setHuntResults([]);
            setHuntPhase("searching");
            return;
          }
          const f = HUNT_FIELDS[huntFieldCursor];
          const opts = HUNT_OPTS[f];
          const cur = huntOptCursors[f];
          const next = (cur + 1) % opts.length;
          setHuntOptCursors({ ...huntOptCursors, [f]: next });
          const val = opts[next];
          if (f === "species") setHuntCriteria(c => ({ ...c, species: val as Species }));
          else if (f === "rarity") setHuntCriteria(c => ({ ...c, rarity: val as Rarity }));
          else if (f === "shiny") setHuntCriteria(c => ({ ...c, shiny: val === "yes" }));
          else if (f === "peak") setHuntCriteria(c => ({ ...c, peak: val === "any" ? undefined : val as StatName }));
          else if (f === "dump") setHuntCriteria(c => ({ ...c, dump: val === "any" ? undefined : val as StatName }));
        }
      } else if (huntPhase === "searching") {
        if (key.escape) { huntCancelRef.current = true; setHuntPhase("form"); }
      } else if (huntPhase === "results") {
        if (key.escape) { setHuntPhase("form"); setHuntResults([]); setHuntChecked(0); }
        const top = huntResults.slice(0, 5);
        if (key.upArrow) setHuntResultCursor(c => Math.max(0, c - 1));
        if (key.downArrow) setHuntResultCursor(c => Math.min(top.length - 1, c + 1));
        if (isSelect && top[huntResultCursor]) {
          setHuntNameInput(unusedName());
          setHuntPhase("naming");
        }
      } else if (huntPhase === "naming") {
        if (key.escape) { setHuntNameInput(""); setHuntPhase("results"); return; }
        if (key.return) {
          const name = huntNameInput.trim() || unusedName();
          const slot = slugify(name);
          const chosen = huntResults[huntResultCursor];
          const existing = new Set(listCompanionSlots().map(e => slugify(e.companion.name)));
          if (existing.has(slot)) {
            setMessage(`✗ Slot "${slot}" already taken`);
            return;
          }
          const companion: Companion = {
            bones: chosen.bones,
            name,
            personality: `A ${chosen.bones.rarity} ${chosen.bones.species} who watches code with quiet intensity.`,
            hatchedAt: Date.now(),
            userId: chosen.userId,
          };
          saveCompanionSlot(companion, slot);
          saveActiveSlot(slot);
          writeStatusState(companion, `*${name} arrives*`);
          setMessage(`✓ ${name} saved to slot "${slot}"`);
          setHuntNameInput("");
          setHuntResults([]);
          setHuntChecked(0);
          setHuntPhase("form");
          return;
        }
        if (key.backspace || key.delete) { setHuntNameInput(s => s.slice(0, -1)); return; }
        if (input && input.length === 1 && input >= " " && huntNameInput.length < 14) {
          setHuntNameInput(s => s + input);
        }
      }
    }

    // ─── List: Doctor ───────────────────────
    else if (focus === "list" && section === "doctor") {
      if (key.escape) setFocus("sidebar");
      if (input === "q") exit();
      if (key.upArrow) setListCursor(c => Math.max(0, c - 1));
      if (key.downArrow) setListCursor(c => Math.min(diagData.length - 1, c + 1));
    }

    // ─── List: Backup ───────────────────────
    else if (focus === "list" && section === "backup") {
      if (key.escape) setFocus("sidebar");
      if (input === "q") exit();
      const maxIdx = BACKUP_ACTIONS.length + backups.length - 1;
      if (key.upArrow) setListCursor(c => Math.max(0, c - 1));
      if (key.downArrow) setListCursor(c => Math.min(maxIdx, c + 1));
      if (isSelect) {
        if (listCursor < BACKUP_ACTIONS.length) {
          const ts = createBackup();
          setBackups(getBackups());
          setMessage(`✓ Backup created: ${ts}`);
          setListCursor(0);
        }
      }
      if (input === "d" && listCursor >= BACKUP_ACTIONS.length) {
        const b = backups[listCursor - BACKUP_ACTIONS.length];
        if (b && deleteBackup(b.ts)) {
          setBackups(getBackups());
          setMessage(`✓ Deleted: ${b.ts}`);
          setListCursor(Math.max(0, listCursor - 1));
        }
      }
    }

    // ─── List: System ───────────────────────
    else if (focus === "list" && section === "system") {
      const action = SYSTEM_ACTIONS[systemCursor]?.key;
      // Post-result screens: any key returns to list
      if (action === "enable" && enableResult) {
        if (key.return || input === " " || key.escape) {
          setEnableResult(null);
          return;
        }
        return;
      }
      if (action === "uninstall" && uninstallStage === "done") {
        if (key.return || input === " " || key.escape) {
          setUninstallStage("warning");
          setUninstallResult(null);
          setUninstallTyped("");
          return;
        }
        return;
      }
      // Uninstall typing stage
      if (action === "uninstall" && uninstallStage === "typing") {
        if (key.escape) { setUninstallStage("warning"); setUninstallTyped(""); return; }
        if (input === "k") { setUninstallKeepState(v => !v); return; }
        if (key.backspace || key.delete) { setUninstallTyped(s => s.slice(0, -1)); return; }
        if (key.return) {
          if (uninstallTyped === "UNINSTALL") {
            // Auto-backup first
            try { createBackup(); } catch {}
            const res = runUninstall(uninstallKeepState);
            setUninstallResult(res);
            setUninstallStage("done");
            setMessage("✓ Uninstall completed");
          }
          return;
        }
        if (input && input.length === 1 && /^[A-Za-z]$/.test(input) && uninstallTyped.length < 12) {
          setUninstallTyped(s => s + input.toUpperCase());
        }
        return;
      }
      // Disable confirm stage
      if (action === "disable" && disableResult) {
        if (key.return || input === " " || key.escape) {
          setDisableResult(null);
          setDisableConfirming(false);
          return;
        }
        return;
      }
      if (action === "disable" && disableConfirming) {
        if (input === "y") {
          const res = disableBuddy();
          setDisableResult(res);
          setMessage("✓ Buddy disabled");
          return;
        }
        if (input === "n" || key.escape) { setDisableConfirming(false); return; }
        return;
      }

      // Default navigation
      if (key.escape) setFocus("sidebar");
      if (input === "q") exit();
      if (key.upArrow) setSystemCursor(c => Math.max(0, c - 1));
      if (key.downArrow) setSystemCursor(c => Math.min(SYSTEM_ACTIONS.length - 1, c + 1));
      if (isSelect) {
        if (action === "enable") {
          setEnableRunning(true);
          setEnableResult(null);
          // Defer heavy execSync so the loading pane renders first
          setTimeout(() => {
            const res = runInstall();
            setEnableRunning(false);
            setEnableResult(res);
            setMessage(res.error ? "✗ Install failed" : "✓ Install completed");
          }, 50);
        } else if (action === "disable") {
          setDisableConfirming(true);
        } else if (action === "uninstall") {
          setUninstallStage("typing");
          setUninstallTyped("");
        }
      }
    }

    // ─── Edit: Settings value ───────────────
    else if (focus === "edit") {
      const def = SETTING_DEFS[settCursor];
      if (key.escape) { setNumInput(""); setFocus("list"); }

      if (def.type === "options") {
        if (key.upArrow) setOptCursor(c => Math.max(0, c - 1));
        if (key.downArrow) setOptCursor(c => Math.min(def.options!.length - 1, c + 1));
        if (isSelect) {
          const selected = def.options![optCursor];
          const val = selected === "true" ? true : selected === "false" ? false : selected;
          // Side-effect for statusLineEnabled: also patch settings.json
          if (def.key === "statusLineEnabled") {
            try {
              if (val === true) {
                const statusScript = join(PROJECT_ROOT, "statusline", "buddy-status.sh");
                setBuddyStatusLine(statusScript);
              } else {
                unsetBuddyStatusLine();
              }
            } catch (e: any) {
              setMessage(`✗ ${e?.message ?? "failed to patch settings.json"}`);
              setFocus("list");
              return;
            }
          }
          setConfig(saveConfig({ [def.key]: val }));
          setMessage(`✓ ${def.label} → ${selected}`);
          setFocus("list");
        }
      } else {
        if (input >= "0" && input <= "9" && numInput.length < 6) setNumInput(prev => prev + input);
        if (key.backspace || key.delete) setNumInput(prev => prev.slice(0, -1));
        if (key.return) {
          const clamped = Math.max(def.min ?? 0, Number.parseInt(numInput || "0", 10));
          setConfig(saveConfig({ [def.key]: clamped }));
          setMessage(`✓ ${def.label} → ${clamped}`);
          setNumInput("");
          setFocus("list");
        }
      }
    }
  });

  // ─── Build panes ────────────────────────────
  const showContent = focus !== "sidebar";
  let middlePane: React.ReactNode = null;
  let rightPane: React.ReactNode = null;

  if (showContent) {
    if (section === "menagerie") {
      middlePane = <BuddyListPane slots={slots} cursor={listCursor} activeSlot={activeSlot} focused={focus === "list"} searchTerm={menagSearch} />;
      if (personalityEditing) {
        // Editing: the right-pane card follows the cursor (slots[listCursor]),
        // and shows editablePersonality so typing updates live.
        const entry = slots[listCursor];
        if (entry) {
          rightPane = <BuddyCardPane
            companion={entry.companion}
            slot={entry.slot}
            isActive={entry.slot === activeSlot}
            editablePersonality={personalityInput}
            editCursor={personalityCursor}
          />;
        }
      } else {
        // Normal preview: cursor on edit button → show buddy above it
        const previewIdx = listCursor < slots.length ? listCursor : Math.max(0, slots.length - 1);
        if (slots[previewIdx]) {
          const { slot, companion } = slots[previewIdx];
          rightPane = <BuddyCardPane companion={companion} slot={slot} isActive={slot === activeSlot} />;
        }
      }
    } else if (section === "settings") {
      middlePane = <SettingsListPane cursor={settCursor} config={config} focused={focus === "list"} />;
      rightPane = <SettingDetailPane settingIndex={settCursor} config={config} editing={focus === "edit"} numInput={numInput} optCursor={optCursor} />;
    } else if (section === "achievements") {
      middlePane = <AchievementsListPane cursor={listCursor} unlockedIds={unlockedIds} focused={focus === "list"} rows={rows} />;
      if (ACHIEVEMENTS[listCursor]) {
        rightPane = <AchievementDetailPane
          achievement={ACHIEVEMENTS[listCursor]}
          unlockedIds={unlockedIds}
          unlocked={achData.unlocked}
          events={achData.events}
        />;
      }
    } else if (section === "verify") {
      middlePane = <VerifyPane userIdInput={verifyInput} editing={verifyEditing} preview={verifyPreview} buttonCursor={verifyButtonCursor} focused={focus === "list"} />;
      if (verifyPreview && !verifyEditing) {
        const syntheticCompanion: Companion = {
          bones: verifyPreview.bones,
          name: "Preview",
          personality: `A ${verifyPreview.bones.rarity} ${verifyPreview.bones.species} generated from user ID.`,
          hatchedAt: Date.now(),
          userId: verifyPreview.userId,
        };
        rightPane = <BuddyCardPane companion={syntheticCompanion} slot={verifyPreview.userId.slice(0, 8)} isActive={false} />;
      } else {
        rightPane = null;
      }
    } else if (section === "hunt") {
      if (huntPhase === "form" || huntPhase === "searching") {
        middlePane = <HuntFormPane criteria={huntCriteria} fieldCursor={huntFieldCursor} optCursors={huntOptCursors} focused={focus === "list" && huntPhase === "form"} />;
        rightPane = huntPhase === "searching"
          ? <HuntProgressPane checked={huntChecked} maxAttempts={huntMaxAttempts(huntCriteria.rarity, huntCriteria.shiny)} found={huntResults.length} />
          : null;
      } else if (huntPhase === "results") {
        middlePane = <HuntResultsPane results={huntResults} cursor={huntResultCursor} focused={focus === "list"} />;
        const selected = huntResults[huntResultCursor];
        if (selected) {
          const synthetic: Companion = {
            bones: selected.bones,
            name: "(unnamed)",
            personality: `A ${selected.bones.rarity} ${selected.bones.species} waiting for a name.`,
            hatchedAt: Date.now(),
            userId: selected.userId,
          };
          rightPane = <BuddyCardPane companion={synthetic} slot={selected.userId.slice(0, 8)} isActive={false} />;
        } else {
          rightPane = null;
        }
      } else if (huntPhase === "naming") {
        middlePane = <HuntResultsPane results={huntResults} cursor={huntResultCursor} focused={false} />;
        rightPane = <HuntNamingPane nameInput={huntNameInput} chosenBones={huntResults[huntResultCursor].bones} />;
      }
    } else if (section === "doctor") {
      middlePane = <DoctorListPane categories={diagData} cursor={listCursor} focused={focus === "list"} />;
      rightPane = diagData[listCursor] ? <DoctorDetailPane category={diagData[listCursor]} /> : null;
    } else if (section === "backup") {
      middlePane = <BackupListPane backups={backups} cursor={listCursor} focused={focus === "list"} />;
      rightPane = <BackupDetailPane backups={backups} cursor={listCursor} />;
    } else if (section === "system") {
      middlePane = <SystemListPane cursor={systemCursor} focused={focus === "list"} />;
      const action = SYSTEM_ACTIONS[systemCursor]?.key;
      if (action === "enable") {
        rightPane = <EnableDetailPane result={enableResult} running={enableRunning} />;
      } else if (action === "disable") {
        rightPane = <DisableConfirmPane result={disableResult} confirming={disableConfirming} />;
      } else if (action === "uninstall") {
        rightPane = <UninstallDetailPane
          stage={uninstallStage}
          typed={uninstallTyped}
          result={uninstallResult}
          keepState={uninstallKeepState}
        />;
      }
    }
  }

  // ─── Footer ─────────────────────────────────
  const helpText =
    focus === "sidebar" ? "↑↓ navigate  ⏎/␣ select  q quit" :
    focus === "edit" ? (SETTING_DEFS[settCursor]?.type === "options"
      ? "↑↓ navigate  ⏎/␣ confirm  esc back"
      : "type number  ⏎ confirm  esc back") :
    section === "menagerie" ? (
      personalityEditing
        ? "type edit  ←→ cursor  ↑↓ switch buddy  ⏎ save  esc discard+exit"
        : "type to filter  ↑↓ nav  ⏎ summon/edit  esc clear/back"
    ) :
    section === "achievements" ? "↑↓ navigate  esc back  q quit" :
    section === "verify" ? (verifyEditing ? "type hex  ⏎ generate  esc cancel" : "↑↓ nav  ⏎ activate  esc back") :
    section === "hunt" ? (
      huntPhase === "form" ? "↑↓ field  ⏎ cycle/start  esc back" :
      huntPhase === "searching" ? "esc cancel" :
      huntPhase === "results" ? "↑↓ pick  ⏎ choose  esc back" :
      "type name  ⏎ save  esc cancel"
    ) :
    section === "doctor" ? "↑↓ navigate  esc back  q quit" :
    section === "backup" ? "↑↓ navigate  ⏎/␣ select  d delete  esc back  q quit" :
    section === "system" ? (
      SYSTEM_ACTIONS[systemCursor]?.key === "uninstall" && uninstallStage === "typing"
        ? "type UNINSTALL  k toggle keep  ⏎ confirm  esc cancel"
        : SYSTEM_ACTIONS[systemCursor]?.key === "disable" && disableConfirming
        ? "y confirm disable  n cancel"
        : "↑↓ navigate  ⏎ activate  esc back"
    ) :
    "↑↓ navigate  ⏎/␣ select  esc back  q quit";

  return (
    <Box flexDirection="column" height={rows}>
      <Box>
        <Text color="cyan" bold>{"─ coding-buddy "}{"─".repeat(Math.max(0, cols - 17))}</Text>
      </Box>
      <Box flexGrow={1}>
        <Box width={sidebarWidth} flexDirection="column" borderStyle="single" borderColor={focus === "sidebar" ? "cyan" : "gray"}>
          <Sidebar cursor={sidebarCursor} section={section} focus={focus} />
        </Box>
        {showContent ? (
          <>
            <Box width={middleWidth} flexDirection="column" borderStyle="single" borderColor={focus === "list" ? "cyan" : "gray"}>
              {middlePane}
            </Box>
            <Box flexGrow={1} flexDirection="column" borderStyle="single" borderColor={focus === "edit" ? "cyan" : "gray"}>
              {rightPane}
            </Box>
          </>
        ) : (
          <Box flexGrow={1} flexDirection="column" borderStyle="single" borderColor="gray">
            <SidebarDescriptionPane cursor={sidebarCursor} />
          </Box>
        )}
      </Box>
      {message ? <Box><Text color="green" bold>{"  "}{message}</Text></Box> : null}
      <Box>
        <Text dimColor>{"─ "}{helpText}{" "}{"─".repeat(Math.max(0, cols - helpText.length - 4))}</Text>
      </Box>
    </Box>
  );
}

// ─── Entry ──────────────────────────────────────────────────────────────────

if (!process.stdin.isTTY) {
  console.error("coding-buddy tui requires an interactive terminal (TTY)");
  process.exit(1);
}

render(<App />);

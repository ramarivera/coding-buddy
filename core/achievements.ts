import type { UnlockedAchievement, GlobalCounters, SlotCounters, EventCounters } from "./model.ts";
export type { GlobalCounters, SlotCounters, EventCounters };


export const GLOBAL_KEYS: (keyof GlobalCounters)[] = [
  "errors_seen", "tests_failed", "large_diffs",
  "sessions", "commands_run", "days_active", "turns",
];

export const SLOT_KEYS: (keyof SlotCounters)[] = [
  "pets", "reactions_given",
];

export const COUNTER_KEYS: (keyof EventCounters)[] = [
  "errors_seen", "tests_failed", "large_diffs", "turns", "pets",
  "sessions", "reactions_given", "commands_run", "days_active",
];

export const EMPTY_GLOBAL: GlobalCounters = {
  errors_seen: 0, tests_failed: 0, large_diffs: 0,
  sessions: 0, commands_run: 0, days_active: 0, turns: 0,
};

export const EMPTY_SLOT: SlotCounters = {
  pets: 0, reactions_given: 0,
};

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  check: (events: EventCounters) => boolean;
  secret: boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first_steps",
    name: "First Steps",
    description: "Hatch your buddy for the first time",
    icon: "🌟",
    check: () => true,
    secret: false,
  },
  {
    id: "good_boy",
    name: "Good Buddy",
    description: "Pet your companion 10 times",
    icon: "🧹",
    check: (e) => e.pets >= 10,
    secret: false,
  },
  {
    id: "best_friend",
    name: "Best Friend",
    description: "Pet your companion 50 times",
    icon: "❤️",
    check: (e) => e.pets >= 50,
    secret: false,
  },
  {
    id: "bug_spotter",
    name: "Bug Spotter",
    description: "Witness your first error together",
    icon: "🐛",
    check: (e) => e.errors_seen >= 1,
    secret: false,
  },
  {
    id: "error_whisperer",
    name: "Error Whisperer",
    description: "Survive 25 errors as a team",
    icon: "🔧",
    check: (e) => e.errors_seen >= 25,
    secret: false,
  },
  {
    id: "battle_scarred",
    name: "Battle-Scarred",
    description: "Survive 100 errors together",
    icon: "💀",
    check: (e) => e.errors_seen >= 100,
    secret: true,
  },
  {
    id: "test_witness",
    name: "Test Witness",
    description: "See your first test failure",
    icon: "❌",
    check: (e) => e.tests_failed >= 1,
    secret: false,
  },
  {
    id: "test_veteran",
    name: "Test Veteran",
    description: "Witness 50 test failures",
    icon: "📊",
    check: (e) => e.tests_failed >= 50,
    secret: false,
  },
  {
    id: "big_mover",
    name: "Big Mover",
    description: "Make a diff with 80+ lines",
    icon: "📦",
    check: (e) => e.large_diffs >= 1,
    secret: false,
  },
  {
    id: "refactor_machine",
    name: "Refactor Machine",
    description: "Make 10 large diffs",
    icon: "🔨",
    check: (e) => e.large_diffs >= 10,
    secret: false,
  },
  {
    id: "chatterbox",
    name: "Chatterbox",
    description: "Your buddy reacts 100 times",
    icon: "💬",
    check: (e) => e.reactions_given >= 100,
    secret: false,
  },
  {
    id: "week_streak",
    name: "Week Streak",
    description: "Code with your buddy for 7 days",
    icon: "🔥",
    check: (e) => e.days_active >= 7,
    secret: false,
  },
  {
    id: "month_streak",
    name: "Month Streak",
    description: "Code with your buddy for 30 days",
    icon: "👑",
    check: (e) => e.days_active >= 30,
    secret: true,
  },
  {
    id: "power_user",
    name: "Power User",
    description: "Run 50 buddy commands",
    icon: "⚡",
    check: (e) => e.commands_run >= 50,
    secret: false,
  },
  {
    id: "dedicated",
    name: "Dedicated Companion",
    description: "Complete 200 turns together",
    icon: "🏅",
    check: (e) => e.turns >= 200,
    secret: false,
  },
  {
    id: "thousand_turns",
    name: "Thousand Turns",
    description: "Reach 1000 turns together",
    icon: "🎖",
    check: (e) => e.turns >= 1000,
    secret: true,
  },
];

export function getUnlockedAchievements(
  events: EventCounters,
  unlockedIds: Set<string>,
): Achievement[] {
  const newlyUnlocked: Achievement[] = [];
  for (const ach of ACHIEVEMENTS) {
    if (ach.id === "first_steps") continue;
    if (unlockedIds.has(ach.id)) continue;
    if (ach.check(events)) newlyUnlocked.push(ach);
  }
  return newlyUnlocked;
}

export function getCreationAchievements(
  _events: EventCounters,
  unlockedIds: Set<string>,
): Achievement[] {
  if (unlockedIds.has("first_steps")) return [];
  const first = ACHIEVEMENTS.find((ach) => ach.id === "first_steps");
  return first ? [first] : [];
}

export function isAchievementUnlocked(
  id: string,
  unlocked: UnlockedAchievement[],
): boolean {
  return unlocked.some((a) => a.id === id);
}

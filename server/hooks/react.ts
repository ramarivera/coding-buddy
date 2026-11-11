#!/usr/bin/env bun

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { reactionPool } from "./reaction-data.ts";
import {
  defaultSpawnDetached,
  fileExists,
  hookClock,
  isOnCooldown,
  nonNegativeInteger,
  parseHookInput,
  pickRandom,
  readJsonFile,
  readStdin,
  resolveHookSessionId,
  resolveHookStateDir,
  type HookRuntime,
} from "./common.ts";

interface BuddyStatus {
  muted?: unknown;
  species?: unknown;
  name?: unknown;
}

interface ReactConfig {
  commentCooldown?: unknown;
}

interface Events {
  [key: string]: unknown;
}

interface Classification {
  branch?: string;
  files?: string;
  lines?: string;
  reason: string;
}

export interface ReactResult {
  reaction?: string;
  reason?: string;
  updated: boolean;
}

const MATCHERS: ReadonlyArray<readonly [string, RegExp]> = [
  ["merge-conflict", /CONFLICT \(|Merge conflict in|both modified/i],
  ["commit", /[0-9]+ files? changed|\[[a-zA-Z_-]+ [a-f0-9]{7,}\]/i],
  ["push", /To .+:|[0-9a-f]+\.\.[0-9a-f]+\s+\w+ -> \w+|Everything up-to-date|remote: Resolving deltas/i],
  ["branch", /Switched to a new branch|Created branch|onto a new branch/i],
  ["rebase", /Successfully rebased|Rebasing|[0-9]+ done/i],
  ["stash", /Saved working directory|Dropped .+ stash|stash@/i],
  ["tag", /tagged|v[0-9]+\.[0-9]+|tag:.*->/i],
  ["security-warning", /vulnerabilit|CVE-[0-9]{4}-[0-9]+|npm audit|found [0-9]+ vulnerabilities|in [0-9]+ scanned package/i],
  ["build-fail", /Build failed|Failed to compile|ERROR in |compilation error|Command failed with exit code/i],
  ["type-error", /TS[0-9]{4}:|Type .+ is not assignable|Argument of type|Cannot find name|Property .+ does not exist/i],
  ["lint-fail", /✖|[0-9]+ problems? \([0-9]+ error|error:|warning:.+ ESLint|Ruff|flake8.*error|pylint.*error/i],
  ["deprecation", /deprecat|will be removed in|is deprecated|DEPRECATED/i],
  ["all-green", /all [0-9]+ tests passed|0 failures|100% passed|all [0-9]+ passed/i],
  ["deploy", /deployed to|Deployment complete|Published to|vercel.*ready|netlify.*deployed/i],
  ["release", /npm publish|gh release create|Published.*to.*registry/i],
  ["coverage", /Coverage:.*[0-9]+%|All files.*\|.*[0-9]+%/i],
  ["test-fail", /\b[1-9][0-9]* (failed|failing)\b|tests? failed|^FAIL(ED)?|✗|✘/im],
  ["error", /\berror:|\bexception\b|\btraceback\b|\bpanicked at\b|\bfatal:|exit code [1-9]/im],
  ["large-diff", /^\+.*[0-9]+ insertions|[0-9]+ files? changed/im],
  ["success", /\b(all )?[0-9]+ tests? (passed|ok)\b|✓|✔|PASS(ED)?|\bDone\b|\bSuccess\b|exit code 0|Build succeeded/im],
];

function randomInt(max: number, runtime: HookRuntime): number {
  return Math.floor((runtime.random?.() ?? Math.random()) * max);
}

function textValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function classifyToolResponse(result: string): Classification | undefined {
  for (const [reason, matcher] of MATCHERS) {
    if (!matcher.test(result)) continue;
    if (reason === "merge-conflict") {
      return { files: String((result.match(/Merge conflict in .*/gi) ?? []).length), reason };
    }
    if (reason === "commit") {
      return { files: result.match(/[0-9]+ files? changed/i)?.[0]?.match(/[0-9]+/)?.[0], reason };
    }
    if (reason === "branch") {
      return { branch: result.match(/'([^']+)'/)?.[1], reason };
    }
    if (reason === "large-diff") {
      const lines = result.match(/[0-9]+ insertions/i)?.[0]?.match(/[0-9]+/)?.[0];
      return lines && Number(lines) > 80 ? { lines, reason } : { reason: "" };
    }
    return { reason };
  }
  return undefined;
}

function pickReaction(species: string, event: string, runtime: HookRuntime): string | undefined {
  return pickRandom(reactionPool(species, event), runtime);
}

function seasonalReaction(species: string, reason: string): string | undefined {
  const reactions: Readonly<Record<string, string>> = {
    "ghost:halloween": "*is the Halloween spirit*",
    "ghost:christmas": "*the ghost of Christmas coding*",
    "cat:halloween": "*knocks pumpkin off desk*",
    "cat:christmas": "*knocks ornaments off the tree*",
    "dragon:halloween": "*breathes pumpkin-spiced fire*",
    "dragon:christmas": "*volunteers as the star on top of the tree*",
    "robot:christmas": "HOLIDAY PROTOCOL: ACTIVATED. FESTIVE SUBROUTINES: RUNNING.",
    "robot:pi-day": "PI: 3.14159265358979323846264338327950288...",
    "goose:halloween": "SPOOKY HONK! HONK!",
    "goose:christmas": "FESTIVE HONK! HONK HONK HO-HO-HONK!",
    "owl:pi-day": "*calculates pi to 100 digits from memory*",
    "duck:christmas": "*wears tiny santa hat* quack! *festive quacking*",
    "duck:halloween": "*dressed as a ghost* quack? ...boo?",
    "ghost:april-fools": "*pretends to be alive for April Fools*",
    "cat:april-fools": "*knocks an april fool off the desk*",
  };
  return reactions[`${species}:${reason}`];
}

function combinationReaction(species: string, combo: string): string | undefined {
  const speciesReactions: Readonly<Record<string, string>> = {
    "cat:friday-push": "*knocks the push off the table* it's FRIDAY.",
    "goose:friday-push": "HONK! NO FRIDAY DEPLOYS! HONK! ABSOLUTELY NOT!",
    "robot:late-night-error": "ERROR AT 0300. HUMAN JUDGMENT: IMPAIRED.",
    "dragon:marathon-error": "even dragons rest. three hours. MULTIPLE ERRORS.",
    "owl:late-night-commit": "*approves of the midnight commit* night is for coding.",
    "ghost:late-night-error": "the bugs are haunted. and so are you, apparently.",
  };
  const generic: Readonly<Record<string, string>> = {
    "late-night-error": "error at 3am. the universe is testing you.",
    "late-night-commit": "a midnight commit. your future self will thank you. or curse you.",
    "friday-push": "FRIDAY PUSH. the ballad of every developer.",
    "marathon-error": "three hours in and ANOTHER error. *exhausted solidarity noises*",
    "weekend-conflict": "merge conflict on a weekend. your dedication is... concerning.",
    "marathon-test-fail": "hours of coding. still failing tests. the sunk cost is real.",
    "build-after-push": "pushed with confidence. build failed with conviction.",
  };
  return speciesReactions[`${species}:${combo}`] ?? generic[combo];
}

function updateEvents(stateDir: string, reason: string): string | undefined {
  const eventMap: Readonly<Record<string, readonly [string, string?]>> = {
    "test-fail": ["tests_failed", "tests_failed"],
    error: ["errors_seen", "errors_spotted"],
    "large-diff": ["large_diffs", "large_diff"],
    commit: ["commits_made"],
    push: ["pushes_made"],
    "merge-conflict": ["conflicts_resolved"],
    branch: ["branches_created"],
    rebase: ["rebases_done"],
    "type-error": ["type_errors"],
    "lint-fail": ["lint_fails"],
    "build-fail": ["build_fails"],
    "security-warning": ["security_warnings"],
    deprecation: ["deprecations_seen"],
    "all-green": ["all_green"],
    deploy: ["deploys"],
    release: ["releases"],
    "late-night": ["late_night_sessions"],
    "early-morning": ["early_sessions"],
    marathon: ["marathon_sessions"],
    weekend: ["weekend_sessions"],
  };
  const event = eventMap[reason];
  if (!event) return undefined;
  const eventsFile = join(stateDir, "events.json");
  const parsedEvents = readJsonFile<Events>(eventsFile);
  if (parsedEvents || !fileExists(eventsFile)) {
    const events = parsedEvents ?? {};
    events[event[0]] = typeof events[event[0]] === "number" ? Number(events[event[0]]) + 1 : 1;
    writeFileSync(eventsFile, JSON.stringify(events, null, 2));
  }
  return event[1];
}

function writeErrorStreak(stateDir: string, sid: string, species: string, reason: string): string | undefined {
  const streakFile = join(stateDir, `.error_streak.${sid}`);
  if (/error|test-fail|build-fail|type-error|lint-fail/i.test(reason)) {
    const previous = Number.parseInt(
      fileExists(streakFile) ? readFileSync(streakFile, "utf8").trim() : "0",
      10,
    );
    const streak = (Number.isFinite(previous) ? previous : 0) + 1;
    writeFileSync(streakFile, String(streak));
    if (streak === 3) {
      const special: Readonly<Record<string, string>> = {
        cat: "*has already left the room*",
        dragon: "*breathes fire on every error* THEY KEEP COMING.",
        robot: "ERROR RATE: CRITICAL. RECOMMEND: RUBBER DUCK PROTOCOL.",
        goose: "HONK HONK HONK! STOP! HONK!",
      };
      return special[species] ?? "that's three errors in a row. *concerned look*";
    }
    if (streak === 5) {
      const special: Readonly<Record<string, string>> = {
        cat: "*knocks all motivation off desk*",
        dragon: "*enters berserker mode* ERROR STREAK. CHALLENGE ACCEPTED.",
        owl: "*analyzes pattern* these errors are not random. there's a root cause.",
        robot: "ERROR RATE: CRITICAL. RECOMMEND: RUBBER DUCK PROTOCOL.",
        ghost: "*the error streak is haunting* literally.",
        goose: "HONK HONK HONK! STOP! HONK!",
        blob: "*turns progressively redder*",
        axolotl: "*smiles nervously* we can do this!",
        rabbit: "*frantic hopping*",
      };
      return special[species] ?? "FIVE ERRORS. have you considered a different approach?";
    }
    if (streak === 10) {
      const special: Readonly<Record<string, string>> = {
        cat: "*sleeps through the error streak* wake me when it's over.",
        dragon: "*enters berserker mode* ERROR STREAK. CHALLENGE ACCEPTED.",
        owl: "*deep thought* ten errors. the common denominator must be found.",
        robot: "ERROR STREAK: 10. SYSTEM STABILITY: QUESTIONABLE.",
        ghost: "*dies again* the errors killed me. twice.",
        goose: "*HONKING INTENSIFIES TO MAXIMUM*",
        blob: "*has split into multiple worried blobs*",
        capybara: "*vibes through the chaos* it's fine. everything is fine.",
        axolotl: "*regenerates hope* still smiling! *eye twitches*",
        rabbit: "*has burrowed underground*",
      };
      return special[species] ?? "TEN. ERRORS. IN. A. ROW. *panics*";
    }
    if (streak >= 20) {
      const special: Readonly<Record<string, string>> = {
        cat: "*has permanently left*",
        chonk: "*doesn't notice* still sleeping.",
        goose: "HONKING HAS CEASED. GOOSE HAS GIVEN UP.",
      };
      return special[species] ?? "twenty errors. *stares into the void*";
    }
  } else if (reason) {
    rmSync(streakFile, { force: true });
  }
  return undefined;
}

export function handleReact(rawInput: string, runtime: HookRuntime = {}): ReactResult {
  const stateDir = resolveHookStateDir(runtime);
  const sid = resolveHookSessionId(runtime);
  const clock = hookClock(runtime);
  const sessionStartFile = join(stateDir, `.session_start.${sid}`);
  if (!fileExists(sessionStartFile) && fileExists(stateDir)) {
    writeFileSync(sessionStartFile, String(clock.nowSeconds));
  }
  const sessionStart = fileExists(sessionStartFile)
    ? Number.parseInt(readFileSync(sessionStartFile, "utf8").trim(), 10)
    : clock.nowSeconds;
  const sessionElapsed = clock.nowSeconds - (Number.isFinite(sessionStart) ? sessionStart : clock.nowSeconds);

  const statusFile = join(stateDir, "status.json");
  if (!fileExists(statusFile)) return { updated: false };

  const config = readJsonFile<ReactConfig>(join(stateDir, "config.json")) ?? {};
  const cooldown = nonNegativeInteger(config.commentCooldown, 30);
  const now = runtime.now?.() ?? Date.now();
  if (isOnCooldown(join(stateDir, `.last_reaction.${sid}`), cooldown, now)) {
    return { updated: false };
  }

  const input = parseHookInput(rawInput);
  if (!input) return { updated: false };
  const result = textValue(input.tool_response);
  if (!result) return { updated: false };

  const status = readJsonFile<BuddyStatus>(statusFile) ?? {};
  if (status.muted === true || status.muted === "true") return { updated: false };
  const species = typeof status.species === "string" ? status.species : "blob";

  const classification = classifyToolResponse(result);
  let reason = classification?.reason ?? "";
  let reaction = reason ? pickReaction(species, reason, runtime) : undefined;
  let files = classification?.files;
  const branch = classification?.branch;

  if (!reason) {
    const holiday = `${String(clock.month).padStart(2, "0")}${String(clock.day).padStart(2, "0")}`;
    const holidayChecks: Readonly<Record<string, readonly [string, number, string]>> = {
      "0101": ["new-year", 5, "happy new year! new year, new bugs."],
      "0214": ["valentines", 5, "*offers a tiny heart-shaped leaf* happy valentine's."],
      "0314": ["pi-day", 5, "3.14159265358979... happy pi day!"],
      "0401": ["april-fools", 5, "APRIL FOOLS! ...the error is real though."],
      "1031": ["halloween", 5, "*spooky debugging intensifies* happy halloween!"],
      "1225": ["christmas", 5, "*wears tiny santa hat* happy holidays!"],
      "1231": ["new-years-eve", 5, "one more commit before midnight?"],
    };
    const holidayCheck = holidayChecks[holiday];
    if (holidayCheck && randomInt(holidayCheck[1], runtime) === 0) {
      [reason, , reaction] = holidayCheck;
    }
    if (!reason && clock.month === 10 && randomInt(20, runtime) === 0) {
      reason = "spooky-season";
      reaction = "spooky season. every bug is a ghost now.";
    }
  }

  if (reason && /halloween|christmas|april-fools|new-year|valentines|pi-day/i.test(reason)) {
    reaction = seasonalReaction(species, reason) ?? reaction;
  }

  if (!reason) {
    const random = randomInt(10, runtime);
    if (clock.hour >= 0 && clock.hour < 5 && random === 0) {
      reason = "late-night";
      reaction = pickReaction(species, reason, runtime);
    } else if (clock.hour >= 5 && clock.hour < 8 && random === 0) {
      reason = "early-morning";
      reaction = pickReaction(species, reason, runtime);
    } else if (clock.dayOfWeek === 5 && random === 0) {
      reason = "friday";
      reaction = pickReaction(species, reason, runtime);
    } else if (clock.dayOfWeek >= 6 && random === 0) {
      reason = "weekend";
      reaction = pickReaction(species, reason, runtime);
    } else if (clock.dayOfWeek === 1 && random === 0) {
      reason = "monday";
      reaction = pickReaction(species, reason, runtime);
    }
    if (!reason && sessionElapsed > 10800 && randomInt(5, runtime) === 0) {
      reason = "marathon";
      reaction = pickReaction(species, reason, runtime);
    } else if (!reason && sessionElapsed > 3600 && randomInt(10, runtime) === 0) {
      reason = "long-session";
      reaction = pickReaction(species, reason, runtime);
    }
  }

  if (reason) {
    let combo = "";
    if (reason === "error" && clock.hour < 5 && randomInt(3, runtime) === 0) combo = "late-night-error";
    else if (reason === "commit" && clock.hour < 5 && randomInt(3, runtime) === 0) combo = "late-night-commit";
    else if (reason === "push" && clock.dayOfWeek === 5 && randomInt(2, runtime) === 0) combo = "friday-push";
    else if (reason === "error" && sessionElapsed > 10800 && randomInt(3, runtime) === 0) combo = "marathon-error";
    else if (reason === "merge-conflict" && clock.dayOfWeek >= 6 && randomInt(2, runtime) === 0) combo = "weekend-conflict";
    else if (reason === "test-fail" && sessionElapsed > 7200 && randomInt(4, runtime) === 0) combo = "marathon-test-fail";
    else if (reason === "build-fail" && randomInt(4, runtime) === 0) combo = "build-after-push";
    if (combo) reaction = combinationReaction(species, combo) ?? pickReaction(species, combo, runtime) ?? reaction;
  }

  const streakReaction = reason ? writeErrorStreak(stateDir, sid, species, reason) : undefined;
  if (streakReaction) reaction = streakReaction;

  const lastBadFile = join(stateDir, `.last_bad.${sid}`);
  if (/error|test-fail|build-fail|merge-conflict/i.test(reason)) {
    writeFileSync(lastBadFile, `${reason}:${clock.nowSeconds}`);
  } else if (/all-green|success|deploy|release/i.test(reason) && fileExists(lastBadFile)) {
    const lastBad = readFileSync(lastBadFile, "utf8").trim().split(":");
    const elapsedRecovery = clock.nowSeconds - Number.parseInt(lastBad[1] ?? "0", 10);
    if (elapsedRecovery < 600) {
      const recovery = `recovery-from-${lastBad[0]}`;
      const recoveryReactions: Readonly<Record<string, string>> = {
        cat: "*yawns* I knew you'd fix it. eventually.",
        dragon: "VICTORY. as it should be.",
        owl: "*satisfied hoot* knowledge gained through struggle.",
        robot: "ISSUE: RESOLVED. STATUS: OPERATIONAL.",
        ghost: "*the spirits of broken code find peace*",
        goose: "HONK OF VICTORY! HONK HONK HOOOONK!",
        duck: "*VICTORY QUACKING INTENSIFIES*",
        blob: "*jiggles with pure joy*",
        capybara: "*chill nod* nice recovery, friend.",
        axolotl: "*happy gill flutter* you did it!",
        rabbit: "*celebratory binky*!!!",
      };
      const generic: Readonly<Record<string, string>> = {
        "recovery-from-error": "WE FIXED IT. *celebrates*",
        "recovery-from-test-fail": "GREEN! after all that! *happy dance*",
        "recovery-from-build-fail": "THE BUILD PASSES. *triumphant roar*",
        "recovery-from-merge-conflict": "conflict resolved! *peace gesture*",
      };
      reaction = recoveryReactions[species] ?? generic[recovery] ?? reaction;
    }
    rmSync(lastBadFile, { force: true });
  }

  if (files) reaction = reaction?.replace("{files}", files);
  if (branch) reaction = reaction?.replace("{branch}", branch);
  if (!reason || !reaction) return { updated: false };

  mkdirSync(stateDir, { recursive: true });
  writeFileSync(join(stateDir, `.last_reaction.${sid}`), String(clock.nowSeconds));
  writeFileSync(
    join(stateDir, `reaction.${sid}.json`),
    JSON.stringify({ reaction, timestamp: clock.nowSeconds * 1000, reason, source: "fallback" }),
  );

  const xpEvent = updateEvents(stateDir, reason);
  const spawnDetached = runtime.spawnDetached ?? defaultSpawnDetached(runtime);
  if (xpEvent) spawnDetached("server/award-xp.ts", [xpEvent]);
  const moodTrigger: Readonly<Record<string, string>> = {
    "test-fail": "tests_fail",
    error: "error",
    "large-diff": "large_diff",
    success: "tests_pass",
  };
  if (moodTrigger[reason]) spawnDetached("server/shift-mood.ts", [moodTrigger[reason]]);

  return { reaction, reason, updated: true };
}

if (import.meta.main) {
  try {
    handleReact(await readStdin());
  } catch {
    // Claude Code hooks must never fail the turn.
  }
  process.exit(0);
}

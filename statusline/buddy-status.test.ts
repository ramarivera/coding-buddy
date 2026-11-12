import { afterEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { displayWidth } from "../server/art.ts";

const temporaryDirectories: string[] = [];
const statuslineScript = join(import.meta.dir, "buddy-status.sh");
const chromeReserve = Number(readFileSync(statuslineScript, "utf8").match(/^CHROME_RESERVE=([0-9]+)/m)?.[1] ?? 0);

function createStatuslineFixture(config: Record<string, unknown>) {
  const configDir = mkdtempSync(join(tmpdir(), "coding-buddy-substatus-"));
  temporaryDirectories.push(configDir);
  const stateDir = join(configDir, "buddy-state");
  mkdirSync(stateDir);
  writeFileSync(join(stateDir, "config.json"), JSON.stringify(config));
  writeFileSync(join(stateDir, "status.json"), JSON.stringify({
    name: "Nimbus",
    rarity: "common",
    stars: "",
    shiny: false,
    reaction: "",
    achievement: "",
    level: 1,
    mood: "focused",
    frames: ["  art"],
    frameSequence: [0],
  }));
  return { configDir, stateDir };
}

function runStatusline(
  configDir: string,
  input = "{}\n",
  columns = "80",
  envOverrides: Record<string, string> = {},
) {
  return spawnSync("bash", [statuslineScript], {
    env: {
      ...process.env,
      CLAUDE_CONFIG_DIR: configDir,
      CLAUDE_CODE_SESSION_ID: "",
      TMUX_PANE: "",
      BUDDY_STATUSLINE_ROWS: "50",
      BUDDY_STATUSLINE_COLS: columns,
        BUDDY_STATUSLINE_ROWS: "50",
      TERM: "xterm-256color",
      NO_COLOR: "",
      BUDDY_SHELL: "",
      ...envOverrides,
    },
    input,
    stdout: "pipe",
    stderr: "pipe",
  });
}

async function waitFor(condition: () => boolean, timeoutMs = 3000) {
  const attempts = Math.ceil(timeoutMs / 50);
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (condition()) return;
    await Bun.sleep(50);
  }
  throw new Error(`condition was not met within ${timeoutMs}ms`);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});
describe("buddy statusline colors", () => {
  test("uses rarity color for the name, stars, and sprite", () => {
    const configDir = mkdtempSync(join(tmpdir(), "coding-buddy-statusline-"));
    temporaryDirectories.push(configDir);
    const stateDir = join(configDir, "buddy-state");
    mkdirSync(stateDir);
    writeFileSync(join(stateDir, "config.json"), JSON.stringify({ theme: "dark" }));
    writeFileSync(join(stateDir, "status.json"), JSON.stringify({
      name: "Nimbus",
      rarity: "uncommon",
      stars: "★★",
      shiny: false,
      reaction: "",
      achievement: "",
      level: 1,
      mood: "focused",
      frames: ["  art\n (°°)"],
      frameSequence: [0],
    }));
    writeFileSync(join(stateDir, "reaction.default.json"), JSON.stringify({
      reaction: "colored *bubble [x]",
      timestamp: Date.now(),
    }));

    const result = Bun.spawnSync(["bash", join(import.meta.dir, "buddy-status.sh")], {
      env: {
        ...process.env,
        CLAUDE_CONFIG_DIR: configDir,
        CLAUDE_CODE_SESSION_ID: "",
        TMUX_PANE: "",
        BUDDY_FAKE_NOW: "0",
        BUDDY_STATUSLINE_COLS: "80",
        BUDDY_STATUSLINE_ROWS: "50",
        TERM: "xterm-256color",
        NO_COLOR: "",
        BUDDY_SHELL: "",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = result.stdout.toString();
    const green = "\x1b[38;2;78;186;101m";
    const greenLines = output.split("\n").filter((line) => line.includes(green));

    expect(result.exitCode).toBe(0);
    expect(greenLines.length).toBeGreaterThanOrEqual(2);
    expect(greenLines.some((line) => line.includes("Nimbus ★★"))).toBe(true);
    expect(greenLines.some((line) => line.includes("(°°)"))).toBe(true);
    expect(greenLines.some((line) => /\.[-]{4,}\./.test(line))).toBe(true);
    expect(output).toContain("colored *bubble [x]");
  });

  test.each([40, 60, 80, 120])("keeps the shared card inside %i columns", (columns) => {
    const { configDir, stateDir } = createStatuslineFixture({ reactionTTL: 900 });
    writeFileSync(join(stateDir, "status.json"), JSON.stringify({
      name: "Nimbus",
      rarity: "uncommon",
      stars: "★★",
      shiny: false,
      reaction: "",
      achievement: "milestone with 🏆🌈 wide emoji and enough words to wrap across multiple lines",
      level: 1,
      mood: "focused",
      frames: [" .----.\n(°  °)\n(    )\n `----'"],
      frameSequence: [0],
    }));
    writeFileSync(join(stateDir, "reaction.default.json"), JSON.stringify({
      reaction: "hello from buddy with several words and 🏆 wide emoji",
      timestamp: Date.now(),
    }));

    const result = runStatusline(configDir, "{}\n", String(columns));
    const plain = result.stdout.toString().replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
    const lines = plain.split("\n").filter(Boolean);

    expect(result.status).toBe(0);
    expect(lines.every((line) => line.length <= columns)).toBe(true);
    expect(result.stdout.toString().split("\n").filter(Boolean).every((line) => displayWidth(line) <= columns)).toBe(true);
    const budget = columns >= 40 ? Math.min(columns, Math.max(40, columns - chromeReserve)) : columns;
    expect(result.stdout.toString().split("\n").filter(Boolean).every((line) => displayWidth(line) <= budget)).toBe(true);
    expect(Math.max(...lines.map((line) => displayWidth(line)))).toBe(budget);
    const connectorLine = result.stdout.toString().split("\n").find((line) => line.includes("--"));
    expect(connectorLine).toContain("\x1b[38;2;78;186;101m");
    expect(lines.some((line) => /\|.*\|-- /.test(line))).toBe(true);
    expect(plain).toContain("Nimbus ★★");
  });

  test("honors a signed width adjustment and NO_COLOR", () => {
    const { configDir, stateDir } = createStatuslineFixture({
      reactionTTL: 900,
      statuslineWidthAdjust: -10,
    });
    writeFileSync(join(stateDir, "reaction.default.json"), JSON.stringify({
      reaction: "width override",
      timestamp: Date.now(),
    }));

    const result = runStatusline(configDir, "{}\n", "80", { NO_COLOR: "1" });
    const lines = result.stdout.toString().split("\n").filter(Boolean);

    expect(result.status).toBe(0);
    expect(lines.every((line) => displayWidth(line) <= 56)).toBe(true);
  });

  test("BUDDY_STATUSLINE_COLS wins over exported COLUMNS", () => {
    const { configDir, stateDir } = createStatuslineFixture({ reactionTTL: 900 });
    writeFileSync(join(stateDir, "status.json"), JSON.stringify({
      name: "Nimbus",
      rarity: "uncommon",
      stars: "★★",
      shiny: false,
      reaction: "",
      achievement: "milestone with 🏆🌈 wide emoji and enough words to wrap across multiple lines",
      level: 1,
      mood: "focused",
      frames: [" .----.\n(°  °)\n(    )\n `----'"],
      frameSequence: [0],
    }));
    writeFileSync(join(stateDir, "reaction.default.json"), JSON.stringify({
      reaction: "hello from buddy with several words and 🏆 wide emoji",
      timestamp: Date.now(),
    }));

    const result = runStatusline(configDir, "{}\n", "60", { COLUMNS: "200" });
    const lines = result.stdout.toString().split("\n").filter(Boolean);

    expect(result.status).toBe(0);
    expect(lines.every((line) => displayWidth(line) <= 46)).toBe(true);
  });

  test("exported COLUMNS wins over a wider controlling PTY", () => {
    const { configDir, stateDir } = createStatuslineFixture({ reactionTTL: 900 });
    writeFileSync(join(stateDir, "status.json"), JSON.stringify({
      name: "Nimbus",
      rarity: "uncommon",
      stars: "★★",
      shiny: false,
      reaction: "",
      achievement: "milestone with 🏆🌈 wide emoji and enough words to wrap across multiple lines",
      level: 1,
      mood: "focused",
      frames: [" .----.\n(°  °)\n(    )\n `----'"],
      frameSequence: [0],
    }));
    writeFileSync(join(stateDir, "reaction.default.json"), JSON.stringify({
      reaction: "hello from buddy with several words and 🏆 wide emoji",
      timestamp: Date.now(),
    }));

    const env = {
      ...process.env,
      CLAUDE_CONFIG_DIR: configDir,
      CLAUDE_CODE_SESSION_ID: "",
      TMUX_PANE: "",
      BUDDY_FAKE_NOW: "0",
      BUDDY_STATUSLINE_COLS: process.stdin.isTTY ? "" : "60",
        BUDDY_STATUSLINE_ROWS: "50",
      COLUMNS: "60",
      TERM: "xterm-256color",
      LC_ALL: "C",
      NO_COLOR: "",
      BUDDY_SHELL: "",
    };
    const result = process.stdin.isTTY
      ? spawnSync("script", ["-q", "/dev/null", "bash", "-c", `stty cols 120 rows 24; bash ${statuslineScript} </dev/null`], {
        env,
        stdio: ["inherit", "pipe", "pipe"],
      })
      : spawnSync("bash", [statuslineScript], {
        env,
        input: "{}\n",
        stdout: "pipe",
        stderr: "pipe",
      });
    const lines = result.stdout.toString()
      .replace(/\r/g, "")
      .replace(/\^D/g, "")
      .replace(/\x08/g, "")
      .split("\n")
      .filter(Boolean);

    expect(result.status).toBe(0);
    expect(lines.every((line) => displayWidth(line) <= 46)).toBe(true);
  });

  test("invalid BUDDY_STATUSLINE_COLS values are ignored and fall through", () => {
    const { configDir, stateDir } = createStatuslineFixture({ reactionTTL: 900 });
    writeFileSync(join(stateDir, "status.json"), JSON.stringify({
      name: "Nimbus",
      rarity: "uncommon",
      stars: "★★",
      shiny: false,
      reaction: "",
      achievement: "milestone with 🏆🌈 wide emoji and enough words to wrap across multiple lines",
      level: 1,
      mood: "focused",
      frames: [" .----.\n(°  °)\n(    )\n `----'"],
      frameSequence: [0],
    }));
    writeFileSync(join(stateDir, "reaction.default.json"), JSON.stringify({
      reaction: "hello from buddy with several words and 🏆 wide emoji",
      timestamp: Date.now(),
    }));

    for (const override of ["0", "abc"]) {
      const result = runStatusline(configDir, "{}\n", "60", {
        BUDDY_STATUSLINE_COLS: override,
        BUDDY_STATUSLINE_ROWS: "50",
        COLUMNS: "60",
      });
      const lines = result.stdout.toString().split("\n").filter(Boolean);

      expect(result.status).toBe(0);
      expect(lines.every((line) => displayWidth(line) <= 46)).toBe(true);
    }
  });

  test("drops the shell bubble and tail when the panel is narrow", () => {
    const { configDir, stateDir } = createStatuslineFixture({ reactionTTL: 900 });
    writeFileSync(join(stateDir, "reaction.default.json"), JSON.stringify({
      reaction: "hello from buddy",
      timestamp: Date.now(),
    }));

    const result = runStatusline(configDir, "{}\n", "24");
    const plain = result.stdout.toString().replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
    const lines = plain.split("\n").filter(Boolean);

    expect(result.status).toBe(0);
    expect(lines.every((line) => line.length <= 24)).toBe(true);
    expect(lines.some((line) => /\|.*\|-- /.test(line))).toBe(false);
    expect(plain).not.toMatch(/^ *\.[-]{12,}\.$/m);
  });

  test("expires stale reactions and sweeps per-session reaction files", () => {
    const { configDir, stateDir } = createStatuslineFixture({ reactionTTL: 30 });
    const staleReaction = join(stateDir, "reaction.default.json");
    const staleComment = join(stateDir, ".last_comment.default");
    writeFileSync(staleReaction, JSON.stringify({
      reaction: "stale reaction",
      timestamp: Date.now() - 60_000,
    }));
    writeFileSync(staleComment, String(Math.floor(Date.now() / 1000) - 60));

    const result = runStatusline(configDir);
    const output = result.stdout.toString();

    expect(result.status).toBe(0);
    expect(output).not.toContain("stale reaction");
    expect(existsSync(staleReaction)).toBe(false);
    expect(existsSync(staleComment)).toBe(false);
    expect(output).not.toMatch(/^ *\.[-]{12,}\.$/m);
  });

  test("uses a finite default TTL while honoring zero as permanent", () => {
    const defaultFixture = createStatuslineFixture({});
    const defaultReaction = join(defaultFixture.stateDir, "reaction.default.json");
    writeFileSync(defaultReaction, JSON.stringify({
      reaction: "default stale reaction",
      timestamp: Date.now() - 901_000,
    }));

    const defaultResult = runStatusline(defaultFixture.configDir);
    expect(defaultResult.stdout.toString()).not.toContain("default stale reaction");
    expect(existsSync(defaultReaction)).toBe(false);

    const permanentFixture = createStatuslineFixture({ reactionTTL: 0 });
    const permanentReaction = join(permanentFixture.stateDir, "reaction.default.json");
    writeFileSync(permanentReaction, JSON.stringify({
      reaction: "permanent reaction",
      timestamp: Date.now() - 901_000,
    }));

    const permanentResult = runStatusline(permanentFixture.configDir);
    expect(permanentResult.stdout.toString()).toContain("permanent reaction");
    expect(existsSync(permanentReaction)).toBe(true);
  });
});

describe("buddy sub-status cache", () => {
  test("returns immediately and refreshes the cache with the same stdin payload", async () => {
    const { configDir, stateDir } = createStatuslineFixture({
      subStatusCommand: "sleep 1; cat",
    });

    const input = '{"payload":"same-input"}\n';
    const started = performance.now();
    const first = runStatusline(configDir, input);
    const elapsedMs = performance.now() - started;

    expect(first.status).toBe(0);
    // Includes launching a fresh bash process; the one-second sub-command is
    // intentionally not part of this wall-clock measurement.
    expect(elapsedMs).toBeLessThan(1500);
    expect(existsSync(join(stateDir, ".substatus.default"))).toBe(false);

    for (let attempt = 0; attempt < 30; attempt++) {
      if (Bun.file(join(stateDir, ".substatus.default")).size > 0) break;
      await Bun.sleep(100);
    }

    expect(readFileSync(join(stateDir, ".substatus.default"), "utf8").trim()).toBe(input.trim());
    await Bun.sleep(200);
    const second = runStatusline(configDir, input);

    expect(second.stdout.toString()).toContain(input.trim());
  });

  test("uses one temp path and cleans it up after a failed refresh", async () => {
    const { configDir, stateDir } = createStatuslineFixture({
      subStatusCommand: "sleep 1; exit 1",
    });
    const tempFile = join(stateDir, ".substatus.default.tmp");
    const lockDir = join(stateDir, ".substatus.default.lock");

    expect(runStatusline(configDir).status).toBe(0);
    await waitFor(() => existsSync(tempFile));
    expect(readdirSync(stateDir).filter((name) => name.startsWith(".substatus.default.")).sort())
      .toEqual([".substatus.default.lock", ".substatus.default.tmp"]);

    await waitFor(() => !existsSync(tempFile) && !existsSync(lockDir));
    expect(existsSync(tempFile)).toBe(false);
    expect(readdirSync(stateDir).filter((name) => name.startsWith(".substatus.default.")).sort())
      .toEqual([]);
  });

  test("sweeps old temp files without deleting the cache or lock", async () => {
    const { configDir, stateDir } = createStatuslineFixture({});
    const cacheFile = join(stateDir, ".substatus.default");
    const staleTemp = join(stateDir, ".substatus.default.old");
    const lockDir = join(stateDir, ".substatus.default.lock");
    const sweepLock = join(stateDir, ".substatus-sweep.default.lock");
    const oldDate = new Date(Date.now() - 2 * 60 * 60 * 1000);

    writeFileSync(cacheFile, "cached\n");
    writeFileSync(staleTemp, "orphan\n");
    mkdirSync(lockDir);
    mkdirSync(sweepLock);
    utimesSync(staleTemp, oldDate, oldDate);
    utimesSync(sweepLock, oldDate, oldDate);

    expect(runStatusline(configDir).status).toBe(0);
    await waitFor(() => !existsSync(staleTemp));
    await waitFor(() => !existsSync(sweepLock));
    expect(existsSync(staleTemp)).toBe(false);
    expect(readFileSync(cacheFile, "utf8")).toBe("cached\n");
    expect(existsSync(lockDir)).toBe(true);
  });

  test("truncates cached sub-status rows to the adjusted budget", () => {
    const { configDir, stateDir } = createStatuslineFixture({
      reactionTTL: 900,
      subStatusCommand: "printf ignored",
    });
    writeFileSync(join(stateDir, "reaction.default.json"), JSON.stringify({
      reaction: "cached-bubble reaction 🏆 with enough words to wrap",
      timestamp: Date.now(),
    }));
    const cacheFile = join(stateDir, ".substatus.default");
    writeFileSync(cacheFile, "\u00a0[Timeout]\u00a0\uE0B0\u00a0💰\u00a0$143.14\u00a0session\u00a0\uE0B0\u00a0⏰\u00a04h\u00a054m\u00a0left\n");

    const result = runStatusline(configDir, "{}\n", "60");
    const lines = result.stdout.toString().split("\n").filter(Boolean);
    expect(result.stdout.toString()).toContain("cached-bubble");
    expect(result.stdout.toString()).toContain("reaction 🏆");

    expect(result.status).toBe(0);
    expect(lines.every((line) => displayWidth(line) <= 46)).toBe(true);
  });

  test("uses the 15-second default and honors a numeric TTL override", async () => {
    const { configDir, stateDir } = createStatuslineFixture({
      subStatusCommand: "printf refreshed",
      subStatusRefreshSeconds: "invalid",
    });
    const cacheFile = join(stateDir, ".substatus.default");
    const oldDate = new Date(Date.now() - 10 * 1000);
    writeFileSync(cacheFile, "cached\n");
    utimesSync(cacheFile, oldDate, oldDate);

    expect(runStatusline(configDir).status).toBe(0);
    await Bun.sleep(200);
    expect(readFileSync(cacheFile, "utf8")).toBe("cached\n");

    writeFileSync(join(stateDir, "config.json"), JSON.stringify({
      subStatusCommand: "printf refreshed",
      subStatusRefreshSeconds: 5,
    }));
    expect(runStatusline(configDir).status).toBe(0);
    await waitFor(() => readFileSync(cacheFile, "utf8") === "refreshed");
  });
});

describe("statusline density", () => {
  function createDensityFixture(
    density: string,
    overrides: Record<string, unknown> = {},
    statusOverrides: Record<string, unknown> = {},
  ) {
    const { configDir, stateDir } = createStatuslineFixture({
      statuslineDensity: density,
      ...overrides,
    });
    writeFileSync(join(stateDir, "status.json"), JSON.stringify({
      name: "Nimbus",
      rarity: "common",
      stars: "",
      shiny: false,
      reaction: (statusOverrides.reaction as string) ?? "",
      achievement: "",
      level: 1,
      mood: "focused",
      frames: statusOverrides.frames ?? ["l0\nl1\nl2\nl3\nl4"],
      compactFrames: statusOverrides.compactFrames ?? ["c0\nc1\nc2"],
      minimalFrames: statusOverrides.minimalFrames ?? ["face"],
      frameSequence: [0],
    }));
    return { configDir, stateDir };
  }


  test("auto tier selects full when rows >= 40", () => {
    const { configDir } = createDensityFixture("auto");
    const result = runStatusline(configDir, "{}\n", "80", { BUDDY_STATUSLINE_ROWS: "50" });
    expect(result.status).toBe(0);
    expect(result.stdout.toString().split("\n").filter((line) => line.trim().length > 0).length).toBeGreaterThanOrEqual(6);
    expect(result.stdout.toString()).toContain("Nimbus");
  });

  test("auto tier selects compact when rows are 20-39", () => {
    const { configDir } = createDensityFixture("auto");
    const result = runStatusline(configDir, "{}\n", "80", { BUDDY_STATUSLINE_ROWS: "30" });
    expect(result.status).toBe(0);
    expect(result.stdout.toString().split("\n").filter((line) => line.trim().length > 0).length).toBe(4);
    expect(result.stdout.toString()).toContain("Nimbus");
  });

  test("auto tier selects minimal when rows < 20", () => {
    const { configDir } = createDensityFixture("auto");
    const result = runStatusline(configDir, "{}\n", "80", { BUDDY_STATUSLINE_ROWS: "10" });
    expect(result.status).toBe(0);
    expect(result.stdout.toString().split("\n").filter((line) => line.trim().length > 0).length).toBe(1);
    expect(result.stdout.toString()).toContain("Nimbus");
  });

  test("auto tier selects minimal for very narrow terminal width", () => {
    const { configDir } = createDensityFixture("auto");
    const result = runStatusline(configDir, "{}\n", "30", { BUDDY_STATUSLINE_ROWS: "50" });
    expect(result.status).toBe(0);
    expect(result.stdout.toString().split("\n").filter((line) => line.trim().length > 0).length).toBe(1);
    expect(result.stdout.toString()).toContain("Nimbus");
  });

  test("BUDDY_STATUSLINE_ROWS overrides PTY rows and pins compact", () => {
    const { configDir } = createDensityFixture("auto");
    const result = runStatusline(configDir, "{}\n", "80", { BUDDY_STATUSLINE_ROWS: "25" });
    expect(result.status).toBe(0);
    expect(result.stdout.toString().split("\n").filter((line) => line.trim().length > 0).length).toBe(4);
  });

  test("explicit full overrides row-driven minimal", () => {
    const { configDir } = createDensityFixture("full");
    const result = runStatusline(configDir, "{}\n", "80", { BUDDY_STATUSLINE_ROWS: "10" });
    expect(result.status).toBe(0);
    expect(result.stdout.toString().split("\n").filter((line) => line.trim().length > 0).length).toBeGreaterThanOrEqual(6);
  });

  test("explicit compact overrides row-driven full", () => {
    const { configDir } = createDensityFixture("compact");
    const result = runStatusline(configDir, "{}\n", "80", { BUDDY_STATUSLINE_ROWS: "50" });
    expect(result.status).toBe(0);
    expect(result.stdout.toString().split("\n").filter((line) => line.trim().length > 0).length).toBe(4);
  });

  test("explicit minimal overrides row-driven full", () => {
    const { configDir } = createDensityFixture("minimal");
    const result = runStatusline(configDir, "{}\n", "80", { BUDDY_STATUSLINE_ROWS: "50" });
    expect(result.status).toBe(0);
    expect(result.stdout.toString().split("\n").filter((line) => line.trim().length > 0).length).toBe(1);
  });

  test("invalid density config falls back to auto behavior", () => {
    const { configDir } = createDensityFixture("banana");
    const result = runStatusline(configDir, "{}\n", "80", { BUDDY_STATUSLINE_ROWS: "30" });
    expect(result.status).toBe(0);
    expect(result.stdout.toString().split("\n").filter((line) => line.trim().length > 0).length).toBe(4);
  });

  test("minimal shows reaction only when it fits", () => {
    const { configDir, stateDir } = createDensityFixture("minimal", {}, {
      minimalFrames: ["(°°)"],
    });
    writeFileSync(join(stateDir, "reaction.default.json"), JSON.stringify({
      reaction: "long-reaction-text",
      timestamp: 9999999999999,
      reason: "tool",
    }));
    const wide = runStatusline(configDir, "{}\n", "80", { BUDDY_STATUSLINE_ROWS: "10" });
    expect(wide.stdout.toString()).toContain("long-reaction-text");

    const narrow = runStatusline(configDir, "{}\n", "20", { BUDDY_STATUSLINE_ROWS: "10" });
    expect(narrow.stdout.toString()).toContain("Nimbus");
    expect(narrow.stdout.toString()).not.toContain("long-reaction-text");
  });
});

describe("achievement banner expiry", () => {
  function writeStatus(stateDir: string, extra: Record<string, unknown>) {
    writeFileSync(join(stateDir, "status.json"), JSON.stringify({
      name: "Nimbus",
      rarity: "common",
      stars: "★",
      shiny: false,
      reaction: "",
      level: 1,
      mood: "focused",
      frames: ["  art"],
      frameSequence: [0],
      ...extra,
    }));
  }

  test("shows a freshly awarded achievement", () => {
    const { configDir, stateDir } = createStatuslineFixture({ reactionTTL: 900 });
    writeStatus(stateDir, { achievement: "🕊️ Diplomat", achievementAt: Date.now() });

    const result = runStatusline(configDir);

    expect(result.status).toBe(0);
    expect(result.stdout.toString()).toContain("Diplomat");
  });

  test("drops an achievement older than the reaction TTL", () => {
    const { configDir, stateDir } = createStatuslineFixture({ reactionTTL: 900 });
    writeStatus(stateDir, {
      achievement: "🕊️ Diplomat",
      achievementAt: Date.now() - 901_000,
    });

    const result = runStatusline(configDir);

    expect(result.status).toBe(0);
    expect(result.stdout.toString()).not.toContain("Diplomat");
  });

  test("does not render a banner when achievementAt is zeroed", () => {
    const { configDir, stateDir } = createStatuslineFixture({ reactionTTL: 900 });
    writeStatus(stateDir, { achievement: "🕊️ Diplomat", achievementAt: 0 });

    const result = runStatusline(configDir);

    expect(result.status).toBe(0);
    expect(result.stdout.toString()).not.toContain("Diplomat");
  });

  test("never renders a zeroed achievementAt even when reactionTTL disables expiry", () => {
    const { configDir, stateDir } = createStatuslineFixture({ reactionTTL: 0 });
    writeStatus(stateDir, { achievement: "\u{1F54A}\uFE0F Diplomat", achievementAt: 0 });

    const result = runStatusline(configDir);

    expect(result.status).toBe(0);
    expect(result.stdout.toString()).not.toContain("Diplomat");
  });

  test("reactionTTL=0 keeps a validly stamped achievement from expiring", () => {
    const { configDir, stateDir } = createStatuslineFixture({ reactionTTL: 0 });
    writeStatus(stateDir, {
      achievement: "\u{1F54A}\uFE0F Diplomat",
      achievementAt: Date.now() - 86_400_000,
    });

    const result = runStatusline(configDir);

    expect(result.status).toBe(0);
    expect(result.stdout.toString()).toContain("Diplomat");
  });

  test("treats a legacy status.json without achievementAt as fresh", () => {
    const { configDir, stateDir } = createStatuslineFixture({ reactionTTL: 900 });
    writeStatus(stateDir, { achievement: "🕊️ Diplomat" });

    const result = runStatusline(configDir);

    expect(result.status).toBe(0);
    expect(result.stdout.toString()).toContain("Diplomat");
  });
});

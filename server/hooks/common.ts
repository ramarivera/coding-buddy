import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { buddyStateDir } from "../path.ts";

export type JsonObject = Record<string, unknown>;

export interface HookRuntime {
  clock?: () => HookClock;
  now?: () => number;
  packageRoot?: string;
  random?: () => number;
  sessionId?: string;
  spawnDetached?: (script: string, args: string[]) => void;
  stateDir?: string;
}

export interface HookClock {
  day: number;
  dayOfWeek: number;
  hour: number;
  month: number;
  nowSeconds: number;
}

export function parseHookInput(raw: string): JsonObject | null {
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as JsonObject
      : null;
  } catch {
    return null;
  }
}

export function stringField(input: JsonObject, field: string): string {
  const value = input[field];
  return typeof value === "string" ? value : "";
}

export function resolveHookStateDir(runtime: HookRuntime = {}): string {
  return runtime.stateDir ?? buddyStateDir();
}

export function resolveHookSessionId(runtime: HookRuntime = {}): string {
  if (runtime.sessionId) return runtime.sessionId;
  const ccSid = process.env.CLAUDE_CODE_SESSION_ID;
  if (ccSid) return ccSid.slice(0, 8);
  const pane = process.env.TMUX_PANE;
  if (pane) return pane.replace(/^%/, "");
  return "default";
}

export function readJsonFile<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export function nonNegativeInteger(value: unknown, fallback: number): number {
  if (Number.isInteger(value) && Number(value) >= 0) return Number(value);
  if (typeof value === "string" && /^[0-9]+$/.test(value)) return Number(value);
  return fallback;
}

export function randomIndex(length: number, runtime: HookRuntime = {}): number {
  return Math.floor((runtime.random?.() ?? Math.random()) * length);
}

export function pickRandom<T>(values: readonly T[], runtime: HookRuntime = {}): T | undefined {
  if (values.length === 0) return undefined;
  return values[randomIndex(values.length, runtime)];
}

export function hookClock(runtime: HookRuntime = {}): HookClock {
  if (runtime.clock) return runtime.clock();
  const nowMs = runtime.now?.() ?? Date.now();
  const date = new Date(nowMs);
  const jsDay = date.getDay();
  return {
    day: date.getDate(),
    dayOfWeek: jsDay === 0 ? 7 : jsDay,
    hour: date.getHours(),
    month: date.getMonth() + 1,
    nowSeconds: Math.floor(nowMs / 1000),
  };
}

export function isOnCooldown(path: string, cooldownSeconds: number, nowMs: number): boolean {
  try {
    const last = Number.parseInt(readFileSync(path, "utf8").trim(), 10);
    if (!Number.isFinite(last)) return false;
    return Math.floor(nowMs / 1000) - last < cooldownSeconds;
  } catch {
    return false;
  }
}

export function packageRootFromHooks(): string {
  return resolve(import.meta.dir, "..", "..");
}

export function defaultSpawnDetached(runtime: HookRuntime = {}): (script: string, args: string[]) => void {
  return (script, args) => {
    const root = runtime.packageRoot ?? packageRootFromHooks();
    const child = spawn(process.execPath, ["run", join(root, script), ...args], {
      cwd: root,
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  };
}

export function fileExists(path: string): boolean {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

export async function readStdin(): Promise<string> {
  return await Bun.stdin.text();
}

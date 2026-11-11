import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PiBuddyStorage, DEFAULT_PI_BUDDY_STATE_DIR } from "./storage.ts";
import { OmpBuddyStorage, DEFAULT_OMP_BUDDY_STATE_DIR } from "../omp/storage.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Pi host storage root", () => {
  test("defaults to a distinct host-owned .pi/agent/buddy directory", () => {
    expect(DEFAULT_PI_BUDDY_STATE_DIR.endsWith(join(".pi", "agent", "buddy"))).toBe(true);
    expect(DEFAULT_PI_BUDDY_STATE_DIR).not.toBe(DEFAULT_OMP_BUDDY_STATE_DIR);
  });

  test("reuses file storage behavior without sharing host state", () => {
    const parent = mkdtempSync(join(tmpdir(), "pi-host-storage-"));
    temporaryDirectories.push(parent);
    const piRoot = join(parent, "pi");
    const ompRoot = join(parent, "omp");
    const piStorage = new PiBuddyStorage(piRoot);
    const ompStorage = new OmpBuddyStorage(ompRoot);

    piStorage.setMuted(true);
    ompStorage.setMuted(false);

    expect(piStorage.isMuted()).toBe(true);
    expect(ompStorage.isMuted()).toBe(false);
    expect(existsSync(join(piRoot, "config.json"))).toBe(true);
    expect(existsSync(join(ompRoot, "config.json"))).toBe(true);
  });
});

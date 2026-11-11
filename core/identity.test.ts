import { afterEach, describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { OmpBuddyStorage } from "../adapters/omp/storage.ts";
import { PiBuddyStorage } from "../adapters/pi/storage.ts";
import { buddyStateDir } from "../server/path.ts";
import { configuredSharedUserId, sharedStateDir } from "./identity.ts";

const originalUserId = process.env.CODING_BUDDY_USER_ID;
const originalStateDir = process.env.CODING_BUDDY_STATE_DIR;

afterEach(() => {
  if (originalUserId === undefined) delete process.env.CODING_BUDDY_USER_ID;
  else process.env.CODING_BUDDY_USER_ID = originalUserId;
  if (originalStateDir === undefined) delete process.env.CODING_BUDDY_STATE_DIR;
  else process.env.CODING_BUDDY_STATE_DIR = originalStateDir;
});

describe("shared identity", () => {
  test("stays disabled by default", () => {
    delete process.env.CODING_BUDDY_USER_ID;
    expect(configuredSharedUserId()).toBeUndefined();
    expect(sharedStateDir()).toBeUndefined();
  });

  test("uses the opt-in id and shared state root", () => {
    process.env.CODING_BUDDY_USER_ID = "shared-user";
    delete process.env.CODING_BUDDY_STATE_DIR;
    expect(configuredSharedUserId()).toBe("shared-user");
    expect(sharedStateDir()).toBe(join(homedir(), ".coding-buddy", "shared"));
  });

  test("honors an explicit shared state root", () => {
    process.env.CODING_BUDDY_USER_ID = "shared-user";
    process.env.CODING_BUDDY_STATE_DIR = "/tmp/coding-buddy-shared";
    expect(sharedStateDir()).toBe("/tmp/coding-buddy-shared");
  });

  test("routes every adapter through the shared state root", () => {
    process.env.CODING_BUDDY_USER_ID = "shared-user";
    process.env.CODING_BUDDY_STATE_DIR = "/tmp/coding-buddy-shared";
    expect(new PiBuddyStorage().stateDir).toBe("/tmp/coding-buddy-shared");
    expect(new OmpBuddyStorage().stateDir).toBe("/tmp/coding-buddy-shared");
    expect(buddyStateDir()).toBe("/tmp/coding-buddy-shared");
  });
});

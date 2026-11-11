import { afterAll, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { _resetCustomSkinCache, loadCustomSkins, skinFor } from "./custom-art.ts";

const root = mkdtempSync(join(tmpdir(), "buddy-skin-"));
const prev = process.env.CLAUDE_CONFIG_DIR;
const prevUser = process.env.CODING_BUDDY_USER_ID;
const prevState = process.env.CODING_BUDDY_STATE_DIR;
process.env.CLAUDE_CONFIG_DIR = root;
// Shared-state mode would bypass CLAUDE_CONFIG_DIR; keep tests isolated.
delete process.env.CODING_BUDDY_USER_ID;
delete process.env.CODING_BUDDY_STATE_DIR;
const dir = join(root, "buddy-state", "custom-art");
mkdirSync(dir, { recursive: true });
const skin = (name: string, species = "cat", face = "({E}v{E})") =>
  JSON.stringify({ name, species, face, art: [0, 1, 2].map(() => ["", " {E} ", "", "", ""]) });

beforeEach(() => _resetCustomSkinCache());
afterAll(() => {
  if (prev === undefined) delete process.env.CLAUDE_CONFIG_DIR;
  else process.env.CLAUDE_CONFIG_DIR = prev;
  if (prevUser !== undefined) process.env.CODING_BUDDY_USER_ID = prevUser;
  if (prevState !== undefined) process.env.CODING_BUDDY_STATE_DIR = prevState;
  rmSync(root, { recursive: true, force: true });
});

test("skips skins named after built-in species", () => {
  writeFileSync(join(dir, "cat.json"), skin("cat"));
  writeFileSync(join(dir, "ok.json"), skin("ok"));
  expect(Object.keys(loadCustomSkins())).toEqual(["ok"]);
  expect(skinFor({ species: "cat" })).toBeNull();
  expect(skinFor({ species: "cat", skin: "ok" })?.name).toBe("ok");
  rmSync(join(dir, "cat.json"));
});

test("picks up edits without restart (mtime invalidation)", () => {
  const f = join(dir, "ok.json");
  writeFileSync(f, skin("ok", "cat", "({E}a{E})"));
  expect(skinFor({ species: "cat", skin: "ok" })?.face).toBe("({E}a{E})");
  writeFileSync(f, skin("ok", "cat", "({E}bb{E})"));
  utimesSync(f, new Date(), new Date(Date.now() + 5000));
  expect(skinFor({ species: "cat", skin: "ok" })?.face).toBe("({E}bb{E})");
  writeFileSync(join(dir, "new.json"), skin("new"));
  expect(skinFor({ species: "cat", skin: "new" })).not.toBeNull();
});

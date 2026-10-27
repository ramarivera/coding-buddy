/**
 * Custom skin loader — reads <state-dir>/custom-art/*.json.
 *
 * The MCP server lives for the whole Claude Code session, so the cache is
 * keyed on a cheap signature of the directory (each file's name + mtime +
 * size). Adding, editing or removing a skin is picked up on the next render
 * without a restart; unchanged directories reuse the parsed result.
 *
 * Validation and resolution rules live in core/custom-art.ts.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import type { BuddyBones } from "../core/engine.ts";
import { resolveSkin, validateSkin, type CustomSkin } from "../core/custom-art.ts";
import { buddyStateDir } from "./path.ts";

export type { CustomSkin };

export function customArtDir(): string {
  return join(buddyStateDir(), "custom-art");
}

let cache: { key: string; skins: Record<string, CustomSkin> } | null = null;

function dirSignature(dir: string): { key: string; files: string[] } {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return { key: `${dir}|<none>`, files: [] };
  }
  const parts = files.map((f) => {
    try {
      const st = statSync(join(dir, f));
      return `${f}:${st.mtimeMs}:${st.size}`;
    } catch {
      return `${f}:?`;
    }
  });
  return { key: `${dir}|${parts.join("|")}`, files };
}

/** All valid skins, keyed by name. Invalid files are skipped (see `bun run skin check`). */
export function loadCustomSkins(): Record<string, CustomSkin> {
  const dir = customArtDir();
  const { key, files } = dirSignature(dir);
  if (cache && cache.key === key) return cache.skins;
  const skins: Record<string, CustomSkin> = Object.create(null);
  for (const f of files) {
    try {
      const { skin } = validateSkin(JSON.parse(readFileSync(join(dir, f), "utf8")));
      if (skin && !(skin.name in skins)) skins[skin.name] = skin;
    } catch {
      // Malformed JSON — skipped.
    }
  }
  cache = { key, skins };
  return skins;
}

/** The skin this companion wears, or null (not opted in / missing / wrong species). */
export function skinFor(bones: Pick<BuddyBones, "species" | "skin">): CustomSkin | null {
  if (!bones.skin) return null;
  return resolveSkin(loadCustomSkins(), bones);
}

/** Test hook. */
export function _resetCustomSkinCache(): void {
  cache = null;
}

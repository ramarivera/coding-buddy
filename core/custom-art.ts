/**
 * Custom skins — pure validation + resolution (no I/O).
 *
 * A skin is an opt-in drawing worn by ONE companion. It never joins the
 * SPECIES roll pool and never replaces a built-in species' art globally:
 *
 *   - `name` must be distinct from every built-in species name.
 *   - `species` declares which species the drawing fits; the skin renders
 *     only for a companion of that species whose `bones.skin === name`.
 *   - Art lines may not contain ANSI/control characters and may not be wider
 *     than the widest built-in art line (faces: widest built-in face).
 *
 * File loading (with mtime-based invalidation) lives in server/custom-art.ts.
 */

import { SPECIES, FACE_TEMPLATES, type Species, type BuddyBones } from "./engine.ts";
import { SPECIES_ART } from "./art-data.ts";

export interface CustomSkin {
  name: string;
  species: Species;
  art: string[][];
  face?: string;
}

const EYE = "{E}";
const SKIN_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
// ESC / C0 / DEL / C1 (incl. 0x9b CSI). Covers every ANSI escape form.
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]/;

/** Terminal display width with `{E}` counted as one cell (the eye glyph). */
export function skinLineWidth(line: string): number {
  let w = 0;
  let upgradable = false; // matches server/art.ts displayWidth: VS16 widens a narrow emoji
  for (const ch of line.replaceAll(EYE, "e")) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0xfe0f) {
      if (upgradable) w += 1;
      upgradable = false;
      continue;
    }
    if (cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0e) || (cp >= 0x300 && cp <= 0x36f)) {
      upgradable = false;
      continue;
    }
    const wide =
      /\p{Emoji_Presentation}/u.test(ch) ||
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1faff) ||
      (cp >= 0x20000 && cp <= 0x3fffd);
    w += wide ? 2 : 1;
    upgradable = !wide && /\p{Emoji}/u.test(ch);
  }
  return w;
}

/** Widest line across all built-in species art. Skins may not exceed it. */
export const MAX_SKIN_ART_WIDTH = Math.max(
  ...Object.values(SPECIES_ART).flatMap((frames) => frames.flatMap((f) => f.map(skinLineWidth))),
);
/** Widest built-in face template. */
export const MAX_SKIN_FACE_WIDTH = Math.max(...Object.values(FACE_TEMPLATES).map(skinLineWidth));

export function isBuiltinSpecies(name: string): name is Species {
  return (SPECIES as readonly string[]).includes(name);
}

export interface SkinValidation {
  skin: CustomSkin | null;
  errors: string[];
}

/** Validate an untrusted parsed JSON value as a skin. */
export function validateSkin(data: unknown): SkinValidation {
  const errors: string[] = [];
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { skin: null, errors: ["skin must be a JSON object"] };
  }
  const o = data as Record<string, unknown>;

  if (typeof o.name !== "string" || !SKIN_NAME_RE.test(o.name)) {
    errors.push(`"name" must match ${SKIN_NAME_RE} (lowercase, 1-32 chars)`);
  } else if (isBuiltinSpecies(o.name)) {
    errors.push(`"name" "${o.name}" collides with a built-in species; pick a distinct skin name`);
  }

  if (typeof o.species !== "string" || !isBuiltinSpecies(o.species)) {
    errors.push(`"species" must be one of the built-in species (${SPECIES.join(", ")})`);
  }

  if (!Array.isArray(o.art) || o.art.length !== 3) {
    errors.push(`"art" must be exactly 3 frames`);
  } else {
    o.art.forEach((frame, fi) => {
      if (!Array.isArray(frame) || frame.length !== 5) {
        errors.push(`frame ${fi}: must be exactly 5 lines`);
        return;
      }
      frame.forEach((line, li) => {
        const where = `frame ${fi} line ${li + 1}`;
        if (typeof line !== "string") return errors.push(`${where}: must be a string`);
        if (CONTROL_RE.test(line)) errors.push(`${where}: contains ANSI escape / control characters`);
        const w = skinLineWidth(line);
        if (w > MAX_SKIN_ART_WIDTH) errors.push(`${where}: width ${w} exceeds max ${MAX_SKIN_ART_WIDTH}`);
      });
    });
  }

  if (o.face !== undefined) {
    if (typeof o.face !== "string") errors.push(`"face" must be a string`);
    else {
      if (!o.face.includes(EYE)) errors.push(`"face" must contain ${EYE}`);
      if (CONTROL_RE.test(o.face)) errors.push(`"face" contains ANSI escape / control characters`);
      const w = skinLineWidth(o.face);
      if (w > MAX_SKIN_FACE_WIDTH) errors.push(`"face" width ${w} exceeds max ${MAX_SKIN_FACE_WIDTH}`);
    }
  }

  if (errors.length > 0) return { skin: null, errors };
  return {
    skin: {
      name: o.name as string,
      species: o.species as Species,
      art: (o.art as string[][]).map((f) => [...f]),
      face: o.face as string | undefined,
    },
    errors,
  };
}

/**
 * The skin a companion actually wears: only when it opted in via
 * `bones.skin` AND the skin was drawn for the companion's species.
 */
export function resolveSkin(
  skins: Readonly<Record<string, CustomSkin>>,
  bones: Pick<BuddyBones, "species" | "skin">,
): CustomSkin | null {
  if (!bones.skin) return null;
  const s = skins[bones.skin];
  return s && s.species === bones.species ? s : null;
}

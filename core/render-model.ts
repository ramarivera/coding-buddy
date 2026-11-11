import { resolveEyeGlyph, type Species } from "./engine.ts";
import { HAT_ART, SPECIES_ART } from "./art-data.ts";

export function getArtFrame(species: Species, eye: string, frame: number = 0): string[] {
  const frames = SPECIES_ART[species];
  const f = frames[frame % frames.length];
  const glyph = resolveEyeGlyph(eye);
  return f.map((line) => line.replace(/\{E\}/g, glyph));
}

export { HAT_ART, SPECIES_ART };

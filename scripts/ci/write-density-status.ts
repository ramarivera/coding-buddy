#!/usr/bin/env bun
/**
 * Derives a status.json fixture with full/compact/minimal frame arrays.
 *
 * Reads a base status object from stdin, computes frames from species/eye/hat,
 * and writes the augmented object to the file named by the first argument.
 *
 * Usage:
 *   cat base-status.json | bun scripts/ci/write-density-status.ts dest.json
 *   bun scripts/ci/write-density-status.ts dest.json < base-status.json
 */
import { writeFileSync } from "fs";
import { getStatusFrames } from "../../server/art.ts";
import { renderFace, resolveEyeGlyph, type Species } from "../../core/engine.ts";

function deriveCompactFrames(fullFrames: string[]): string[] {
  return fullFrames.map((body) => {
    const lines = body.split("\n");
    const selected: string[] = [];
    for (const line of lines) {
      if (selected.length >= 3) break;
      if (line.trim() !== "") selected.push(line);
    }
    while (selected.length < 3) selected.push("");
    return selected.join("\n");
  });
}

function deriveMinimalFrames(species: Species, eye: string): string[] {
  const face = renderFace(species, resolveEyeGlyph(eye));
  return Array.from({ length: 4 }, () => face);
}

async function main() {
  const dest = process.argv[2];
  if (!dest) {
    console.error("usage: write-density-status.ts <dest.json>");
    process.exit(2);
  }

  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  const base = input ? JSON.parse(input) : {};

  const bones = {
    species: base.species ?? "pikachu",
    rarity: base.rarity ?? "common",
    eye: base.eye ?? "o",
    hat: base.hat ?? "none",
    shiny: base.shiny ?? false,
    stats: base.stats ?? { DEBUGGING: 50, PATIENCE: 50, CHAOS: 50, WISDOM: 50, SNARK: 50 },
    peak: base.peak ?? "DEBUGGING",
    dump: base.dump ?? "PATIENCE",
  };

  const result = getStatusFrames(bones) as {
    frames: string[];
    frameSequence: number[];
    compactFrames?: string[];
    minimalFrames?: string[];
  };

  const compactFrames =
    result.compactFrames && result.compactFrames.length > 0
      ? result.compactFrames
      : deriveCompactFrames(result.frames);

  const minimalFrames =
    result.minimalFrames && result.minimalFrames.length > 0
      ? result.minimalFrames
      : deriveMinimalFrames(bones.species as Species, bones.eye);

  const out = {
    ...base,
    frames: result.frames,
    compactFrames,
    minimalFrames,
    frameSequence: result.frameSequence,
  };

  writeFileSync(dest, JSON.stringify(out));
}

main();

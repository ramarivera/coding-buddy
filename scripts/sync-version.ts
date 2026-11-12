/**
 * Sync every version field in the repo to package.json.
 *
 *   bun run sync-version           # rewrite drifted fields
 *   bun run sync-version --check   # exit 1 on drift, change nothing (CI)
 *
 * Wired into the npm `version` lifecycle so `npm version <bump>` updates the
 * manifests in the same commit as package.json, and into CI via --check so
 * drift cannot land.
 *
 * Design and the original implementation come from #110 by @grlee. That PR
 * conflicted with main and lives on a fork, so it is reimplemented here rather
 * than rebased.
 *
 * server/index.ts is deliberately NOT a target — it imports pkg.version
 * directly, which is strictly better than syncing a literal. Anything that can
 * import package.json should do that instead of being added below.
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dir, "..");
const CHECK_ONLY = process.argv.includes("--check");

const version: unknown = JSON.parse(
  readFileSync(join(ROOT, "package.json"), "utf8"),
).version;

if (typeof version !== "string" || version === "") {
  console.error("sync-version: package.json is missing a version field");
  process.exit(2);
}

interface Target {
  /** Repo-relative path. */
  path: string;
  /** Every version field in the document, for reporting and for rewriting. */
  fields: (doc: any) => { label: string; get: () => string; set: () => void }[];
}

const TARGETS: Target[] = [
  {
    path: ".claude-plugin/plugin.json",
    fields: (doc) => [
      { label: "version", get: () => doc.version, set: () => { doc.version = version; } },
    ],
  },
  {
    path: ".claude-plugin/marketplace.json",
    fields: (doc) => [
      {
        label: "metadata.version",
        get: () => doc.metadata?.version,
        // Creates metadata if absent. Guarding the write instead would let
        // --check report drift that the fixer could never resolve.
        set: () => {
          doc.metadata ??= {};
          doc.metadata.version = version;
        },
      },
      ...(doc.plugins ?? []).map((plugin: any, i: number) => ({
        label: `plugins[${i}].version`,
        get: () => plugin.version,
        set: () => { plugin.version = version; },
      })),
    ],
  },
];

export interface Drift {
  path: string;
  label: string;
  current: string;
}

/** Returns every field that disagrees with package.json. Never writes. */
export function findDrift(): Drift[] {
  const drift: Drift[] = [];
  for (const target of TARGETS) {
    const doc = JSON.parse(readFileSync(join(ROOT, target.path), "utf8"));
    for (const field of target.fields(doc)) {
      const current = field.get();
      if (current !== version) drift.push({ path: target.path, label: field.label, current });
    }
  }
  return drift;
}

function main(): void {
  const drift = findDrift();

  for (const d of drift) {
    console.log(
      `${CHECK_ONLY ? "DRIFT" : "sync"}: ${d.path} :: ${d.label} ${d.current} -> ${version}`,
    );
  }

  if (drift.length === 0) {
    console.log(`sync-version: all version fields already at ${version}`);
    return;
  }

  if (CHECK_ONLY) {
    console.error(
      "sync-version: version fields are out of sync with package.json. Run `bun run sync-version`.",
    );
    process.exit(1);
  }

  // Rewrite only the files that actually drifted, preserving 4-space style.
  const drifted = new Set(drift.map((d) => d.path));
  for (const target of TARGETS) {
    if (!drifted.has(target.path)) continue;
    const full = join(ROOT, target.path);
    const doc = JSON.parse(readFileSync(full, "utf8"));
    for (const field of target.fields(doc)) field.set();
    writeFileSync(full, `${JSON.stringify(doc, null, 4)}\n`);
  }
}

if (import.meta.main) main();

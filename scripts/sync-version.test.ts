import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { findDrift } from "./sync-version.ts";

const ROOT = join(import.meta.dir, "..");
const script = join(import.meta.dir, "sync-version.ts");
const pkgVersion = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;

describe("sync-version", () => {
  test("the repo's version fields are in sync with package.json", () => {
    expect(findDrift()).toEqual([]);
  });

  test("--check exits 0 and reports the shared version when in sync", () => {
    const result = spawnSync("bun", ["run", script, "--check"], { cwd: ROOT, encoding: "utf8" });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`all version fields already at ${pkgVersion}`);
  });

  test("every manifest version field matches package.json", () => {
    const plugin = JSON.parse(readFileSync(join(ROOT, ".claude-plugin/plugin.json"), "utf8"));
    const market = JSON.parse(readFileSync(join(ROOT, ".claude-plugin/marketplace.json"), "utf8"));

    expect(plugin.version).toBe(pkgVersion);
    expect(market.metadata.version).toBe(pkgVersion);
    for (const entry of market.plugins) expect(entry.version).toBe(pkgVersion);
  });

  test("the MCP handshake version is imported, never a literal", () => {
    const source = readFileSync(join(ROOT, "server/index.ts"), "utf8");
    // Scoped to the new McpServer(...) options object — a semver literal
    // elsewhere in the file is none of this test's business.
    const options = source.match(/new McpServer\(\s*\{([\s\S]*?)\}/);

    expect(options).not.toBeNull();
    expect(options![1]).toContain("version: pkg.version,");
    expect(options![1]).not.toMatch(/version:\s*"\d+\.\d+\.\d+"/);
  });
});

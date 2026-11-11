import { expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";

test("command modules and MCP entry point stay within 800 raw lines", () => {
  const files = [
    new URL("../index.ts", import.meta.url),
    new URL("../commands.test.ts", import.meta.url),
    ...readdirSync(import.meta.dir)
      .filter(name => name.endsWith(".ts"))
      .map(name => new URL(name, import.meta.url)),
  ];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").trimEnd().split("\n").length;
    expect(lines, file.pathname).toBeLessThanOrEqual(800);
  }
});

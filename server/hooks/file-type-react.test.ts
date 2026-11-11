import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { fileTypeForPath, handleFileTypeReact } from "./file-type-react.ts";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { force: true, recursive: true });
});

test("file-type-react classifies JavaScript as TypeScript and writes its reaction", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "coding-buddy-file-type-"));
  dirs.push(stateDir);
  writeFileSync(join(stateDir, "status.json"), JSON.stringify({ species: "blob" }));

  expect(fileTypeForPath("src/widget.js")).toBe("lang-javascript");
  const values = [0, 0];
  const result = handleFileTypeReact(JSON.stringify({ file_path: "src/widget.js" }), {
    now: () => 1_700_000_000_123,
    random: () => values.shift() ?? 0,
    sessionId: "session1",
    stateDir,
  });

  expect(result).toEqual({
    fileType: "lang-typescript",
    reaction: "TypeScript: because JavaScript needed more opinions.",
    updated: true,
  });
  expect(JSON.parse(readFileSync(join(stateDir, "reaction.session1.json"), "utf8"))).toMatchObject({
    reason: "lang-typescript",
    timestamp: 1_700_000_000_000,
    source: "fallback",
  });
  expect(JSON.parse(readFileSync(join(stateDir, "status.json"), "utf8")).reaction).toBe(
    "TypeScript: because JavaScript needed more opinions.",
  );
});

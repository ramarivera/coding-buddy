import { describe, expect, test } from "bun:test";
import { resolve } from "path";
import { packageRootFromHooks } from "./common.ts";

describe("hook common helpers", () => {
  test("resolves the package root from server/hooks", () => {
    expect(packageRootFromHooks()).toBe(resolve(import.meta.dir, "..", ".."));
  });
});

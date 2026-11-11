import { describe, expect, test } from "bun:test";
import { slugifySlot } from "./slot-slug.ts";

describe("slugifySlot", () => {
  test("lowercases input", () => {
    expect(slugifySlot("Sesame")).toBe("sesame");
    expect(slugifySlot("BIG_BUDDY")).toBe("big-buddy");
  });

  test("replaces invalid characters with a dash", () => {
    expect(slugifySlot("hello world")).toBe("hello-world");
    expect(slugifySlot("foo@bar")).toBe("foo-bar");
    expect(slugifySlot("a/b/c")).toBe("a-b-c");
  });

  test("collapses consecutive dashes", () => {
    expect(slugifySlot("foo   bar")).toBe("foo-bar");
    expect(slugifySlot("a!!!b")).toBe("a-b");
  });

  test("trims leading and trailing dashes", () => {
    expect(slugifySlot("---hi---")).toBe("hi");
    expect(slugifySlot("  buddy  ")).toBe("buddy");
  });

  test("truncates to 14 characters", () => {
    const long = "abcdefghijklmnopqrstuvwxyz";
    const result = slugifySlot(long);
    expect(result.length).toBeLessThanOrEqual(14);
    expect(result).toBe("abcdefghijklmn");
  });

  test("falls back to 'buddy' for empty or all-invalid input", () => {
    expect(slugifySlot("")).toBe("buddy");
    expect(slugifySlot("!!!")).toBe("buddy");
    expect(slugifySlot("   ")).toBe("buddy");
  });

  test("preserves digits and internal dashes", () => {
    expect(slugifySlot("buddy-2")).toBe("buddy-2");
    expect(slugifySlot("v1-0-3")).toBe("v1-0-3");
  });

  test("unicode / emoji input falls back to 'buddy'", () => {
    expect(slugifySlot("🐢")).toBe("buddy");
    expect(slugifySlot("日本語")).toBe("buddy");
  });
});

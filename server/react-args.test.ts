import { describe, expect, test } from "bun:test";
import {
  DEFAULT_REACT_REASON,
  MAX_REACT_COMMENT_LENGTH,
  normalizeReactArgs,
} from "./react-args.ts";

describe("normalizeReactArgs", () => {
  test("passes a valid comment and reason through", () => {
    expect(normalizeReactArgs({ comment: "*nods* tidy diff", reason: "commit" })).toEqual({
      comment: "*nods* tidy diff",
      reason: "commit",
    });
  });

  test("accepts `reaction` when `comment` is missing", () => {
    expect(normalizeReactArgs({ reaction: "*blinks slowly* found it" }).comment).toBe(
      "*blinks slowly* found it",
    );
  });

  test("prefers `comment` over `reaction`", () => {
    expect(normalizeReactArgs({ comment: "first", reaction: "second" }).comment).toBe("first");
  });

  test("falls back to `reaction` when `comment` is blank", () => {
    expect(normalizeReactArgs({ comment: "   ", reaction: "second" }).comment).toBe("second");
  });

  test("defaults the reason when it is missing or unknown", () => {
    expect(normalizeReactArgs({ comment: "hi" }).reason).toBe(DEFAULT_REACT_REASON);
    expect(normalizeReactArgs({ comment: "hi", reason: "end-of-turn" }).reason).toBe(
      DEFAULT_REACT_REASON,
    );
  });

  test("shortens an over-long comment instead of rejecting it", () => {
    const { comment } = normalizeReactArgs({ comment: "x".repeat(400) });
    expect(Array.from(comment ?? "")).toHaveLength(MAX_REACT_COMMENT_LENGTH);
    expect(comment?.endsWith("…")).toBe(true);
  });

  test("does not split a multi-byte character when shortening", () => {
    const { comment } = normalizeReactArgs({ comment: "👻".repeat(200) });
    expect(Array.from(comment ?? "")).toHaveLength(MAX_REACT_COMMENT_LENGTH);
    expect(comment).not.toContain("�");
  });

  test("reports no comment when nothing usable was sent", () => {
    expect(normalizeReactArgs({}).comment).toBeNull();
    expect(normalizeReactArgs({ comment: "", reaction: " " }).comment).toBeNull();
  });
});

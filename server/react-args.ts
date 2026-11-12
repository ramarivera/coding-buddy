/**
 * Argument handling for the buddy_react tool.
 *
 * Agents often call buddy_react without having read its schema: the tool is
 * deferred in Claude Code, so the model guesses argument names. A strict
 * schema turned those guesses into MCP -32602 errors and agents then reported
 * the buddy as unavailable. The tool accepts the common guesses instead and
 * normalizes them here.
 */

export const REACT_REASONS = [
  "error", "test-fail", "large-diff", "turn",
  "commit", "push", "merge-conflict", "branch", "rebase", "stash", "tag",
  "late-night", "early-morning", "long-session", "marathon", "friday", "weekend", "monday",
  "regex-file", "css-file", "sql-file", "docker-file", "ci-file", "lock-file",
  "env-file", "test-file", "doc-file", "config-file", "binary-file", "gitignore",
  "makefile", "readme", "package-file", "proto-file",
  "lint-fail", "type-error", "build-fail", "security-warning", "deprecation",
  "frustrated", "happy", "stuck", "sarcastic",
  "many-edits", "delete-file", "large-file", "create-file",
  "all-green", "deploy", "release", "coverage",
  "debug-loop", "write-spree", "search-heavy",
  "recovery-from-error", "recovery-from-test-fail",
  "recovery-from-build-fail", "recovery-from-merge-conflict",
] as const;

export type ReactReason = (typeof REACT_REASONS)[number];

export const DEFAULT_REACT_REASON: ReactReason = "turn";
export const MAX_REACT_COMMENT_LENGTH = 150;

export interface RawReactArgs {
  comment?: string;
  /** Alias agents guess when they have not loaded the schema. */
  reaction?: string;
  reason?: string;
}

export interface ReactArgs {
  /** Null when the caller sent no usable comment under any accepted name. */
  comment: string | null;
  reason: ReactReason;
}

function isReactReason(value: string): value is ReactReason {
  return (REACT_REASONS as readonly string[]).includes(value);
}

function clampComment(text: string): string {
  const chars = Array.from(text);
  if (chars.length <= MAX_REACT_COMMENT_LENGTH) return text;
  return `${chars.slice(0, MAX_REACT_COMMENT_LENGTH - 1).join("")}…`;
}

export function normalizeReactArgs(raw: RawReactArgs): ReactArgs {
  const text = [raw.comment, raw.reaction]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find((value) => value.length > 0);
  const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
  return {
    comment: text ? clampComment(text) : null,
    reason: isReactReason(reason) ? reason : DEFAULT_REACT_REASON,
  };
}

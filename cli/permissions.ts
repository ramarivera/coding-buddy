/**
 * Permission rule for the buddy MCP tools.
 *
 * Claude Code names MCP tools mcp__<server key>__<tool> and matches allow rules
 * against that name literally. The installer registers the server as
 * "claude-buddy", so its tools are mcp__claude-buddy__*.
 */
export const BUDDY_PERMISSION = "mcp__claude-buddy__*";

/** Rule written by earlier installs; it never matched any buddy tool. */
export const LEGACY_BUDDY_PERMISSION = "mcp__claude_buddy__*";

/** Rules that already allow every buddy tool. */
const SERVER_WIDE_RULES = ["mcp__*", "mcp__claude-buddy", BUDDY_PERMISSION];

/**
 * Drop the legacy rule and add BUDDY_PERMISSION unless a server-wide rule
 * already covers it. A rule for a single tool (mcp__claude-buddy__buddy_show)
 * does not count. Returns true when the rule was added.
 */
export function addBuddyPermission(allow: string[]): boolean {
  const legacy = allow.indexOf(LEGACY_BUDDY_PERMISSION);
  if (legacy !== -1) allow.splice(legacy, 1);
  if (allow.some((rule) => SERVER_WIDE_RULES.includes(rule))) return false;
  allow.push(BUDDY_PERMISSION);
  return true;
}

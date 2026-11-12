import { homedir } from "node:os";
import { join } from "node:path";

/** Explicit opt-in identity shared by the Claude, OMP, and Pi adapters. */
export function configuredSharedUserId(): string | undefined {
  const value = process.env.CODING_BUDDY_USER_ID?.trim();
  return value || undefined;
}

/** Shared state is opt-in so existing harness-specific worlds stay isolated. */
export function sharedStateDir(): string | undefined {
  if (!configuredSharedUserId()) return undefined;
  const configured = process.env.CODING_BUDDY_STATE_DIR?.trim();
  return configured || join(homedir(), ".coding-buddy", "shared");
}

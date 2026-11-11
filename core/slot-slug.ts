/**
 * Normalize a candidate name into a filesystem-safe slot key.
 *
 * Semantics preserved from the historical command-service and file-storage
 * helpers:
 * - lowercases input
 * - replaces any character that is not a-z, 0-9, or "-" with "-"
 * - collapses consecutive dashes into one
 * - trims leading and trailing dashes
 * - truncates to 14 characters
 * - falls back to "buddy" when the result is empty
 */
export function slugifySlot(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 14) || "buddy"
  );
}

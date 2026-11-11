/**
 * Theme support — dark and light terminal color palettes.
 *
 * Both art.ts (TypeScript) and statusline/buddy-status.sh (bash) define
 * color tables. These MUST stay in sync manually — there is no build step
 * for the bash scripts.
 */

import type { Rarity } from "../core/engine.ts"
import { loadConfig } from "./state";

export type Theme = "dark" | "light";

/**
 * Rarity color tables per theme.
 *
 * Dark theme (default): bright, saturated colors — visible on dark backgrounds.
 * Light theme: dark, high-contrast colors — visible on light backgrounds.
 */
export const THEME_COLORS: Record<Theme, Record<Rarity, string>> = {
  dark: {
    common:    "\x1b[38;2;153;153;153m",  // gray     rgb(153,153,153)
    uncommon:  "\x1b[38;2;78;186;101m",   // green    rgb(78,186,101)
    rare:      "\x1b[38;2;177;185;249m",  // blue     rgb(177,185,249)
    epic:      "\x1b[38;2;175;135;255m",  // purple   rgb(175,135,255)
    legendary: "\x1b[38;2;255;193;7m",    // gold     rgb(255,193,7)
  },
  light: {
    common:    "\x1b[38;2;90;90;90m",     // dark gray  rgb(90,90,90)
    uncommon:  "\x1b[38;2;22;115;55m",   // dark green rgb(22,115,55)
    rare:      "\x1b[38;2;55;85;210m",    // dark blue  rgb(55,85,210)
    epic:      "\x1b[38;2;110;55;200m",   // dark purple rgb(110,55,200)
    legendary: "\x1b[38;2;180;120;0m",    // dark gold  rgb(180,120,0)
  },
};

/**
 * Return the current theme based on user config.
 * "auto" falls back to "dark" (terminal auto-detection is unreliable in MCP context).
 */
export function getTheme(): Theme {
  const cfg = loadConfig();
  if (cfg.theme === "light") return "light";
  // "auto" or undefined → dark as safe default
  return "dark";
}

/**
 * Get the rarity color string for the active theme.
 */
export function getRarityColor(rarity: Rarity): string {
  return THEME_COLORS[getTheme()][rarity];
}

import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

import { buddy_react } from "./commands/companion.ts";

// A turn that ends on a tool call leaves no text after it, so Claude Code asks
// the model for more output and the whole answer gets written twice. Every
// place that tells the model when to call buddy_react must therefore put the
// call before the final reply text, never after it.
const serverSource = readFileSync(join(import.meta.dir, "index.ts"), "utf8");
const endOfTurnPhrase = /(at the (very )?end of every|after your full answer|must end with)/i;

describe("buddy_react timing instructions", () => {
  test("tool description asks for the call before the final reply text", () => {
    expect(buddy_react.description).toContain("right BEFORE your final reply text");
    expect(buddy_react.description).not.toMatch(endOfTurnPhrase);
  });

  test("server instructions and companion resource never ask for it at the end", () => {
    expect(serverSource).not.toMatch(endOfTurnPhrase);
    expect(serverSource.match(/right BEFORE your final reply text/g)?.length).toBe(2);
  });
});

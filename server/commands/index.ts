/**
 * Shared MCP command definitions, callable without starting a server.
 * CLI callers use, for example, `buddyCommands.buddy_show.execute({})`.
 * `execute` validates against the same schema exposed by the MCP transport
 * and returns the same content. Render the text blocks directly for chat.
 */
import * as companion from "./companion.ts";
import * as settings from "./settings.ts";
import * as progress from "./progress.ts";
import * as menagerie from "./menagerie.ts";

export const buddyCommands = {
  ...companion,
  ...settings,
  ...progress,
  ...menagerie,
};

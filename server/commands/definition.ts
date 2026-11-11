import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

/** Keep argument validation and command behavior shared by MCP and CLI callers. */
export function defineCommand<Shape extends z.ZodRawShape>(
  description: string,
  inputSchema: Shape,
  handler: (args: z.output<z.ZodObject<Shape>>) => Promise<CallToolResult>,
) {
  const schema = z.object(inputSchema);
  return {
    description,
    inputSchema,
    execute: async (input: z.input<typeof schema>): Promise<CallToolResult> =>
      handler(schema.parse(input)),
  };
}

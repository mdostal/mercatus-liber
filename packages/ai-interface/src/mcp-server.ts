import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createCommerceToolHandlers } from "./handlers.js";
import { TOOL_DEFINITIONS } from "./tool-definitions.js";
import type { CommerceToolDeps } from "./types.js";

/**
 * The MCP wrapper around mcp-01's protocol-agnostic tool-definitions +
 * handlers. Deliberately uses the SDK's low-level Server API, not the
 * high-level McpServer helper -- McpServer.registerTool() requires zod
 * schemas for inputs, which would force tool-definitions.ts to depend on
 * zod and stop being genuinely protocol-agnostic (open question 4). The
 * low-level Server accepts plain JSON Schema directly for a Tool's
 * inputSchema, so this wrapper adds zero new constraints on mcp-01.
 */
export function createCommerceMcpServer(deps: CommerceToolDeps): Server {
  const handlers = createCommerceToolHandlers(deps);

  const server = new Server(
    { name: "mercatus-liber-commerce", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = handlers[name];
    if (!handler) {
      return { isError: true, content: [{ type: "text", text: `Unknown tool: "${name}"` }] };
    }
    try {
      const result = await handler(args ?? {});
      return { content: [{ type: "text", text: JSON.stringify(result) }] };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { isError: true, content: [{ type: "text", text: message }] };
    }
  });

  return server;
}

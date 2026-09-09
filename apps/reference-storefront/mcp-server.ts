/**
 * Standalone stdio MCP server entry point -- the concrete proof an
 * MCP-compatible agent can shop and manage this reference storefront, per
 * the founder's positioning ("an AI/human commerce tool"). Reuses the exact
 * same service graph lib/services.ts wires (getServicesForDemo()) rather than
 * constructing a second adapter chain; the real catalog/cart/checkout/cms/
 * inventory services already structurally satisfy every
 * @mercatus-liber/ai-interface dependency, so no adapter objects are needed
 * here -- see docs/subsystems/14-ai-mcp-interface.md and
 * .pHive/epics/ai-mcp-interface/docs/ai-mcp-interface-decisions.md.
 */
import { createCommerceMcpServer } from "@mercatus-liber/ai-interface";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getServicesForDemo } from "./lib/services";

async function main(): Promise<void> {
  const services = await getServicesForDemo("dragon-merch"); // TEMPORARY: hardcoded until routes move

  const server = createCommerceMcpServer({
    catalog: services.catalog,
    search: services.search,
    cart: services.cart,
    checkout: services.checkout,
    catalogAdmin: services.catalog,
    cms: services.cms,
    inventory: services.inventory,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

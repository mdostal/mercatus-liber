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

/**
 * demo-routing-04: deliberately kept on a single fixed demo, not made
 * demoSlug-aware. This is a standalone stdio process, not a web request --
 * there is no route, form, or client session an MCP stdio client could
 * carry a demoSlug on (a stdio server is 1 process : 1 client : 1
 * connection, wired at process-launch time, not per-call), so there is no
 * real "which demo is this request for" question to thread through the way
 * there is for every `app/demo/[demoSlug]/...` page/action. Multi-demo MCP
 * access would need its own launch-time selection (e.g. an argv flag or env
 * var picking which demo this process's tools operate against) -- out of
 * scope for this story, which is about web routing/actions/cookies. The
 * fixed "dragon-merch" default preserves this script's exact pre-story
 * behavior; the old comment ("TEMPORARY: hardcoded until routes move") is
 * simply removed since it's now false -- routes have moved, this hardcoding
 * is an intentional, considered choice, not a leftover.
 */
async function main(): Promise<void> {
  const services = await getServicesForDemo("dragon-merch");

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

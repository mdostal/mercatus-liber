# @mercatus-liber/ai-interface

Exposes store operations to AI agents as a Model Context Protocol server and as plain tool handlers.

**Status:** used by the reference storefront's `mcp-server.ts` and its copilot handlers. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { createCommerceMcpServer } from "@mercatus-liber/ai-interface";

const server = createCommerceMcpServer({
  catalog,
  search,
  cart,
  checkout,
  catalogAdmin,
  cms,
  inventory,
});
```

`server` is an MCP `Server`; connect it to a transport from the MCP SDK. `apps/reference-storefront/mcp-server.ts` is a complete example. To call tools without MCP, use `createCommerceToolHandlers(deps)` with the same deps.

## Tools

- **Shopper:** `search_products`, `get_product`, `add_to_cart`, `get_cart`, `start_checkout`, `get_order_status`.
- **Admin:** `create_product`, `update_product`, `manage_cms_page`, `adjust_inventory`.
- **Lines (optional):** `list_lines`, `get_line` (read-only) and `manage_line` (create or update a line by slug: schedule, hero, sections of product slugs, optionally giving its products the line's window; needs `confirm: true`). Offered only when `lines` (a `LineOps`) is passed.
- **Provider catalog (optional):** `provider_catalog_search`, `provider_catalog_get_product`, `provider_catalog_bring_over`. Offered only when `providerCatalog` (a `ProviderCatalogOps`) is passed; the reference storefront wires Printful's. Bring-over needs `confirm: true` and only ever creates an unpublished product with draft SKUs.

Each entry in `TOOL_DEFINITIONS` has a `category` and a `requiresConfirmation` flag. `needsConfirmation` checks the flag and `pendingConfirmation` builds the response for a call that has not been confirmed yet.

## Key exports

- `createCommerceMcpServer(deps)`, `createCommerceToolHandlers(deps)`.
- `TOOL_DEFINITIONS`, `needsConfirmation`, `pendingConfirmation`.
- `CommerceToolDeps`.

See [docs/subsystems/14-ai-mcp-interface.md](../../docs/subsystems/14-ai-mcp-interface.md).

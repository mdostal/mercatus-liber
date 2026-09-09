# Plugins & AI/Agent Interface

This repository's `VISION.md` states four design principles the whole framework is built
around. The fourth is the one this page is about:

> **No AI-agent tax.** The framework ships an MCP server and Claude Code skills so an AI agent
> can set up, operate, and extend a store the same way a human developer would — this isn't a
> bolt-on integration, it's a first-class interface alongside the human-facing admin UI.

That's not marketing copy — it's a concrete, working MCP server backed by exactly the same
service objects the human-facing storefront and admin UI call. This page covers both halves of
"extensibility": the **plugin/event-bus model** that lets code extend the framework without
forking it, and the **MCP server** that lets an AI agent operate a store without a
special-cased, second-class API.

## The plugin model: subscribe, don't fork

Every subsystem in this codebase already publishes semantic events to a shared event bus for its
own reasons — cart publishing `cart.item.added`, checkout-orders publishing
`checkout.order.placed`, and so on. A plugin's entire default surface is that event bus, nothing
more:

```ts
// packages/plugins/src/types.ts
export interface PluginContext {
  events: EventBus;
}

export interface Plugin {
  name: string;
  init(ctx: PluginContext): void | Promise<void>;
}

export interface PluginRegistry {
  register(plugin: Plugin): void;
  list(): Plugin[];
  initAll(ctx: PluginContext): Promise<void>;
}
```

That's deliberately small. A plugin gets a name and an `init()` hook that receives the event
bus; it decides for itself what to subscribe to. `PluginRegistry.initAll()` is best-effort — one
plugin's `init()` failure never prevents another plugin from initializing, so a broken
third-party plugin can't take down the rest of a deployment's extension surface.

The reference plugin shipped in this repo, `order-notification-plugin`, is small enough to read
end to end and proves the pattern works for something real:

```ts
// packages/plugins/src/order-notification-plugin.ts
export function createOrderNotificationPlugin(): OrderNotificationPlugin {
  const notifications: OrderNotification[] = [];

  return {
    name: "order-notification",

    async init(ctx: PluginContext) {
      ctx.events.subscribe<{ orderId: string }>("checkout.order.placed", async ({ orderId }) => {
        notifications.push({
          orderId,
          message: `Order ${orderId} placed`,
          at: new Date().toISOString(),
        });
      });
    },

    listNotifications() {
      return [...notifications];
    },
  };
}
```

A real deployment would send an email or a Slack message from that `init()` callback instead of
pushing to an in-memory array — the reference implementation keeps it dependency-free on
purpose. It's wired into the demo the same way every other service is, in
`apps/reference-storefront/lib/services.ts`:

```ts
// apps/reference-storefront/lib/services.ts
const plugins = createPluginRegistry();
const orderNotificationPlugin = createOrderNotificationPlugin();
plugins.register(orderNotificationPlugin);
await plugins.initAll({ events });
```

Two things make this a genuine extension mechanism rather than a bolt-on: first, **the
dependency direction only ever runs one way** — core subsystems never import from `plugins`, so
the entire ecosystem can be deleted and nothing else breaks. Second, **every adapter interface
defined anywhere else in this codebase is itself a plugin point by construction** — payments,
persistence, CMS components, search indexing. This subsystem doesn't invent a second, parallel
extension mechanism alongside adapters; it's mostly the event-subscription half of
extensibility, documenting how someone finds and uses the adapter interfaces that already exist.
See [Adapters & Portability](/deep-dive/adapters-and-portability) for the adapter half of that
same story.

## The MCP server: the same operations, a different caller

The AI/agent interface (`@mercatus-liber/ai-interface`) exposes the framework's shopping and
admin operations as MCP tools. It has **zero duplicated business logic** — every tool handler
delegates to the exact same service call a human-facing page or admin action would make. If
checkout has a bug, it has the bug whether triggered by a human clicking "Buy" or an agent
calling `start_checkout`.

Tool definitions are plain, protocol-agnostic JSON Schema — no MCP or zod dependency in the
definitions file itself, so the same catalog is legible to a human developer reading the source
directly, or reusable by a future non-MCP integration:

```ts
// packages/ai-interface/src/tool-definitions.ts
export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: "search_products",
    description: "Search the catalog by free text. Read-only.",
    category: "shopper",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", description: "Free-text search query" } },
    },
  },
  // get_product, add_to_cart, get_cart, start_checkout, get_order_status ...
  {
    name: "create_product",
    description: "Create a new product (draft status). Changes public-facing content -- requires confirm:true, otherwise returns a preview.",
    category: "admin",
    requiresConfirmation: true,
    inputSchema: {
      type: "object",
      properties: {
        slug: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        identifyingAttributeKeys: { type: "array", items: { type: "string" } },
        confirm: { type: "boolean", description: "Must be true to actually execute; omit or false to preview" },
      },
      required: ["slug", "title", "description", "identifyingAttributeKeys"],
    },
  },
];
```

Notice the `category` and `requiresConfirmation` fields. Read operations (`search_products`,
`get_cart`, `get_order_status`) are low-risk and execute immediately. Admin write operations
that change public-facing content (`create_product`, `update_product`, `manage_cms_page`,
`adjust_inventory`) require an explicit `confirm: true` — called without it, the handler returns
a **preview** of what it would do instead of doing it:

```ts
// packages/ai-interface/src/confirmation.ts
export function needsConfirmation(input: Record<string, unknown>): boolean {
  return input.confirm !== true;
}

export function pendingConfirmation(preview: Record<string, unknown>): ConfirmationPending {
  return { requiresConfirmation: true, preview };
}
```

That "agent proposes, a human or policy approves" pattern is deliberate: an agent calling
`start_checkout` doesn't need this same gate, because Stripe's own hosted checkout page is
already the human-in-the-loop confirmation step for spending money — but an agent that could
silently publish a new product description or change inventory levels with no preview step
would be a real risk, not a convenience.

The actual server process reuses the same service graph the web app uses — no second adapter
chain, no parallel implementation:

```ts
// apps/reference-storefront/mcp-server.ts
import { createCommerceMcpServer } from "@mercatus-liber/ai-interface";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getServicesForDemo } from "./lib/services";

async function main(): Promise<void> {
  const services = await getServicesForDemo("print-shop");

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
```

Every one of `catalog`, `search`, `cart`, `checkout`, `cms`, and `inventory` there is the exact
same service instance `apps/reference-storefront`'s web routes call — `getServicesForDemo`
(covered in [Adapters & Portability](/deep-dive/adapters-and-portability)) is the single
composition root both entry points share. An MCP-connected agent and a human clicking through
the storefront are, structurally, two different callers of the same interface.

## Skills: the same catalog, packaged for discovery

Alongside the MCP server, this repository ships Claude Code skills (see `.claude/skills/` in
this monorepo, e.g. `create-store`) — documented, runnable procedures an agent can invoke
directly, independent of the MCP protocol itself. The `TOOL_DEFINITIONS` catalog above is
already protocol-agnostic for exactly this reason: the same operation set is meant to be legible
and usable whether an agent is talking MCP, reading a skill file, or a human developer is just
reading the source.

## Further reading

- [Subsystem 12 — Plugins & Extensibility](/subsystems/12-plugins-extensibility)
- [Subsystem 14 — AI/MCP Interface](/subsystems/14-ai-mcp-interface)
- [Project README](/readme) — current build-out status; `VISION.md` (this repo's root, not yet
  synced to this docs site) has the full design-principles context for the quote above

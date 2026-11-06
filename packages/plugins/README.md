# @mercatus-liber/plugins

The entry point for extending Mercatus Liber from outside the core packages. A plugin is a named object with an `init` function that subscribes to framework events; a registry collects plugins and starts them.

**Status:** used by the demo stores, wired in `apps/reference-storefront/lib/services.ts`. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Write a plugin

```ts
import type { Plugin } from "@mercatus-liber/plugins";

export function createOrderLogger(): Plugin {
  return {
    name: "order-logger",
    init(ctx) {
      ctx.events.subscribe<{ orderId: string }>("checkout.order.placed", async ({ orderId }) => {
        console.log(`order placed: ${orderId}`);
      });
    },
  };
}
```

`createOrderNotificationPlugin()` in this package is a complete worked example: it records a notification per placed order and exposes them through `listNotifications()`.

## Register and start it

```ts
import { createInMemoryEventBus } from "@mercatus-liber/core";
import { createOrderNotificationPlugin, createPluginRegistry } from "@mercatus-liber/plugins";

const events = createInMemoryEventBus();
const registry = createPluginRegistry();
const notifications = createOrderNotificationPlugin();

registry.register(notifications);
await registry.initAll({ events });

notifications.listNotifications(); // [{ orderId, message, at }, ...]
```

`initAll` is best effort. If one plugin's `init` throws, the error is swallowed and the remaining plugins still start, so check your own plugin's startup in a test.

## Key exports

- `Plugin`: `{ name, init(ctx) }`; `init` may be async.
- `PluginContext`: `{ events: EventBus }`, the only thing a plugin receives today.
- `PluginRegistry`, `createPluginRegistry()`: `register`, `list`, `initAll`.
- `createOrderNotificationPlugin()`, `OrderNotificationPlugin`, `OrderNotification`.

## Other extension points

Events are not the only way in. Every adapter interface elsewhere in the monorepo is also an extension point: implement `PaymentAdapter`, `InventoryAdapter`, `CatalogPersistenceAdapter`, `SearchIndexAdapter`, `FulfillmentAdapter`, `ShippingAdapter`, or register CMS components, and pass your implementation to the matching service. A `packages/adapter-*` package is that pattern in published form.

Core never imports this package, so a store that uses no plugins pays nothing for it.

## Trust and distribution

- **Plugins run with full code trust.** There is no sandbox: a plugin runs in your server process with everything that process can reach. Only install plugins you would accept as a direct dependency.
- **Distribution is undecided.** Whether plugins are discovered by an npm naming convention or declared in a manifest is an open question, as is whether the trust model should ever move to isolation.

See [docs/subsystems/12-plugins-extensibility.md](../../docs/subsystems/12-plugins-extensibility.md).

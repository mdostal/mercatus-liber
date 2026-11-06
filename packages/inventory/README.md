# @mercatus-liber/inventory

Stock levels and the reserve, commit, release lifecycle behind an `InventoryAdapter`, with a subscriber that keeps stock in step with orders.

**Status:** used by the demo stores, on `@mercatus-liber/adapter-postgres-inventory` when `DATABASE_URL` is set. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { createInMemoryEventBus } from "@mercatus-liber/core";
import { createInMemoryInventoryAdapter, registerInventorySync } from "@mercatus-liber/inventory";

const events = createInMemoryEventBus();
const inventory = createInMemoryInventoryAdapter();

await inventory.setStock("sku-1", 10);
registerInventorySync({ events, inventory, orders });

const level = await inventory.getStock("sku-1");
```

`reserve` deliberately never throws on insufficient stock. The default behavior allows overselling and backorders, which suits a made-to-order shop; enforce limits in your own adapter if you need them.

## Key exports

- `InventoryAdapter`: `getStock`, `setStock`, `reserve`, `commit`, `release`.
- `createInMemoryInventoryAdapter()`.
- `registerInventorySync({ events, inventory, orders })`.

## Implementing an adapter

Implement `InventoryAdapter` and pass it wherever one is expected. `packages/adapter-postgres-inventory` is a complete example.

See [docs/subsystems/11-inventory.md](../../docs/subsystems/11-inventory.md).

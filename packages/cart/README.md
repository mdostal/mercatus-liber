# @mercatus-liber/cart

Carts with per-item price snapshots and optional customization notes. It publishes changes on the event bus and looks up SKUs through an interface you supply.

**Status:** used by the demo stores; a Postgres repository ships in `@mercatus-liber/adapter-postgres`. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { createInMemoryEventBus } from "@mercatus-liber/core";
import { createCartService, createInMemoryCartRepository } from "@mercatus-liber/cart";

const cart = createCartService({
  repository: createInMemoryCartRepository(),
  skus,
  events: createInMemoryEventBus(),
});

const { id } = await cart.createCart();
await cart.addItem(id, "sku-1", 2, "Engrave: ADA");
```

## Key exports

- `createCartService(deps)`: `createCart`, `getCart`, `addItem(cartId, skuId, quantity, customizationNote?)`, `removeItem`, `updateQuantity`, `clear`.
- `createInMemoryCartRepository()`.
- `SkuLookup`: how the cart reads SKU price and availability.
- `CartItem`: `{ skuId, quantity, priceSnapshot, customizationNote? }`.
- `SkuNotAvailableError`, `CartNotFoundError`.

## Implementing storage

Implement the repository interface this package exports and pass it as `repository`.

See [docs/subsystems/07-cart.md](../../docs/subsystems/07-cart.md).

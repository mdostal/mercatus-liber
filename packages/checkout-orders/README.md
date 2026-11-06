# @mercatus-liber/checkout-orders

Turns a cart into an order and a payment session. Cart, payment, and discount logic arrive as interfaces, so this package has no direct tie to a payment provider.

**Status:** used by the demo stores; a Postgres repository ships in `@mercatus-liber/adapter-postgres`. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { createInMemoryEventBus } from "@mercatus-liber/core";
import { createCheckoutOrdersService, createInMemoryOrderRepository } from "@mercatus-liber/checkout-orders";

const checkout = createCheckoutOrdersService({
  repository: createInMemoryOrderRepository(),
  cart,
  payments,
  events: createInMemoryEventBus(),
});

const result = await checkout.startCheckout({
  cartId: "cart-1",
  idempotencyKey: "cart-1-attempt-1",
  shippingInfo,
  successUrl: "https://example.com/thanks",
  cancelUrl: "https://example.com/cart",
});
```

## Key exports

- `createCheckoutOrdersService(deps)`: `startCheckout`, `previewCheckout`, `getOrder`, `listOrders`, `listOrdersByCustomer`. `pricing` is an optional dep for discounts.
- `createInMemoryOrderRepository()`.
- `CartLookup`, `PaymentSessionCreator`, `PricingAdjuster`, `OrderRepository`: the interfaces it depends on.
- `OrderStatus`: `pending_payment`, `paid`, `fulfilled`, `cancelled`.
- `CartNotFoundForCheckoutError`, `EmptyCartError`, `OrderNotFoundError`.

It publishes `checkout.order.placed` and `checkout.order.paid`, which plugins and other subsystems subscribe to.

See [docs/subsystems/09-checkout-orders.md](../../docs/subsystems/09-checkout-orders.md).

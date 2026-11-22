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

## Sale windows

A cart can outlive a sale. Pass `saleWindows` (the catalog service fits) and `startCheckout`
re-checks every line against its SKU's and product's window, throwing `ItemsNotOnSaleError` with
the closed SKU ids.

## Abandoned checkouts

When the payment session expires unpaid (`payments.payment.expired`), the order becomes
`abandoned`, `order.abandonment` records the email, consent and recovery link, and
`checkout.order.abandoned` (`OrderAbandonedEvent`) is published once. Send at most one reminder,
and only when its `canRemind` is true: the shopper agreed to marketing email and there's an
address and a link. `listOrders({ status: "abandoned" })` lists them.

An abandoned order can still be paid through its recovery link. Checking out the same cart again
(same idempotency key) restarts it with a new payment session. With `@mercatus-liber/inventory`
wired, abandonment releases the order's reserved stock.

## Key exports

- `createCheckoutOrdersService(deps)`: `startCheckout`, `previewCheckout`, `getOrder`, `listOrders`, `listOrdersByCustomer`. `pricing` is an optional dep for discounts. `shipping` (a `ShippingQuoter`) charges shipping: the quote is recorded as `order.shippingTotal` and passed to the payment session. `nameLineItem` names lines on the payment page instead of "SKU <id>".
- `createInMemoryOrderRepository()`.
- `CartLookup`, `PaymentSessionCreator`, `PricingAdjuster`, `OrderRepository`: the interfaces it depends on.
- `OrderStatus`: `pending_payment`, `abandoned`, `paid`, `fulfilled`, `cancelled`.
- `CartNotFoundForCheckoutError`, `EmptyCartError`, `OrderNotFoundError`.

It publishes `checkout.order.placed` and `checkout.order.paid`, which plugins and other subsystems subscribe to.

See [docs/subsystems/09-checkout-orders.md](../../docs/subsystems/09-checkout-orders.md).

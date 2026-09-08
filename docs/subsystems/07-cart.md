# Subsystem 07 — Cart

## Purpose
A **long-lived cart** (persists across sessions/devices for a logged-in shopper; persists at
least across a browser session for a guest), holding SKU + quantity line items ahead of
checkout. This is the subsystem that made the whole project necessary in the first place —
Stripe Payment Links can't do this, which is what triggered the CBA that led here.

## Depends on
`@core/schema`, `catalog` (01, read-only — to validate a SKU exists/is active and to snapshot
price at add-time). Cart is a direct synchronous dependency for PDP (04) — "add to cart" is a
user action expecting an immediate, consistent result, which is why this is one of the few
subsystem-to-subsystem relationships that's a direct interface call rather than an event.

## Responsibilities
- Cart line items: SKU id, quantity, price snapshot (price at add-time — re-validated,
  not silently trusted, at checkout).
- Persistence: a `CartRepository` interface, same adapter pattern as everything else — a guest
  cart might live in a cookie/localStorage-backed adapter, a logged-in cart in the DB adapter,
  potentially merged on login.
- Cart mutation operations: add, remove, update quantity, clear.
- Publishes `cart.item.added|removed|updated` events (for anything that wants to react, e.g. an
  analytics plugin) without those subscribers being cart's concern.

## Explicitly NOT this subsystem's job
- Checkout/payment (09/08) — cart hands off its line items to checkout, checkout owns turning
  that into an order and a payment.
- Pricing rules/discounts beyond price snapshotting — if/when a promotions concept exists, it's
  either part of checkout (09) or its own subsystem, not bolted onto cart.

## Decoupling notes
Cart never imports payments or checkout-orders. The relationship is checkout (09) reads from
cart (07) at checkout time, cart doesn't know checkout exists. This keeps cart usable in
contexts that never reach checkout (e.g. a "save for later" flow, or a future B2B quote-request
flow that reuses cart without ever calling Stripe).

## Open questions
1. Guest-cart-to-account merge behavior on login — last-write-wins, union, or ask the shopper?
2. Price re-validation at checkout — cart snapshots price at add-time; how large a discrepancy
   (if the catalog price changed) blocks checkout vs. silently uses the current price?
3. Cart expiry — does a long-lived cart expire ever, or persist indefinitely until explicitly
   cleared/ordered?

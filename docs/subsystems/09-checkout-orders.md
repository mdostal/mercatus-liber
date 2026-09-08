# Subsystem 09 — Checkout & Orders

## Purpose
Orchestrates turning a cart into an order: the checkout flow itself, and the resulting **Order**
record (the founder's "basic order page and checkout flow"). This is the busiest subsystem in
terms of cross-subsystem interaction, which makes it the best test of the decoupling rule.

## Depends on
`@core/schema`, `cart` (07, read-only — snapshots cart contents at checkout start), `payments`
(08, interface only — creates a payment session, listens for its events). Publishes
`checkout.order.placed|paid|fulfilled|cancelled` events for **inventory (11)** and
**notifications/account (10)** to react to — checkout-orders does not import inventory or
account/notification code directly.

## Responsibilities
- Checkout flow state machine: cart snapshot → shipping/contact info → payment session
  creation (via the payments interface) → order confirmation on payment success.
- `Order` entity: line items (SKU + quantity + price-at-purchase), status, shipping/contact
  info, linked payment reference.
- `OrderRepository` interface (adapter pattern, as everywhere else).
- Reacting to `payments.payment.succeeded` (from 08) to transition an order from
  pending-payment to paid, and publishing `checkout.order.paid` onward.

## Explicitly NOT this subsystem's job
- Decrementing stock (inventory, 11, subscribes to `checkout.order.placed`/`paid` and does its
  own thing — checkout-orders never calls inventory directly).
- Sending confirmation emails/notifications (a plugin, 12, or account, 10, subscribes to order
  events).
- Order *tracking/history UI* for the shopper (account, 10, reads orders via
  `OrderRepository`, read-only).

## Decoupling notes
This subsystem is the clearest place the "events over direct calls" rule earns its keep: an
order being placed fans out to inventory (stock decrement), account (order shows up in
dashboard), and potentially a plugin (send a Slack notification, trigger a fulfillment
workflow) — none of which checkout-orders needs to know exist. Adding a new reaction to "order
placed" later is a new event subscriber, never a change to this subsystem.

## Open questions
1. Does checkout-orders own shipping-rate calculation, or does that also delegate to the
   payments adapter's underlying provider (Stripe's own shipping-rate support) per the "never
   hand-build shipping" rule carried over from `shop.mdostal.com`?
2. Order cancellation/refund flow — how much lives here vs. delegates back into payments (08)
   for the actual refund execution?
3. Idempotency — a checkout retried after a network hiccup must not double-charge or
   double-create an order; where does that guarantee live (this subsystem, or pushed down to
   the payment adapter's session-id reuse)?

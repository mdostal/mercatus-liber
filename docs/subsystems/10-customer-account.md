# Subsystem 10 — Customer Account

## Purpose
Profile, dashboard, and order tracking/updates — the founder's "basic order page and checkout
flow with a profile, a dashboard, and a way to check and update or track orders."

## Depends on
`@core/schema`, `checkout-orders` (09, **read-only** via `OrderRepository` and by subscribing
to `checkout.order.*` events for status updates) — never writes to orders directly; any
customer-initiated order change (e.g. "cancel my order") goes back through checkout-orders'
own interface, not a direct mutation from this subsystem.

## Responsibilities
- Customer profile CRUD (contact info, addresses, auth identity — auth mechanism itself is
  likely a pluggable concern, see open questions).
- Dashboard: aggregate view of a customer's orders (reads via `OrderRepository`), profile,
  saved addresses.
- Order tracking/status display, updated as `checkout.order.*` events arrive.
- Customer-initiated actions that affect an order (cancel, request return) are **requests**
  this subsystem forwards to checkout-orders' interface — this subsystem doesn't implement
  order-state transitions itself.

## Explicitly NOT this subsystem's job
- Order state machine logic (09 owns it).
- Payment method storage (08/Stripe — this subsystem may show "payment method on file" but the
  actual sensitive data lives with the payment provider, never here).

## Decoupling notes
Account is a consumer of checkout-orders, never the reverse. Checkout-orders has zero knowledge
that "customer accounts" exist as a concept — an order can exist for a guest checkout with no
account at all, and checkout-orders' job doesn't change either way.

## Open questions
1. Auth: build a minimal auth system in this subsystem, or treat auth itself as a pluggable
   adapter (email/password, OAuth, magic link) from day one given the "adapters over hard
   dependencies" principle?
2. Guest order tracking (order lookup by email + order number, no account) — first-class or a
   later addition?
3. Address book — its own sub-entity here, or deferred to a later milestone (checkout can start
   with one-shot shipping info per order, no saved-address requirement)?

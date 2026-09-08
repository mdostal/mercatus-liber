# Subsystem 11 — Inventory

## Purpose
Stock levels per SKU. Per the founder's spec, this can be **done in-house or linked to a
separate IMS** — inventory is itself an adapter boundary, not just a consumer of other
adapters.

## Depends on
`@core/schema`, `catalog` (01, read-only — needs to know a SKU exists before tracking stock for
it; subscribes to `catalog.sku.created` to initialize a stock record). Subscribes to
`checkout.order.placed|paid|cancelled` (09) to decrement/restore stock — inventory reacts to
order events, checkout-orders never calls inventory directly.

## Responsibilities
- `InventoryAdapter` interface: `getStock(skuId) -> quantity`, `reserve(skuId, qty)`,
  `commit(skuId, qty)`, `release(skuId, qty)` — a reserve/commit/release pattern so a checkout
  in progress can hold stock without a hard decrement until payment actually succeeds.
- A default in-house implementation (a simple per-SKU counter against whatever DB adapter is
  configured).
- An **external-IMS adapter contract** — same interface, different implementation, for
  deployments that already run a real IMS and just need this subsystem to proxy to it rather
  than own the data.
- Publishes `inventory.stock.depleted|low|restored` events (for PDP's read interface, 04, and
  potentially notification plugins, 12).

## Explicitly NOT this subsystem's job
- Deciding *when* to reserve/commit/release (checkout-orders, 09, orchestrates that timing by
  reacting to its own order-state events — inventory just exposes the primitives).
- Purchasing/replenishment workflows (OMS territory — explicitly a plugin (12) concern per the
  founder's "becomes plugins for more like your OMS and other systems").

## Decoupling notes
Because inventory only reacts to events (never receives a direct call from checkout-orders),
swapping in-house tracking for an external IMS adapter requires no change to checkout-orders,
PDP, or cart — they all only ever call inventory's own interface, and that interface's contract
doesn't change based on which implementation backs it.

## Open questions
1. Reserve/commit/release timing — reserve at "checkout started" or only at "payment session
   created"? Affects whether a shopper who abandons checkout blocks stock temporarily.
2. Oversell tolerance — hard-block at zero stock, or allow configurable backorder/oversell for
   made-to-order items (relevant for a 3D-print shop where "in stock" is fuzzier than typical
   retail)?
3. External-IMS adapter — is a generic interface realistic given how different real IMS APIs
   are, or does this need a small family of named integrations (like payment adapters) rather
   than one universal shape?

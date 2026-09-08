# Subsystem 20 — Internal BI / Metrics

## Purpose
An owned, internal business-intelligence layer — revenue over time, order volume, top
products/services, conversion funnel, promotion redemption rates, and (contract-only, not yet
computable) inventory turns — architected as an explicit, swappable adapter contract, distinct
from `@mercatus-liber/analytics` (subsystem 13), which is a write-only forwarding pipe to
external tracking tools (PostHog) with no read side. Internal BI is the read side this repo
never had.

## Depends on
`@mercatus-liber/core` only. Declares its own narrow structural interfaces —
`OrderMetricsSource`, `SkuMetricsSource`, `PromotionMetricsSource` — satisfied structurally by
checkout-orders/catalog/promotions' existing services at the app-composition layer, never
imported directly. Subscribes to `checkout.order.placed`, `checkout.order.paid`,
`cart.item.added`, and `promotions.redeemed` for its own funnel log (going forward only, no
backfill) — the same event-subscriber pattern inventory (11) already uses, never a direct call
into any of those subsystems.

## Responsibilities
- `BiMetricsAdapter`: the swappable contract (mirrors `CatalogPersistenceAdapter`/
  `CmsPersistenceAdapter`) — `getRevenueOverTime`, `getOrderVolume`, `getTopProducts`,
  `getConversionFunnel`, `getPromotionRedemptionRates`, `getInventoryTurns`.
- `createDefaultBiAdapter(deps)`: the default reference implementation, computing four of the
  six metrics on-demand from existing repositories (checkout-orders, catalog, promotions), and
  the funnel from a small self-owned, in-memory, going-forward-only event log.
- `BiEventLogRepository` + `registerBiEventLogSync(events, repository)`: the funnel's own
  minimal persisted state, populated by subscribing to a fixed allow-list of existing bus
  events.
- Surfaced as a real dashboard at `/admin/metrics`.

## Explicitly NOT this subsystem's job
- **Inventory turns as a real computation** — no movement/adjustment history exists anywhere
  in this repo (inventory tracks only current on-hand/reserved). The contract carries the
  method so a future adapter backed by a real inventory-history store *can* implement it; the
  default reference implementation always returns `null`, rendered honestly on the dashboard,
  not hidden.
- **Backfilling funnel/revenue history from before this subsystem was wired in** — the event
  bus retains nothing; this subsystem's own log only starts accumulating from the moment
  `registerBiEventLogSync` runs.
- **A real external BI tool integration** (warehouse export, Metabase/Looker) — no live
  credentials exist in this environment to build/test one; the contract is proven swappable in
  shape, a second real implementation is disclosed future work, same posture as epic 18's
  `adapter-sanity` for Sanity credentials.
- **Marketing/tracking analytics** — that's subsystem 13 (`@mercatus-liber/analytics`), a
  write-only forwarding pipe. Internal BI never forwards anything externally and analytics
  never gains a read side because of this subsystem.

## Decoupling notes
`packages/internal-bi`'s only dependency is `@mercatus-liber/core`. Verify via
`grep -rn "@mercatus-liber/internal-bi" packages/cart packages/checkout-orders/src
packages/catalog/src packages/promotions/src packages/bundles/src
packages/recommendations/src packages/inventory/src packages/pdp/src packages/cms/src
packages/analytics/src packages/advertising/src` before merge — every one of those must
return zero hits; internal-bi is consumed only by `apps/reference-storefront`.

## Open questions
1. A real external-BI-tool adapter implementation is disclosed future work (no live
   credentials in this environment) — the contract itself is the proof of swappability for v1.
2. Should the funnel log eventually move to a durable adapter (a real event-sourced store) so
   history survives a process restart? Deferred — the in-memory reference implementation
   matches every other subsystem's "in-memory default, durability is an adapter's job" posture
   in this repo.

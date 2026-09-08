# Design Discussion — Epic 24: `internal-bi-metrics`

## 0. Prelude

**Source:** the 2026-09-08 hand-off brief's second goal ("make the admin side and 'adapters
for how it runs' story as complete as the commerce core already is"), item 5: "Subsystem 13
(`@mercatus-liber/analytics`) forwards events to external tools (PostHog, etc.) — that's
marketing/tracking analytics. There is no owned, internal business-intelligence layer...
Design this as its own subsystem with its own adapter contract... shipping a default
reference implementation that reads straight from the existing persistence adapters. Surface
it as a real dashboard in `/admin`." Added to the backlog as epic 24 on 2026-09-08, planned
immediately after epics 20-23, all merged to master.

## 1. Goal

Revenue over time, order volume, top products/services, conversion funnel, inventory turns,
and promotion redemption rates — an owned, internal, queryable BI layer, architected as an
explicit **adapter contract** (mirroring `CatalogPersistenceAdapter`/`CmsPersistenceAdapter`)
so a deployment can later swap the default reference implementation for a real BI tool
integration, surfaced as a real dashboard in `/admin`.

## 2. Research findings (grounding)

- **What "an adapter contract" means in this codebase, confirmed twice** (catalog, and CMS's
  own retroactive formalization in epic 18): narrow per-entity structural interfaces, bundled
  into one named type (`CatalogPersistenceAdapter`, `CmsPersistenceAdapter`) injected as a
  single `persistence` param into `createXService(deps)`, with ≥1 default in-house
  implementation requiring zero infra and the contract proven swappable by a second, real
  implementation (adapter-sqlite/postgres/shopify for catalog; adapter-sanity for CMS).
  Epic 24's own contract must follow this identical shape.
- **`Order` has no timestamp field anywhere** (`packages/checkout-orders/src/types.ts`,
  confirmed by full interface read and a clean grep for
  `Date.now|createdAt|placedAt|timestamp|new Date(` against `service.ts`). Every prior
  addition to `Order` (`discountTotal`, `appliedPromotionCode`, `customerId`) was done as an
  additive, backward-compatible field — the same low-risk pattern this epic needs for
  `createdAt`, since "revenue over time" is unbuildable without one.
- **The event bus is fully transient — nothing is persisted, no replay, no query surface**
  (`packages/core/src/event-bus.ts`'s in-memory default). `packages/analytics` is the
  standing proof of what "no read side" costs: a write-only forward-to-PostHog pipe with zero
  local query capability. A BI subscriber wired today only sees events from the moment it
  starts listening forward — no backfill of history that happened before it existed.
- **A striking, direct forward-reference already exists in the codebase**:
  `packages/promotions/src/service.ts:137`, the comment immediately above the
  `promotions.redeemed` publish call, reads *"Fire-and-forget: no subscriber depends on this
  yet (**future internal-BI subsystem**)."* Whoever built promotions (epic 20) explicitly
  anticipated this epic as the first real subscriber to that event.
- **Inventory has no movement history** — `packages/inventory`'s default adapter mutates
  `onHand`/`reserved` in place with no log entry written anywhere (`commit()` just
  decrements). "Inventory turns" (units moved over a period against average on-hand) is not
  buildable from any data that exists in this repo today, persisted or transient — the
  clearest case of "needs infrastructure this repo doesn't have," structurally identical to
  what epic 22 found for analytics-driven recommendations.
- **`/admin` has zero aggregate/computed numbers anywhere today** — every existing admin page
  (including `/admin/orders`) is a plain list table. This epic is the first admin surface to
  show computed metrics. No charting library is installed
  (`apps/reference-storefront/package.json` has none) — every other admin page is
  server-rendered plain HTML, so this epic follows suit: stat rows and plain `<table>`s, not a
  new charting dependency.
- **What's cheaply buildable today, as a current snapshot (no new infra)**: order volume
  (total/by-status via `OrderRepository.listAll()`), top products (join `Order.items[].skuId`
  against catalog), promotion redemption rate as-of-now (`Promotion.redemptionCount` vs.
  `usageLimit`).

## 3. The design question, resolved: `BiMetricsAdapter` contract + a default implementation combining (a) live reads over existing repositories and (b) a self-owned, going-forward-only event log — inventory turns and history backfill explicitly out of scope for v1

**Decision: new subsystem, `internal-bi` (package `@mercatus-liber/internal-bi`), subsystem
20.** Depends on `@mercatus-liber/core` only. Declares its own narrow structural interfaces —
`OrderMetricsSource`, `SkuMetricsSource`, `PromotionMetricsSource` — satisfied structurally by
checkout-orders/catalog/promotions' existing services (never imported directly), the same
pattern every prior epic in this wave used.

**The swappable contract** (what a deployment plugs a real BI tool into later):

```ts
interface BiMetricsAdapter {
  getRevenueOverTime(range: { from: string; to: string }, bucket: "day"|"week"|"month"): Promise<{ bucket: string; revenue: Money }[]>;
  getOrderVolume(range?: { from: string; to: string }): Promise<{ total: number; byStatus: Record<string, number> }>;
  getTopProducts(range?: { from: string; to: string }, limit?: number): Promise<{ productId: string; title: string; unitsSold: number; revenue: Money }[]>;
  getConversionFunnel(range?: { from: string; to: string }): Promise<{ stage: string; count: number }[]>;
  getPromotionRedemptionRates(): Promise<{ promotionId: string; code: string | null; redemptionCount: number; usageLimit: number | null }[]>;
  getInventoryTurns(range?: { from: string; to: string }): Promise<null>; // v1: not computable, see §4
}
```

**The default reference implementation** (`createDefaultBiAdapter(deps)`) computes
`getRevenueOverTime`/`getOrderVolume`/`getTopProducts` by reading `orders.listAll()` (now
carrying `createdAt`, per §2) joined against `skus`/products for titles, and
`getPromotionRedemptionRates` straight off `promotions.listPromotions()` — all pure, on-demand
computation over existing data, no new storage needed for those four. `getConversionFunnel` is
the one metric needing new state: a small, self-owned, in-memory `BiEventLogRepository`
(append-only, capped/reference-only) populated by a subscriber
(`registerBiEventLogSync(events, repository)`, mirroring inventory's
`registerInventorySync` pattern exactly) listening to `cart.item.added`,
`checkout.order.placed`, `checkout.order.paid`, and `promotions.redeemed` **from the moment
it's wired forward** — explicitly documented as having no backfill of pre-existing history,
the same honest posture epic 22 took about analytics having no read side.

**Why this isn't a bigger, "build a real event-sourced warehouse" undertaking:** the funnel
log only needs to answer "how many carts/checkouts/orders/redemptions happened in this
session's lifetime," not full historical replay — a small in-memory list is sufficient for the
reference implementation, matching this repo's consistent "in-memory default, real durability
is an adapter's job" posture (the same posture cart/promotions/bundles/recommendations/
advertising's own in-memory repositories already take).

## 4. Explicitly out of scope (documented non-goals)

- **Inventory turns** — no movement/adjustment history exists anywhere in this repo (current
  on-hand/reserved snapshot only). `getInventoryTurns` is part of the contract (so a future
  adapter *can* implement it against a real inventory-history-tracking backend) but the
  default reference implementation always returns `null` with a clear "not available in the
  reference implementation — no inventory movement history is tracked" message rendered on
  the dashboard, not silently omitted.
- **Backfilled conversion-funnel/revenue history from before this subsystem existed** — the
  event bus retains nothing; funnel data only accumulates from the moment
  `registerBiEventLogSync` is wired in. Documented, not hidden.
- **A real external BI tool integration** (warehouse export, Metabase/Looker connector) — no
  live credentials/service exists in this environment to build and test against (same
  disclosed-gap posture epic 18's `adapter-sanity` took for Sanity credentials). The contract
  is proven swappable in principle by its own shape; a second real implementation is future
  work.

## 5. `/admin` dashboard

New `/admin/metrics` page, plain server-rendered HTML (stat rows + tables, no charting
dependency, matching every other admin page's convention): revenue-over-time table (bucketed
by day, since seed/demo activity happens same-day), order volume (total + by status), top
products table, conversion-funnel stage counts, promotion redemption-rate table, and an
"inventory turns: not available in this reference implementation" note.

## 6. Scale assessment

**Medium.** New subsystem + one additive field on an existing subsystem (checkout-orders) +
one new admin page. The `Order.createdAt` addition is the only story in this wave that
modifies an existing subsystem's package — precedented (matches `discountTotal`'s addition in
epic 20) and necessary; documented explicitly rather than treated as routine.

## 7. Version bump

`minor` — new package, one additive field on an existing type (backward-compatible), new
admin page. No breaking change to any existing subsystem's contract.

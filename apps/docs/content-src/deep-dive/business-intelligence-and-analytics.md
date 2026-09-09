# Business Intelligence & Analytics

Two packages both have "analytics" somewhere in their description, and it's easy to conflate
them — but `@mercatus-liber/internal-bi` and `@mercatus-liber/analytics` do opposite jobs.
**Analytics is write-only**: it forwards events out to an external tool like PostHog and has no
read side. **Internal BI is read-only from this repo's own data**: it computes real dashboard
metrics (revenue, funnel, top products) from the persistence this store already owns, and
forwards nothing anywhere. Understanding that split is the whole point of this page.

## Analytics: a write-only forwarding pipe

Every subsystem in this repo already publishes semantic events to the event bus for its own
reasons — inventory reacting to orders, account reacting to order status changes, and so on.
`@mercatus-liber/analytics`'s entire job is to subscribe to that same stream and forward it to a
configurable `AnalyticsAdapter`. Adding analytics never requires touching another subsystem's
code, and swapping providers never requires touching analytics' own code:

```ts
// packages/analytics/src/noop-adapter.ts
export function createNoopAdapter(): AnalyticsAdapter {
  // ...
}
```

```ts
// packages/analytics/src/posthog-adapter.ts
export function createPostHogAdapter(config: PostHogAdapterConfig): AnalyticsAdapter {
  // ...
}
```

Which of the two gets wired in is a one-line environment check in the composition root, not a
code change:

```ts
// apps/reference-storefront/lib/services.ts
const analytics: AnalyticsAdapter = process.env.POSTHOG_API_KEY
  ? createPostHogAdapter({ apiKey: process.env.POSTHOG_API_KEY, host: process.env.POSTHOG_HOST })
  : createNoopAdapter();
registerAnalyticsSync({ events, analytics });
```

`registerAnalyticsSync` is what actually subscribes to the bus and maps each event to an
`AnalyticsAdapter.track()` call — new subsystem events get picked up automatically as long as
they're published on the bus, no analytics-side code change needed per new event type. Analytics
is never a dependency of any other subsystem; it can be deleted entirely and nothing else in the
codebase breaks. That one-directional relationship (everything publishes, analytics only
subscribes) is what makes it a genuinely optional plugin rather than load-bearing infrastructure.

## Internal BI: the read side this repo never had

`@mercatus-liber/internal-bi` is the opposite shape. It owns a real `/admin/metrics` dashboard —
revenue over time, order volume, top products, a conversion funnel, promotion redemption rates —
computed from this store's *own* persistence, never forwarded anywhere external. It depends on
`@mercatus-liber/core` only, and declares three of its own narrow structural interfaces
(`OrderMetricsSource`, `SkuMetricsSource`, `PromotionMetricsSource`) rather than importing
checkout-orders, catalog, or promotions directly — the exact same structural-typing pattern
bundles uses for `SkuPriceLookup` (see
[Promotions & Merchandising](/deep-dive/promotions-and-merchandising)).

The swappable contract itself is `BiMetricsAdapter`:

```ts
// packages/internal-bi/src/types.ts
export interface BiMetricsAdapter {
  getRevenueOverTime(
    range: { from: string; to: string },
    bucket: "day" | "week" | "month",
  ): Promise<{ bucket: string; revenue: Money }[]>;
  getOrderVolume(range?: { from: string; to: string }): Promise<{ total: number; byStatus: Record<string, number> }>;
  getTopProducts(
    range?: { from: string; to: string },
    limit?: number,
  ): Promise<{ productId: string; title: string; unitsSold: number; revenue: Money }[]>;
  getConversionFunnel(range?: { from: string; to: string }): Promise<{ stage: string; count: number }[]>;
  getPromotionRedemptionRates(): Promise<
    { promotionId: string; code: string | null; redemptionCount: number; usageLimit: number | null }[]
  >;
  getInventoryTurns(range?: { from: string; to: string }): Promise<null>;
}
```

That last method is worth pausing on: `getInventoryTurns` always resolves `null` in the
shipped reference implementation. No inventory movement/adjustment history exists anywhere in
this repo — inventory (subsystem 11) tracks only a current on-hand/reserved snapshot, not a
ledger of changes over time — so a real "turns" computation is genuinely impossible from
existing data. Rather than hide the method or fake a number, the contract carries it honestly
and the dashboard renders `null` as `null`, leaving room for a future adapter backed by real
inventory history to implement it for real.

`createDefaultBiAdapter()` (`packages/internal-bi/src/service.ts`) is the zero-infra reference
implementation, wired up in `apps/reference-storefront/lib/services.ts` with small inline shims
bridging checkout-orders/catalog/promotions' real service shapes onto internal-bi's narrower
interfaces:

```ts
// apps/reference-storefront/lib/services.ts
const biEventLog = createInMemoryBiEventLogRepository();
const bi = createDefaultBiAdapter({
  orders: { listOrders: () => checkout.listOrders() },
  skus: {
    getSku: (id) => catalog.getSku(id),
    getProduct: (id) => catalog.getProduct(id),
  },
  promotions: { listPromotions: () => promotions.listPromotions() },
  eventLog: biEventLog,
});
registerBiEventLogSync({ events, eventLog: biEventLog });
```

Four of the six metrics (revenue, order volume, top products, promotion redemption) are computed
on demand directly from the existing repositories — no separate storage needed. The conversion
funnel is different: it's built from a small, self-owned, in-memory, **going-forward-only**
event log, populated by subscribing to a fixed allow-list of existing bus events
(`checkout.order.placed`, `checkout.order.paid`, `cart.item.added`, `promotions.redeemed`) —
the same event-subscriber pattern inventory already uses elsewhere in this codebase. Nothing
before `registerBiEventLogSync` was wired in gets backfilled, because the event bus itself
retains nothing to backfill from.

## Why this is two packages, not one

It would be tempting to merge these — both subscribe to the event bus, both are "analytics" in
casual conversation. They stay separate because they answer genuinely different questions and
have genuinely different trust boundaries:

| | `@mercatus-liber/analytics` (13) | `@mercatus-liber/internal-bi` (20) |
|---|---|---|
| Direction | Write-only, forwards out | Read-only, computed from owned data |
| Destination | External tool (PostHog today) | This store's own `/admin/metrics` |
| Backing data | None owned — pure event forwarding | This repo's own persistence + a small funnel log |
| Swappable via | `AnalyticsAdapter` (noop / PostHog) | `BiMetricsAdapter` (default reference impl) |
| Deleting it | Every other subsystem keeps working | Every other subsystem keeps working |

## What's next: closing the loop with external data

Today, neither package can answer "what does PostHog (or GA4) know about this store that our
own database doesn't" — page-view traffic, referrer/search-visibility data, and anything
computed client-side never flows back in. That's explicitly future work, tracked as backlog
epic **46, `analytics-insights-and-import-adapters`** (not yet planned as of this writing): a
new `AnalyticsInsightsAdapter`-shaped contract for *importing* read-side data from an external
provider's own API — real reference implementations for both Google Analytics 4's Data API and
PostHog's Query/Insights API side by side, plus this repo's own internal-bi adapter as a third,
always-available source, merged (or shown side by side, to avoid silently reconciling
conflicting numbers) into an extended `/admin/metrics` surface. If you're looking at this
capability area wondering where GA4 or PostHog *read-side* data fits, epic 46 is where that's
headed — it isn't built yet.

## Further reading

- [Subsystem 20 — Internal BI / Metrics](/subsystems/20-internal-bi)
- [Subsystem 13 — Analytics & Tracking](/subsystems/13-analytics-tracking)
- Planning corpus: [internal-bi-metrics](/planning/internal-bi-metrics)

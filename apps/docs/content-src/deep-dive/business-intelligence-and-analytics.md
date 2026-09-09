# Business Intelligence & Analytics

Two packages both have "analytics" somewhere in their description, and it's easy to conflate
them — but `@mercatus-liber/internal-bi` and `@mercatus-liber/analytics` do opposite jobs.
**Analytics forwards events out** to an external tool like PostHog, and — as of epic 46 — can
also **import read-side traffic/referrer data back in** from that same class of external
provider (PostHog, GA4), but never touches this repo's own persistence in either direction.
**Internal BI is read-only from this repo's own data**: it computes real dashboard metrics
(revenue, funnel, top products) from the persistence this store already owns, and forwards
nothing anywhere. Understanding that split — external-provider event/insights traffic on one
side, this store's own owned data on the other — is the whole point of this page.

## Analytics: forwarding events out, and importing insights back in

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
| Direction | Forwards events out; imports insights back in (both to/from the *external* provider) | Read-only, computed from owned data |
| Destination | External tool (PostHog today) | This store's own `/admin/metrics` |
| Backing data | None owned — pure event forwarding + external-provider insights | This repo's own persistence + a small funnel log |
| Swappable via | `AnalyticsAdapter` (noop / PostHog); `AnalyticsInsightsAdapter` (noop / PostHog / GA4) | `BiMetricsAdapter` (default reference impl) |
| Deleting it | Every other subsystem keeps working | Every other subsystem keeps working |

## Closing the loop: importing read-side data from external providers

`internal-bi` still only ever reads this store's own owned data — that half of the split hasn't
changed. What's new, shipped by epic 46 (`analytics-insights-and-import-adapters`), is that
`@mercatus-liber/analytics` is no longer purely one-directional: alongside the write-only
`AnalyticsAdapter` above, it now also declares `AnalyticsInsightsAdapter`, a sibling contract for
**importing** read-side traffic/referrer data back in from an external provider's own API (not
an extension of `AnalyticsAdapter` — traffic/referrer data lives only in the external provider's
own system, never in this app's persistence, so it's a separate contract rather than a bolt-on):

```ts
// packages/analytics/src/types.ts
export interface AnalyticsInsightsAdapter {
  getTrafficSources(range: AnalyticsInsightsRange): Promise<TrafficSourceRow[]>;
  getPageViews(range: AnalyticsInsightsRange): Promise<PageViewRow[]>;
  getTopReferrers(range: AnalyticsInsightsRange): Promise<TopReferrerRow[]>;
}
```

Every row carries a `provider` field (not `source`, to avoid colliding with
`getTrafficSources`' own domain-meaningful `source` field), because different tools count
traffic differently — bot filtering, session definitions, and attribution windows all vary — so
multiple configured providers are always shown side by side on `/admin/metrics`' new
**Traffic & Sources** section, never silently merged or summed into one blended number.

Two real implementations exist:

- **`createPostHogInsightsAdapter`** (`packages/analytics/src/posthog-insights-adapter.ts`) wraps
  three real HogQL queries against PostHog's Query API (`POST
  /api/projects/:project_id/query`), grouping the `events`/`$pageview` schema by
  `$referring_domain`, `$pathname`, and `$referrer` respectively. It requires a **personal** API
  key with "Query Read" scope (`POSTHOG_PERSONAL_API_KEY` + `POSTHOG_PROJECT_ID`) — deliberately
  distinct from the write-side `POSTHOG_API_KEY` above, which is a project key valid only for
  event ingestion and not accepted by the Query API.
- **`createGa4InsightsAdapter`** (`packages/analytics/src/ga4-insights-adapter.ts`) wraps Google
  Analytics 4's Data API `runReport` endpoint, mapping `sessionSource` → traffic sources,
  `pagePath` → page views, and the `sessionSource`+`sessionMedium` pair → referrers (GA4 has no
  single referrer-URL dimension the way PostHog does). It authenticates via a service-account
  self-signed JWT exchanged for an OAuth2 bearer token, and is gated on `GA4_PROPERTY_ID` +
  `GA4_SERVICE_ACCOUNT_EMAIL` + `GA4_PRIVATE_KEY`.

`apps/reference-storefront/lib/services.ts` wires both in behind the same
env-var-truthy-picks-the-real-adapter-else-noop-fallback pattern as every other adapter in this
repo, each independently gated on its own env vars and carrying an explicit `configured` flag —
so `/admin/metrics`' Traffic & Sources section can render an honest "not configured" state per
provider instead of an empty-looking table when a source's env vars are unset.

**Honest disclosure on live verification:** the PostHog adapter is built and unit-tested against
PostHog's real, current Query API request/response shapes, but no real PostHog personal API key
with query scope is available in this development environment, so no live call against a real
PostHog project has been made. The GA4 adapter is likewise built and unit-tested (including
against a real RSA keypair, to verify its signed JWT assertion is genuinely valid, not just
JWT-shaped) against Google's real, current Data API docs, but no real GA4 credential is
available either — the only Google credential present in this environment is a personal
`authorized_user` OAuth token (`gcloud`'s application default credentials), not a
service-account key with a private key this adapter's JWT-signing flow could use. In both
cases, the adapter's own unit-test coverage stands in for live end-to-end verification; what
*was* live-verified against a real dev server is the honest not-configured state itself —
`/admin/metrics` correctly rendering "Traffic & Sources is not configured for this demo" with
neither provider's env vars set, alongside the always-present internal-bi sections (revenue,
order volume, top products, conversion funnel, promotion redemption) rendering unaffected.
Same disclosed-gap posture as epic 27's admin-auth-clerk (Clerk itself).

## Further reading

- [Subsystem 20 — Internal BI / Metrics](/subsystems/20-internal-bi)
- [Subsystem 13 — Analytics & Tracking](/subsystems/13-analytics-tracking)
- Planning corpus: [internal-bi-metrics](/planning/internal-bi-metrics)

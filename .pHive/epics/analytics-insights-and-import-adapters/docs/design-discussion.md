# Design Discussion: analytics-insights-and-import-adapters

## 0. Context

Backlog epic 46. User's explicit ask: tie internal + external analytics together with real
insights, both GA4 and PostHog, plus a pluggable import-adapter pattern.

**Confirmed by direct inspection before any design work here:** `@mercatus-liber/analytics`'s
`AnalyticsAdapter` (the PostHog wrapper) is **write-only** -- `track`/`identify`/`page`, no read
method anywhere. `@mercatus-liber/internal-bi`'s `BiMetricsAdapter` is a real, owned read-side
(`getRevenueOverTime`/`getOrderVolume`/`getTopProducts`/`getConversionFunnel`/
`getPromotionRedemptionRates`) computed purely from this app's own persistence -- it has **zero
notion of page views, traffic sources, or referrers**, because that data is only ever sent
*out* via `track()`/`page()`, never stored internally. Neither existing package can answer "where
are visitors coming from" -- that data genuinely only exists inside GA4/PostHog's own systems
today, which is exactly the gap this epic closes.

## 1. Design questions

**(a) A new contract, or extend BiMetricsAdapter?**
Resolved: a **new, separate contract**, `AnalyticsInsightsAdapter` (packages/analytics, sibling
to the existing write-side `AnalyticsAdapter` in the same package -- they're related concerns,
read vs. write side of the same "analytics" subsystem, not different subsystems). Extending
`BiMetricsAdapter` would be wrong: that contract's whole design premise (subsystem
20's own design-discussion) is "computed purely from this app's own persistence" -- traffic/
referrer data doesn't live there and never will, it's fundamentally an external-provider
read, not an internal computation.

**(b) Real adapters -- GA4 and PostHog both, per the user's explicit "both, not either/or."**
- **PostHog**: real Insights/Query API adapter, wrapping PostHog's HogQL query endpoint (the
  same account already used for event forwarding -- confirm during implementation whether the
  existing `POSTHOG_API_KEY` has query scope or whether a distinct personal/query-scoped API key
  is required per PostHog's real, current docs; don't assume).
- **GA4**: real Google Analytics Data API (v1beta) adapter -- requires a real GA4 property ID
  and service-account credentials. **This is a real credential gate for live end-to-end
  verification**, same disclosed-gap pattern this repo already uses for admin-auth-clerk (epic
  27) -- the adapter is built for real (correct request/response shapes verified against
  current, real Google API documentation, unit-tested against realistic mocked responses), but
  a live call against a real GA4 property can't be proven in this environment without a real
  credential. Surface this honestly, don't fake it.
- **Internal source**: `internal-bi`'s existing `BiMetricsAdapter` is always one more available
  "source" for whatever it *can* answer (revenue/orders/products) -- not a competing insights
  contract, just wired alongside the new external ones in the admin surface.

**(c) Reconciling potentially conflicting numbers across sources.**
Resolved (already decided when this epic was first scoped, reconfirmed here): show every
configured source **side by side**, explicitly labeled by source, never silently merged or
summed. Different tools count things differently (bot filtering, session definitions,
attribution windows) -- presenting a single blended number would be actively misleading.

## 2. Scope assessment

**Medium-large.** One new contract + 2 real third-party adapter implementations + an admin UI
surface. No schema change, no new persistence model -- this is read-only, external-API-calling
work plus a display surface.

## 3. Stories

1. **contract-and-posthog-adapter** -- the new `AnalyticsInsightsAdapter` contract (real methods:
   `getTrafficSources`, `getPageViews`, `getTopReferrers`, each over a real date range), a real
   PostHog adapter implementation against PostHog's actual Query/Insights API.
2. **ga4-adapter-and-admin-surface** -- a real GA4 Data API adapter (built against real,
   current Google docs, credential-gated for live verification, disclosed honestly), and a new
   "Traffic & Sources" section on `/admin/metrics` showing whichever sources are actually
   configured, side by side, never merged.
3. **verification-and-closeout** -- verify whatever's genuinely testable without external
   credentials (contract shape, admin UI's not-configured/configured states, PostHog if a real
   key is available in this environment -- check), disclose clearly what's blocked on GA4
   credentials, update the epic-38 BI deep-dive doc page, close out the backlog, merge.

## 4. Risks

- **Medium** -- GA4's live path can't be fully proven without a real credential.
  Mitigation: explicit, honest disclosure per this repo's own established pattern (epic
  27's admin-auth-clerk precedent) -- the code is real and correct against real API docs, the
  live call is the disclosed gap, not silently claimed as verified.
- **Low** -- PostHog's query-scope requirement is unconfirmed until implementation. Mitigation:
  research this for real during story 1, don't assume the existing write-side API key works.

## 5. Open questions

None blocking.

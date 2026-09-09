# Changelog

All notable changes to this project are documented in this file. Entries are grouped by
release, oldest first.

This changelog covers the six epics that merged in this wave (epics 20-25). Earlier epics
(1-19) have no retroactive changelog or version history -- that is disclosed, pre-existing
debt tracked in `.pHive/epics/commerce-gap-audit-2/docs/audit-findings.md`, out of scope for
this pass.

## [0.2.0] - 2026-09-08

### Added

- **Promotions & discounts** (`@mercatus-liber/promotions`, subsystem 16): coupon-code and
  auto-applied percentage/fixed discounts, cart-scope and product-scope. Wires into
  checkout-orders through a narrow optional `PricingAdjuster` interface, so `previewCheckout`
  and `startCheckout` can compute a discounted total with zero changes required from
  deployments that don't adopt promotions.

## [0.3.0] - 2026-09-08

### Added

- **Bundles** (`@mercatus-liber/bundles`, subsystem 17): multi-product tiered bundles (e.g.
  "Product Only" / "+ Pro Setup" / "Complete Overhaul") sold from a single PDP. A selected
  tier resolves to ordinary per-SKU cart lines at the app layer, so cart, checkout-orders,
  promotions, and inventory needed no changes to support it.

## [0.4.0] - 2026-09-08

### Added

- **Upsell / cross-sell recommendations** (`@mercatus-liber/recommendations`, subsystem 18):
  admin-curated "customers also bought" product-to-product links shown on the PDP and cart,
  with a same-category fallback heuristic so every product gets a reasonable shelf even
  before an admin curates anything.

## [0.5.0] - 2026-09-08

### Added

- **Advertising** (`@mercatus-liber/advertising`, subsystem 19): admin-curated ad campaigns
  and creatives with optional service-area/page targeting and stateless weighted-random
  rotation, filling in the CMS's previously unimplemented ad-slot component.

## [0.6.0] - 2026-09-08

### Added

- **Internal BI / metrics** (`@mercatus-liber/internal-bi`, subsystem 20): an owned internal
  analytics layer -- revenue over time, order volume, top products, conversion funnel, and
  promotion redemption rates -- surfaced at `/admin/metrics`, distinct from the write-only
  PostHog forwarding in `@mercatus-liber/analytics`.

### Changed

- `checkout-orders`: `Order` gained an additive, required `createdAt` timestamp field to
  support BI's revenue-over-time and funnel calculations.

## [0.6.1] - 2026-09-08

### Added

- **Admin adapter-visibility settings page**: a read-only `/admin/settings` page showing
  which concrete adapter (persistence, CMS, payments, analytics) this running instance
  actually chose, backed by a small hand-maintained descriptor module kept next to each
  adapter's construction site so it can't silently drift from reality.

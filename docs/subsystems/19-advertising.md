# Subsystem 19 — Advertising

## Purpose
Campaign/creative/targeting/rotation management filling CMS's existing, previously-unimplemented
`ad-slot` component (subsystem 05) with real content — admin-curated campaigns, each with one
or more creatives, optional service-area/page-slug targeting, and stateless weighted-random
rotation among currently-eligible creatives.

## Depends on
`@mercatus-liber/core` only. Never imports `cms`, `service-areas`, `catalog`,
`marketing-catalog`, or `analytics`. Targeting fields (`serviceAreaId`, `pageSlug`) are bare
strings resolved by the app-composition layer at render time — this package never resolves or
validates them, mirroring recommendations' deliberately thin posture (see
`docs/subsystems/18-recommendations.md`).

## Responsibilities
- `Campaign` entity: id, name, status, `startsAt`/`endsAt` (nullable ISO 8601 date range),
  `targeting: { serviceAreaId, pageSlug }` (both nullable — null on a field means untargeted
  on that dimension, matches every request), an ordered list of `creatives`.
- `Creative`: id, headline, body, imageUrl, linkHref, weight (relative rotation weight,
  default 1).
- `CampaignRepository` (adapter pattern) + in-memory reference implementation.
- `AdvertisingService.getActiveCreativeForSlot({ pageSlug?, serviceAreaId?, now? })` — resolves
  every currently-eligible campaign (active status, within date range, targeting matches or is
  wildcard), flattens creatives, and does a stateless weighted-random pick. No persisted
  rotation state; computed fresh every call.
- Admin CRUD (`/admin/advertising`).

## Explicitly NOT this subsystem's job
- Real ad-serving (external networks, bidding, budget pacing) — an in-house promotional-
  placement manager for a store's own campaigns only.
- Click-through/impression tracking or performance-based rotation optimization — analytics
  (subsystem 13) has no queryable read side today; this is a documented, deferred gap, not a
  silent omission. See `.pHive/epics/advertising/docs/design-discussion.md` §4.
- A/B testing or statistically-driven creative selection — no experimentation infrastructure
  exists anywhere in this repo.
- Cron/scheduled activation beyond simple `startsAt`/`endsAt` checked inline at render time —
  no job-scheduler infrastructure exists.
- Changing `packages/cms`'s public contract — `ComponentInstance`, `PageRepository`,
  `CmsService`, and the component registry are all untouched; the existing `"ad-slot"`
  render case in `apps/reference-storefront/components/cms-sections.tsx` becomes a real
  component that composes this subsystem, the same app-layer pattern bundles/recommendations
  already established.

## Decoupling notes
`packages/advertising`'s only dependency is `@mercatus-liber/core`. Verify via
`grep -rn "@mercatus-liber/advertising" packages/cms packages/cart packages/checkout-orders/src
packages/promotions/src packages/bundles/src packages/recommendations/src
packages/inventory/src packages/pdp/src packages/service-areas/src packages/analytics/src`
before merge — every one of those must return zero hits; advertising is consumed only by
`apps/reference-storefront`.

## Open questions
1. Should targeting support more dimensions (e.g. product category, customer segment) beyond
   service-area and CMS page slug? Deferred — v1 covers the two cheaply-available "where"
   dimensions already established elsewhere in this repo (service-areas, CMS pages); more
   dimensions can be added additively to the `targeting` object without a breaking change.
2. A genuinely performance-optimized rotation (favoring creatives with better click-through)
   is a real future capability, blocked on analytics having no read side today — same
   deferred-not-forgotten posture as recommendations' open question 1.

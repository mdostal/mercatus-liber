# Commerce gap audit round 2 — findings (2026-09-08)

Same methodology as epic 17's own `commerce-gap-audit`: read real code, not memory. Run now
that epics 20-25 (promotions, bundles, upsell-cross-sell, advertising, internal-bi-metrics,
admin-adapter-visibility-settings) are all merged.

## Summary

| # | Topic | Classification |
|---|---|---|
| 1 | Payments has only one `PaymentAdapter` implementation (Stripe) | **NOT A GAP** — already disclosed in `docs/subsystems/08-payments.md`, blocked on needing a live second provider account to test against (same posture as Sanity/BI credentials) |
| 2 | Missing `page_viewed`/shelf/tier-selector interaction tracking | **QUICK FIX** |
| 3 | Every open question across `docs/subsystems/16-20-*.md` | **NOT A GAP** — every one is already explicitly deferred with a stated reason, or blocked on missing infrastructure |
| 4 | Bundles+promotions composability is an untested claim | **QUICK FIX** — one integration test |
| 4b | Recommendations+bundles confusion | **NOT A GAP** — recommendations resolves by `productId`, bundle tiers are `skuId`-scoped; the structural mismatch makes the described confusion impossible |
| 5a | `promotions.redeemed` missing from `ANALYTICS_EVENT_MAP` | **QUICK FIX** |
| 5b | No plugin reacts to any of the 6 new subsystems' events | **NOT A GAP** — one reference plugin proving the mechanism generically is this repo's established, sufficient posture (epic 17's own precedent) |
| 6 | No `CHANGELOG.md`, no package ever version-bumped despite ~24 epics of `version_bump` declarations | **QUICK FIX**, scoped to this session's epics 20-25 only — retroactively reconstructing 19 prior epics' release history is real, disclosed, out-of-scope archaeology, not addressed here |
| 7 | `/admin` nav is a flat, ungrouped 10-link list | **NOT A GAP** — honest observation only, no build recommended |

**No new backlog epic is warranted.** Every genuine finding is either already correctly
disclosed as deferred/blocked, or small enough to fix directly rather than plan as an epic —
matching epic 17's own "don't manufacture busywork" posture.

## What this epic actually changed (the 4 quick fixes)

1. Wired `InteractionTracker` into the home page (`page_viewed`) and campaign page
   (`page_viewed`), plus impression/click tracking on `recommendation-shelf.tsx` and
   view/select tracking on `bundle-tier-selector.tsx` — extending the exact pattern epic 17
   already established for PDP/search/category, to the surfaces that didn't exist yet when
   epic 17 ran.
2. Added `.pHive/epics/commerce-gap-audit-2/../../../apps/reference-storefront/test/bundle-promotion-integration.test.ts`
   (or wherever it landed — see commit) proving a product-scope promotion targeting a bundle
   tier's `skuIds` actually discounts `previewCheckout`'s total, closing the gap between the
   documented claim in `docs/subsystems/17-bundles.md` and an actual verified test.
3. Added `"promotions.redeemed": "promotion_redeemed"` to `ANALYTICS_EVENT_MAP`
   (`packages/analytics/src/event-map.ts`) — a real business event internal-bi already treats
   as first-class was silently excluded from the analytics forwarding allow-list.
4. Added `CHANGELOG.md` at the repo root covering epics 20-25 only, and bumped the root
   `package.json` version through those six epics' declared `version_bump` values in sequence
   (five `minor`, one `patch`). Epics 1-19 have no retroactive changelog/version history —
   that is disclosed, systemic, pre-existing debt, explicitly out of this fix's scope.

# Design Discussion: demo-store-plant-shop

## 0. Context

Backlog epic 37. User's explicit ask: a third demo store, "somewhat eclectic but a classic
commerce store... an etsy neat plant store or something" (illustrative example, not literal —
resolved below as a general eclectic handmade-goods shop with plants as one category among
several, matching real small-batch Etsy-style sellers who rarely sell just one thing). Depends
on epic 34 (done — switchable themes). Architecturally simpler than epic 36: this is a genuinely
new demo, not a rename, and needs no bespoke new capability (no personalization field, no
service-area model) — it exercises the exact registry extension point epic 36 just proved works
cleanly (`DEMO_SLUGS`/`DEMO_REGISTRY`/`defaultThemeKey`, confirmed by reading
`apps/reference-storefront/lib/demos.ts` directly before writing this doc).

## 1. Design questions

**(a) Brand identity and category shape.**
Resolved: **"Broadleaf & Co."**, slug `broadleaf`, an eclectic small-batch goods shop across 4
real categories — Plants, Ceramics & Planters, Textiles & Fiber Arts, Paper & Ephemera. This
mirrors how real Etsy-style sellers actually operate (rarely one narrow category) and gives the
"eclectic...classic commerce" framing real substance, not just a plant store with a different
name.

**(b) New seed module, or extend an existing one?**
Resolved: a new `lib/seed-broadleaf.ts`, mirroring `lib/seed-northline.ts`'s module shape
(exported `seedBroadleafDemo(deps)` function, registered in `DEMO_REGISTRY`) — not a branch
inside `lib/seed.ts` (print-shop's module), keeping each demo's content genuinely independent
per this repo's established one-module-per-demo convention.

**(c) Does the nav/depth work need new code, or does it "just work"?**
Resolved, confirmed by direct inspection of `app/demo/[demoSlug]/layout.tsx`'s `buildNavLinks`
(built by epic 35, proven again by epic 36): nav links are already built server-side per demo
from real `MarketingCatalogService` category data — a demo with real categories automatically
gets a real nav with zero new nav code. This epic's "true menu, true set of products" critique
is satisfied entirely by real seed-data depth, not new architecture. This materially shrinks
this epic's scope versus 35/36.

**(d) Default theme.**
`vibrant` (existing bundle: warm orange/pink palette, playful 12px radius) — the one bundle not
yet used as any demo's default (northline→`northline`, print-shop→`editorial`), and a genuine
fit for a colorful, eclectic craft-market identity.

## 2. Scope assessment

**Medium.** One new seed module, one registry entry, no new subsystem, no schema change, no new
shared component work (nav/theme mechanisms already handle a 3rd demo for free).

## 3. Stories

1. **new-demo-seed-and-registry** — new `lib/seed-broadleaf.ts` with 4 real categories and >=8
   real products (real names/descriptions/prices, no lorem ipsum), including at least one
   tiered-variant product (e.g. a plant sold in small/medium/large pot sizes, mirroring the
   `generateSkus` tiering pattern epics 35/36 already used), registered in `DEMO_SLUGS`/
   `DEMO_REGISTRY` with `defaultThemeKey: "vibrant"`.
2. **verification-and-closeout** — live-verify the new demo end to end (nav auto-populated with
   the 4 real categories, all product/PDP pages render, cart/checkout reaches the same expected
   Stripe-key-absent failure point as every other demo, fresh no-cookie visit shows the vibrant
   theme by default), confirm print-shop and northline are both completely unaffected, update
   README.md/VISION.md's demo roster mentions, close out the backlog row, merge to master.

## 4. Risks

- **Low.** This is the third instance of an already-twice-proven extension point
  (`DEMO_SLUGS`/`DEMO_REGISTRY`/`defaultThemeKey`) — epics 35 and 36 already demonstrated the
  nav/theme mechanisms generalize correctly to additional demos with zero shared-component
  changes.

## 5. Open questions

None blocking.

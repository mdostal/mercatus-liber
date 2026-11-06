# Subsystem 27 — Customization

## Purpose
A shared color palette, ranked/priced finish tiers (one-color print up to hand-painted), and
per-product color regions with the real printing-process rules a made-to-order shop actually
needs: a region too small to be its own physically separate part follows its parent region's
color once a finish produces separate assembled parts; a region can restrict which palette
colors it offers (e.g. a light-diffuser that must stay white for an LED to shine through); any
palette color or finish tier can be marked discontinued (shown, never selectable) or
request-only (shown, selectable "on request," captured with the order). Ported faithfully from
a real reference implementation — `dostal-3d-printing/shop-assets/color/color-regions.json`
(the data) and its reference editor `index.html` (the `effective()`/`choices()` logic) — not
invented from scratch. Driven directly by the storefront owner's own request: "we need to
build with more color options, a request option, a way to grey out options and discontinue etc
but still show and display it... we have to have the components, controls, and framework for
doing all of this... out of the box in mercatus liber."

## Depends on
`@mercatus-liber/core` only (`AvailabilityStatus`). No dependency on catalog —
`ProductCustomization.productId` references a catalog `Product` by id only, the same
"reference by id, never import the other package's types" discipline `@mercatus-liber/
community-goals`/`@mercatus-liber/bundles` already draw. `resolveEffectiveColor`/
`availableColorChoices`/`resolveColorCount`/`resolvePrice` (see "Pricing" below) are pure,
I/O-free functions a storefront's own 3D-viewer/swatch UI calls directly — this package has no
rendering/animation code of its own (see "Explicitly NOT this subsystem's job").

## Responsibilities
- `PaletteColor { id, label, hex, kind?, hexes?, material?, status?, note? }` — one shared
  palette across every product. `kind: "multi"` + `hexes` is a real filament whose color
  changes along the strand (e.g. a silk gradient); `material` (e.g. "silk") is the real cost
  driver a storefront's pricing rules key a per-material surcharge off, carried here as a fact,
  never as a price itself.
- `FinishTier { id, rank, label, colors: "single"|"palette"|"any", description,
  producesSeparateParts, status?, note? }` — `colors` is the reference's own `ColorMode`;
  `producesSeparateParts` is this package's named generalization of the reference's hardcoded
  `finish === "separate" || finish === "finished"` check (true only for tiers that assemble
  physically separate, independently-colored parts). No price field — see "Pricing" below.
- `ColorRegion { id, label, defaultHex, separable, parentRegionId?, allowedColorIds?, why? }` —
  a region with `separable: false` must name a real `parentRegionId` on the same product;
  enforced by `validateRegions`, called by both `createProductCustomization` and
  `updateProductCustomization`. No price field — see "Pricing" below.
- `ProductCustomization { id, productId, finishIds, regions, bundledProductIds?,
  artStyleIds?, why? }` — `bundledProductIds` is informational provenance only, never
  auto-merged (a combined product like the reference's "cubby set" already lists its own full,
  pre-combined region list directly on its own `ProductCustomization`).
- `ArtStyle { id, label, description, status?, note? }` — ported from the real reference
  manifest's own top-level `art_styles` ("flush"/"raised" engraved/printed art). Orthogonal to
  `FinishTier` (a product picks one finish AND one art style independently); this package has
  no opinion on which GLB a style loads (`glb_raised` stays a pure rendering/asset concern, out
  of scope here) or what it costs — see "Pricing" below.
- Pure resolution functions (`src/resolution.ts`): `validateRegions`, `resolveEffectiveColor`,
  `availableColorChoices`, `validateSelectedColor`, `resolveColorCount` — see their own doc
  comments for exact semantics; all ported directly from the reference editor's
  `effective()`/`choices()` or newly added for this package (locked/freeColor derivation,
  submitted-selection validation, distinct-color counting).
- `CustomizationService`: palette/finish-tier/art-style CRUD, product-customization CRUD,
  `resolveEffectiveColors` (every region's effective color under one finish+selection — the
  live data a 3D viewer paints with), `getRegionChoices` (every region's current swatch-row
  choices), `getColorCount`, `validateArtStyleChoice` (server-side discontinued/not-offered
  enforcement, same discipline as `requireFinish`).
- In-memory repositories by default, plus durable repositories for all five on Postgres, SQLite,
  MongoDB, and Convex, each in its own adapter package. All of them run the same contract,
  `packages/customization/test/repository-contract.ts`. The reference storefront doesn't use any of
  them yet, and the Convex functions aren't deployed to the Broadleaf project.

## Pricing — a generic, fully admin-defined rules engine
**Replaced an earlier fixed-field design** (`FinishTier.priceDelta`/`finishPriceDeltas`,
`ArtStyle.priceDelta`/`artStylePriceDeltas`, `ColorRegion.priceDelta`,
`ProductCustomization.colorCountPriceDeltas`, `PaletteColor.priceDelta`,
`resolveCustomizationPriceDelta`) after a direct correction from the shop owner, reacting to
real per-region slicer-time data (a treasure chest's straps cost ~$45 extra only when they
*differ* from the chest body — matching costs nothing extra) PLUS his own explicit words:
"it isn't a flat per color count charge... fully customizeable across the entire board...
our tool should basically allow us to build a formula and have a bunch of attributes for a
product." Nothing about pricing is a fixed, named field on any type anymore — every cost
driver is admin-defined data.
- `PricingAttribute { id, label, perUnitCents, quoteOnly? }` — one admin-defined cost driver
  ("extra color," "silk filament," "custom name," anything). Nothing about the id is special
  to this package; what it means and how many units apply is entirely the admin's (via `id`)
  and the caller's (via `PriceBuild.attributeCounts`) business. `perUnitCents` can be negative
  (a discount — raised art is cheaper on some products, pricier on others, per real slicer
  data). `quoteOnly` (e.g. real metal hardware) never adds a price line; it sets
  `PriceResult.quoteRequired` instead.
- `ContrastRule { attributeId, regions, core }` — generalizes the real, measured mechanism
  behind e.g. a chest's straps: contributes one unit to `attributeId` whenever any of
  `regions` has a color that doesn't match any of `core`'s own colors. Not fixed to one
  product or region pair — a product defines as many as it has real contrast-sensitive region
  groups. This is this package's only automatic attribute-counting logic (everything else is
  caller-supplied) because it genuinely needs `PriceBuild.colors` to evaluate.
- `ExcessUnitRule { attributeId, source: "estimatedMinutes"|"colorChanges"|"nameLength",
  freeUnits, unitsPerExcess? }` — generalizes `ContrastRule`'s own split (this package derives
  a count, the admin keeps the rate/label on a normal `PricingAttribute`) to three more
  real-world drivers: estimated print minutes beyond a free threshold, distinct colors beyond
  the first ("color changes off base"), and personalization length beyond a free character
  count. Direct response to the shop owner's own follow-up request, once the base engine
  shipped: "take in the rough time of the print and do a... multiplier to determine the
  minutes over 3 hours and charge an upcharge for that... the printer could also do the
  estimated wastage of the filament... or a heuristic of 'complexity'... multiplier times
  number of color changes off of base" plus "the name plate over 8 characters probably bumps
  up in cost... since that causes more layers." `estimatedMinutes` is a **(product,
  finish)-level admin constant** on `PricingRules` (read once by a human from the 3D side's
  own real slicer-time reference data, never a live dependency); `colorChanges` is derived
  automatically from the same `PriceBuild.colors` map `ContrastRule`/`colorMarkupCents`
  already consume, reusing the exact "one color free" convention the existing `extraColor`
  attribute already relies on — never a second caller-computed count that could drift.
  `nameLength` is the one genuinely new `PriceBuild` field this required (a plain character
  count, never the personalization text itself — pricing has no business reason to see what
  was typed). `unitsPerExcess` lets one rule's derived count feed a *different* unit than it
  was measured in (e.g. estimated waste grams per excess color change, priced by a sibling
  attribute's cents-per-gram rate) without a fourth coefficient field anywhere.
- `PricingRules { basePriceCents, attributes, contrastRules?, colorMarkupCents?,
  estimatedMinutes?, excessUnitRules? }` — one product's complete, standalone pricing formula.
  No global/override layering: "fully customizable across the board" means per-product, and
  each product's document is the whole story for itself (confirmed with the storefront
  consumer before building — simpler to implement correctly, and there's no
  automated-regeneration-clobbers-admin-edits risk because there's no automated regeneration
  at all; admin edits the live document directly). `colorMarkupCents` is a specific palette
  color's own markup (e.g. a specialty filament), independent of any attribute count.
- `resolvePrice(rules, build)` (`src/pricing.ts`) — the one real pricing path every consumer
  (this package, the storefront) must call, so a preview price and the real charge never
  drift apart. Sums `basePriceCents[build.finish]` + each listed attribute's
  `count * perUnitCents` + contrast-rule-driven counts + excess-unit-rule-derived counts +
  `colorMarkupCents` for every distinct color actually used. A zero-amount line is omitted;
  `total` is floored at the base price (never let a discount make the whole item cheaper than
  its own starting price). Tests cover 4 of the 7 cent-exact examples in the 3D side's `suggested-levers.json`
  (the treasure-chest `plate` ones; the `hasp`, art box, and cubby set examples are not ported),
  plus real treasure-chest minute numbers for the excess-time lever. That file is a reference,
  not a contract, and its numbers are unapproved suggestions.
- `PricingService`/`PricingRulesRepository` (`src/pricing-service.ts`) — deliberately separate
  from `CustomizationService`: a storefront's admin screen reads/writes one product's whole
  `PricingRules` document at a time through this; `priceOf(productId, build)` throws
  `MissingPricingRulesError` rather than silently pricing an unconfigured product at $0.
  In-memory only at v1 (`createInMemoryPricingRulesRepository`) — a durable (Postgres) adapter
  is the clearly-scoped next step once a real admin screen needs edits to survive a restart.

## Availability status — how "discontinued" and "request" are the same mechanism
Both halves of the storefront owner's ask ("a way to grey out options and discontinue... but
still show and display it" and "a request option") are the **same** shared
`AvailabilityStatus` type from `@mercatus-liber/core` (introduced for `Sku` in the
sku-availability-status epic, reused here verbatim for `PaletteColor.status` and
`FinishTier.status`) — not two separate features:
- `"discontinued"` — shown, never selectable. `CustomizationService` enforces this
  server-side, never left to a client-side UI alone: `resolveEffectiveColors` throws
  `DiscontinuedFinishError` for a discontinued finish tier, and `InvalidColorSelectionError`
  (via `validateSelectedColor`) for any submitted palette id or free hex that resolves to a
  discontinued palette color. A client is free to render a discontinued option greyed-out, but a direct API call
  (or a stale client) gets rejected either way.
- `"request"` — shown, selectable; explicitly let through both checks above. Capturing that
  request alongside the order (so fulfillment knows a `request`-status choice needs special
  handling) is deliberately NOT this subsystem's job — see "Explicitly NOT" below.
- Missing `status` on either type means `"active"`, same default as `Sku.availabilityStatus`.

## Explicitly NOT this subsystem's job
- **Any rendering, 3D-viewer wiring, or UI controls.** `resolveEffectiveColor`/
  `availableColorChoices`'s plain region→hex maps and swatch-choice lists are the entire
  contract; a storefront's own component (`@mercatus-liber/customization-ui`'s Web Component,
  `<ml-finish-color-picker>`, or the storefront's own) owns every pixel.
  Same separation this package's own sibling subsystems (`community-goals`, `pdp`, `theming`)
  already draw from their own data layers.
- **build.json / 3D-asset-build tooling.** Part placement, pivots, glTF animations, and STL
  assembly are the 3D-printing/model-forge tooling side's domain, never commerce data — this
  package only names region ids that must match a product's own GLB material names.
- **Cart/order capture of a shopper's selection or a `request`-status choice.** `CartItem`
  gaining a structured `{finishId, colors: Record<regionId, paletteId>}` field (replacing/
  supplementing the free-text `customizationNote`), plus a flag/note on the order when a
  `request`-status option was chosen so fulfillment sees it needs special handling, is a
  clearly-scoped, separate follow-up epic — not started as of this subsystem's initial ship.
- **Cost-estimation tooling** (deriving a good `perUnitCents` from real wastage/print-time/
  reprint-risk data). dostal-3d-printing's own `pricing.js`/`suggested-levers.json` are a real,
  validated reference a human can read when deciding what rate to set, but this package
  neither owns nor maintains that calculator as a contract — `resolvePrice` only sums
  whatever rates are already set.

## Decoupling notes
`packages/customization`'s only dependency is `@mercatus-liber/core`. Verify via
`grep -rln "@mercatus-liber/customization" packages/*/src` before merge — every hit should be
this package's own `src`; it's consumed only by `apps/reference-storefront` (if/when wired) and
downstream by whichever storefront UI builds on top of it.

## Color values
Selections, effective colors, and `PriceBuild.colors` all carry palette ids, matching the `colors`
field of `print-order/1`. A `#rrggbb` hex is accepted only where `RegionColorChoices.freeColor` is
true, and is rejected elsewhere even if it matches a palette entry's hex.

`canonicalColor` defines the one form colors are compared in: a palette id, or a lowercase hex for a
free pick. A hex matching exactly one solid palette entry becomes that entry's id. A multi-color
entry never matches by hex, because its hex is only representative. A hex shared by two solid
entries stays a hex. `resolveEffectiveColors` returns canonical values, so its output goes straight
to `PriceBuild.colors`, and `colorMarkupCents` applies. `resolveColorHex` gets the hex for painting
a viewer, and `defaultSelection` builds a starting selection from each region's `defaultHex`.

`@mercatus-liber/customization-ui` keeps its own local hex-based copy of this logic and has not
moved to palette ids yet.

## Known limitations
Verified against the built package, 2026-11-05:
- `resolvePrice` charges for distinct colors beyond the first, not for each color differing from a
  region's default. A per-region "differs from base" charge exists only through `ContrastRule`.
- `estimatedMinutes` is one constant per finish, so the excess-time charge does not change with the
  shopper's color choices.
- Test files are not typechecked: `tsconfig.json` includes only `src`.
- `PricingDocument` is exported but unused by the repository or service.

## Open questions
1. Structured cart/order customization-selection field — not started. See "Explicitly NOT"
   above; the real target shape is the `print-order/1` shape: finish, raw option picks, art style,
   name, and `colors` as region id to **palette id**.
2. Request-status order-capture flagging (a note/flag fulfillment sees) — not started, folded
   into the same follow-up epic as (1) above.

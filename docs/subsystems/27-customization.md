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
`@mercatus-liber/core` only (`AvailabilityStatus`, `Money`). No dependency on catalog —
`ProductCustomization.productId` references a catalog `Product` by id only, the same
"reference by id, never import the other package's types" discipline `@mercatus-liber/
community-goals`/`@mercatus-liber/bundles` already draw. `resolveEffectiveColor`/
`availableColorChoices`/`resolveFinishPriceDelta` are pure, I/O-free functions a storefront's
own 3D-viewer/swatch UI calls directly — this package has no rendering/animation code of its
own (see "Explicitly NOT this subsystem's job").

## Responsibilities
- `PaletteColor { id, label, hex, status?, note? }` — one shared palette across every product.
- `FinishTier { id, rank, label, colors: "single"|"palette"|"any", description,
  producesSeparateParts, priceDelta?, status?, note? }` — `colors` is the reference's own
  `ColorMode`; `producesSeparateParts` is this package's named generalization of the
  reference's hardcoded `finish === "separate" || finish === "finished"` check (true only for
  tiers that assemble physically separate, independently-colored parts).
- `ColorRegion { id, label, defaultHex, separable, parentRegionId?, allowedColorIds?, why? }` —
  a region with `separable: false` must name a real `parentRegionId` on the same product;
  enforced by `validateRegions`, called by both `createProductCustomization` and
  `updateProductCustomization`.
- `ProductCustomization { id, productId, finishIds, regions, bundledProductIds?,
  finishPriceDeltas?, why? }` — `finishPriceDeltas` is a per-product override of a finish
  tier's global `priceDelta` (a large treasure chest costs more to hand-paint than a small
  insert tray); `bundledProductIds` is informational provenance only, never auto-merged (a
  combined product like the reference's "cubby set" already lists its own full, pre-combined
  region list directly on its own `ProductCustomization`).
- Pure resolution functions (`src/resolution.ts`): `validateRegions`, `resolveEffectiveColor`,
  `availableColorChoices`, `validateSelectedColor`, `resolveFinishPriceDelta` — see their own
  doc comments for exact semantics; all ported directly from the reference editor's
  `effective()`/`choices()` or newly added for this package (locked/freeColor derivation,
  price-delta override, submitted-selection validation).
- `CustomizationService`: palette/finish-tier CRUD, product-customization CRUD,
  `resolveEffectiveColors` (every region's effective color under one finish+selection — the
  live data a 3D viewer paints with), `getRegionChoices` (every region's current swatch-row
  choices), `getFinishPriceDelta`.
- In-memory repositories only at v1 (`PaletteRepository`/`FinishTierRepository`/
  `ProductCustomizationRepository`), same posture `community-goals` and `bundles` each took
  initially — a durable adapter is a clearly-scoped follow-up once a real deployment needs
  these to survive a restart.

## Availability status — how "discontinued" and "request" are the same mechanism
Both halves of the storefront owner's ask ("a way to grey out options and discontinue... but
still show and display it" and "a request option") are the **same** shared
`AvailabilityStatus` type from `@mercatus-liber/core` (introduced for `Sku` in the
sku-availability-status epic, reused here verbatim for `PaletteColor.status` and
`FinishTier.status`) — not two separate features:
- `"discontinued"` — shown, never selectable. `CustomizationService` enforces this
  server-side, never left to a client-side UI alone: `resolveEffectiveColors` throws
  `DiscontinuedFinishError` for a discontinued finish tier, and `InvalidColorSelectionError`
  (via `validateSelectedColor`) for any submitted hex that matches a discontinued palette
  color. A client is free to render a discontinued option greyed-out, but a direct API call
  (or a stale client) gets rejected either way.
- `"request"` — shown, selectable; explicitly let through both checks above. Capturing that
  request alongside the order (so fulfillment knows a `request`-status choice needs special
  handling) is deliberately NOT this subsystem's job — see "Explicitly NOT" below.
- Missing `status` on either type means `"active"`, same default as `Sku.availabilityStatus`.

## Explicitly NOT this subsystem's job
- **Any rendering, 3D-viewer wiring, or UI controls.** `resolveEffectiveColor`/
  `availableColorChoices`'s plain region→hex maps and swatch-choice lists are the entire
  contract; a storefront's own component (shop-ce's `@mercatus-liber/customization-ui` Web
  Component, `<ml-finish-color-picker>`, consuming this package directly) owns every pixel.
  Same separation this package's own sibling subsystems (`community-goals`, `pdp`, `theming`)
  already draw from their own data layers.
- **build.json / 3D-asset-build tooling.** Part placement, pivots, glTF animations, and STL
  assembly are the 3D-printing/model-forge tooling side's domain, never commerce data — this
  package only names region ids that must match a product's own GLB material names.
- **Cart/order capture of a shopper's selection or a `request`-status choice.** `CartItem`
  gaining a structured `{finishId, colors: Record<regionId, hex>}` field (replacing/
  supplementing the free-text `customizationNote`), plus a flag/note on the order when a
  `request`-status option was chosen so fulfillment sees it needs special handling, is a
  clearly-scoped, separate follow-up epic — not started as of this subsystem's initial ship.
- **A durable (sqlite/postgres) adapter in v1.** See "Responsibilities" above.

## Decoupling notes
`packages/customization`'s only dependency is `@mercatus-liber/core`. Verify via
`grep -rln "@mercatus-liber/customization" packages/*/src` before merge — every hit should be
this package's own `src`; it's consumed only by `apps/reference-storefront` (if/when wired) and
downstream by whichever storefront UI builds on top of it (shop-ce's `customization-ui`).

## Open questions
1. Structured cart/order customization-selection field — not started. See "Explicitly NOT"
   above; the real target shape (per a peer session's own stated order data) is
   `{ productId, finishId, colors: { regionId: "#hex" } }`.
2. Request-status order-capture flagging (a note/flag fulfillment sees) — not started, folded
   into the same follow-up epic as (1) above.
3. A durable (sqlite/postgres) adapter — not started; v1 ships in-memory only.

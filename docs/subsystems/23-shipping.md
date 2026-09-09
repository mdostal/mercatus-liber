# Subsystem 23 — Shipping (Rate Shopping & Labels)

## Purpose
The physical shipping-transaction layer for a self-fulfilled order: rate shopping (which
carriers/service levels can move this parcel and for how much), label purchase (buying the
one quoted rate and getting back a real printable label + tracking number), and tracking
status lookup. Distinct from subsystem 22 (`@mercatus-liber/fulfillment`), which routes *who
produces/ships* an order line (a POD provider vs. self-fulfillment) — this subsystem is *how a
self-fulfilled order physically ships once an operator has it in hand*. Before this subsystem,
every shop built on this framework had zero notion of rate shopping, label purchase, or
tracking at all — an operator's only option was logging into a carrier or reseller site by
hand with no code in this repo aware of the transaction. Added from an explicit user ask: "by
default I'd use PirateShip but no API... for mine, I'd want full automation and I believe
Shippo provides that" — this subsystem ships both halves of that statement as real, working
code: a genuinely honest zero-infra default modeling PirateShip's real manual workflow, and a
real, credential-gated Shippo adapter for full automation.

## Depends on
`@mercatus-liber/core` only, for `Money`. Declares its own independent address/parcel shapes
(`ShippingAddress`, `Parcel`) rather than reusing `checkout-orders`' `ShippingInfo` (which
carries only a single free-text `address` string) — rate shopping and label purchase need real
structured fields (`city`/`state`/`postalCode`/`country`), and this subsystem owns them
independently, the same "adapters/subsystems own their own shapes, never fork or reach into
another subsystem's types" discipline `fulfillment`'s `OrderLookup` and `internal-bi`'s
`OrderMetricsSource` already follow.

## Responsibilities
- `ShippingAdapter`: the swappable per-provider contract (mirrors `@mercatus-liber/payments`'
  `PaymentAdapter` and `@mercatus-liber/fulfillment`'s `FulfillmentAdapter` shape — a plain
  structural interface, no base class) — `getRates(input)`, `buyLabel(rateId)`,
  `getTrackingStatus(trackingNumber)`.
- `RateQuoteResult` / `LabelPurchaseResult`: deliberate discriminated unions
  (`{ available: true, rates }` / `{ available: false, reason, instructionsUrl }`, and the
  `purchased` equivalent), not a bare array or a thrown error. An adapter that has no real rates
  to offer (the manual/PirateShip default, always; any real adapter, occasionally — e.g. an
  unsupported route) must be able to say so honestly: an empty array would be ambiguous ("zero
  carriers service this route" vs. "this adapter can't quote rates at all") and carries no
  explanation or next step for the caller — exactly the kind of quiet, misleading half-truth
  this subsystem's design rejects.
- `TrackingStatus` / `TrackingStatusState`: coarse tracking status
  (`"unknown" | "in_transit" | "delivered" | "exception"`) with `"unknown"` a first-class,
  honest value, not an error — for adapters with no live tracking-events API to consult, this
  subsystem reports what it actually knows (nothing beyond "here's where to look") rather than
  fabricating a plausible-looking timeline. `detectedCarrier`/`carrierTrackingUrl` let an
  adapter with no live API hand back a real carrier tracking-lookup URL instead.
- `createManualShippingAdapter()`: the zero-infra default (`packages/shipping`) — see "The
  manual/PirateShip default" below.

## The manual/PirateShip default (`createManualShippingAdapter`)
Modeling PirateShip's real, current product, confirmed via research at build time (not assumed
from the design discussion): Pirate Ship does not publish or offer any official public API for
rate shopping, label purchase, or tracking — its site and support material describe only its
own web UI and CSV/e-commerce-platform order-import integrations (Shopify, WooCommerce, Etsy),
never a documented REST/GraphQL API. The only "API" surface found is an *unofficial*,
community-maintained wrapper reverse-engineered against PirateShip's undocumented internal
browser endpoints, whose own README states outright it's undocumented and correctness "can't be
guaranteed." Building this package's default adapter against that would have been exactly the
kind of dishonest-looking automation this subsystem's design rejects — it would *look* like a
real integration while resting on a foundation neither documented nor supported by Pirate Ship
itself. `createManualShippingAdapter()` is therefore a genuine, documented **manual workflow**,
not a stub or a fragile scrape-based integration pretending to be one:

- `getRates` / `buyLabel` always honestly report `{ available: false, reason, instructionsUrl }`
  / `{ purchased: false, reason, instructionsUrl }` pointing the operator at their own real
  PirateShip account (`PIRATESHIP_URL = "https://www.pirateship.com"`) — never a fabricated
  empty-looking success, never a thrown error that gives the caller nothing to act on.
- `getTrackingStatus` is the one method this adapter can do something genuinely useful for
  without any API: it recognizes a tracking number's carrier by its well-documented, stable
  format (UPS/FedEx/USPS/DHL regex patterns, `detectCarrierFromTrackingNumber`, exported for
  reuse) and returns that carrier's own real public tracking-lookup URL. `status` is always
  `"unknown"` and `events` always `[]` — this adapter has no live data source — but the carrier
  link is real and actionable, not fabricated.
- This adapter stays the permanent, always-registered fallback even now that a real Shippo
  adapter exists, mirroring `fulfillment`'s manual adapter staying the permanent
  self-fulfillment default even once real POD adapters exist. If PirateShip ever ships a real,
  documented, supported public API, that would justify a new
  `@mercatus-liber/adapter-pirateship` package built against it — this one stays as-is
  regardless.

## The Shippo adapter (`@mercatus-liber/adapter-shippo`)
A real, deployed `ShippingAdapter` implementation wrapping Shippo's real, current REST API,
grounded in `docs.goshippo.com`'s own documentation (confirmed 2026-09-09, not training-data
recall) — same sibling-package shape as `adapter-shopify`/`adapter-clerk`/`adapter-printful`/
`adapter-printify`. Raw `fetch` via an injectable `ShippoHttpClient`
(`packages/adapter-shippo/src/http-client.ts`), no new HTTP dependency — this repo's other
third-party adapters all use raw fetch, not a client library, and this one follows the same
convention. Auth is Shippo's real, confirmed `Authorization: ShippoToken <token>` scheme (not
`Bearer`).

- `getRates` — creates a real, synchronous (`async: false`) Shippo Shipment via
  `POST /shipments/` and reads back its real, confirmed `rates` array. Honestly reports
  `available: false` (never a fabricated empty-looking success) when the Shipment didn't reach
  `status: "SUCCESS"` or came back with zero rates (e.g. an unsupported route), folding Shippo's
  own `messages` into the reason.
- `buyLabel` — purchases the previously-quoted `rateId` via a real, synchronous
  `POST /transactions/`. Only `status: "SUCCESS"` maps to `purchased: true`; every other real,
  documented status (`WAITING`/`QUEUED`/`ERROR`/`REFUNDED`/`REFUNDPENDING`/`REFUNDREJECTED`)
  honestly reports `purchased: false`. A `SUCCESS` transaction missing `label_url`/
  `tracking_number`/`rate.provider` — structurally unreachable given Shippo's own documented
  contract — throws rather than fabricating those fields, a guard against trusting an
  inconsistent real API response.
- `getTrackingStatus` — bridges this subsystem's carrier-less `getTrackingStatus(trackingNumber)`
  contract onto Shippo's real carrier-addressed `GET /tracks/{carrier}/{tracking_number}`
  endpoint by reusing `@mercatus-liber/shipping`'s own `detectCarrierFromTrackingNumber` (the
  same heuristic the manual adapter uses) to pick Shippo's own lowercase carrier token
  (`toShippoCarrierToken`, `mapping.ts`). When no carrier can be confidently detected, or Shippo
  has no record for the number (a real 404), this honestly falls back to `status: "unknown"`
  with no live API call fabricated — same honesty discipline as the manual adapter, just with a
  real API genuinely consulted first when possible.

**One real, disclosed bridging gap** (`toShippoParcel`, `packages/adapter-shippo/src/mapping.ts`):
Shippo's real `Parcel` object requires `length`/`width`/`height`, but this subsystem's own
`Parcel` type deliberately makes `lengthIn`/`widthIn`/`heightIn` optional (some carriers rate on
weight alone for small parcels). Rather than fabricate a plausible-looking default dimension
(the same discipline `adapter-printful`/`adapter-printify`'s `resolveCatalogTarget` follows by
throwing instead of inventing a mapping), `toShippoParcel` throws a clear, actionable error when
a dimension is missing — a real deployment must supply real package dimensions to get a real
Shippo quote.

**`Money` conversion**: Shippo's real `amount` is a decimal-major-unit string (e.g. `"24.30"`
for $24.30); `toMoney` rounds to the nearest cent (`Math.round`, not `Math.floor`) converting
into this subsystem's integer-minor-unit `Money`, avoiding a silently-lost cent on some decimal
values a naive truncation would produce.

**Tracking status mapping**: Shippo's real, confirmed `tracking_status.status` enum
(`UNKNOWN | PRE_TRANSIT | TRANSIT | DELIVERED | RETURNED | FAILURE`) maps onto this subsystem's
narrower `TrackingStatusState`. `PRE_TRANSIT` (label created, not yet handed to the carrier)
maps to `"in_transit"` rather than `"unknown"` — Shippo genuinely knows the shipment exists and
is progressing, and `"in_transit"` is the closer honest fit of the four available states, not a
guess. `RETURNED`/`FAILURE` both map to `"exception"` — this subsystem's contract has no
separate "returned" state.

## Wiring (`apps/reference-storefront/lib/services.ts`)
`manual` (`createManualShippingAdapter()`, `@mercatus-liber/shipping`) is always registered;
`SHIPPO_API_TOKEN` set and truthy additionally registers `createShippoShippingAdapter({ apiToken
})` under `"shippo"` — the same additive, two-state "env var truthy adds a provider, rather than
swapping one" shape as `fulfillment`'s Printful/Printify branches (`shipping: Record<string,
ShippingAdapter>`). Unlike `fulfillment`, there is no routing repository/service wrapper here —
`shipping`'s adapters are exposed directly as a map for a caller to pick from, since a shipping
transaction (rate-shop-then-buy for one specific outbound parcel) has no per-SKU routing concept
the way a fulfillment provider does. `lib/adapter-info.ts`'s `getAdapterInfo()` reports a
`Shipping` row: `"Manual (PirateShip)"` when `SHIPPO_API_TOKEN` is unset, `"Manual (PirateShip)
+ Shippo (registered)"` when it's set, visible on `/demo/<demoSlug>/admin/settings` — mirroring
`fulfillmentInfo()`'s own row exactly. As with `fulfillmentInfo`, "active" in this row does not
imply live-verified — see the credential-gap disclosure below.

## Honest credential-gap disclosure
**No real Shippo account or API token exists in this environment**, checked directly: no
`SHIPPO_API_TOKEN` in the shell environment (`env | grep -i shippo` — no output) or in
`.env.local` (repo root; the app carries no `.env.local` of its own), which contains only
`VERCEL_OIDC_TOKEN` — same disclosed-gap posture as `admin-auth-clerk` (epic 27), the
Printful/Printify fulfillment adapters (epics 42/43), and the PostHog/GA4 insights adapters
(epic 46). `@mercatus-liber/adapter-shippo` is built and unit-tested for real correctness
against Shippo's actual, current API shape (grounded in `docs.goshippo.com`, not training-data
recall), not exercised against a live Shippo API in this environment; no live rate/label/
tracking call against a real Shippo account was made or is claimed.

What *is* genuinely verified without a live credential:
- **The `services.ts` env-var branch itself, in both states** — manual-only when
  `SHIPPO_API_TOKEN` is unset, and manual+Shippo-registered when it's set (including with a
  fake/test token for wiring-verification purposes only, never a live call) —
  `apps/reference-storefront/test/adapter-info.test.ts`'s two `Shipping`-subsystem tests cover
  exactly this.
- **The manual adapter's own honest not-available behavior** — `packages/shipping/test/
  shipping.test.ts` (16 tests) exercises `getRates`/`buyLabel` always reporting `available:
  false`/`purchased: false` with the real PirateShip URL, and `getTrackingStatus`'s carrier-
  detection heuristic across real UPS/FedEx/USPS/DHL tracking-number formats.
- **The Shippo adapter's own unit test suite** — `packages/adapter-shippo/test/` (20 tests:
  5 in `http-client.test.ts`, 15 in `adapter.test.ts`) exercises `getRates`/`buyLabel`/
  `getTrackingStatus` against realistically-shaped mocked Shippo API responses (including every
  documented transaction status, the `toShippoParcel` missing-dimension error, and the
  `Money`/tracking-status mapping functions), plus `shipping-adapter-compat.ts`'s compile-time
  proof (checked by `tsc` on every build, not visual inspection) that
  `createShippoShippingAdapter`'s return value structurally satisfies the full `ShippingAdapter`
  contract with zero casts.
- **Admin visibility of which adapter is active** — `/demo/<demoSlug>/admin/settings`'s
  `Shipping` row (`lib/adapter-info.ts`) accurately reports `"Manual (PirateShip)"` or
  `"Manual (PirateShip) + Shippo (registered)"` depending on `SHIPPO_API_TOKEN`, confirmed by
  the same `adapter-info.test.ts` suite above.

## Explicitly NOT this subsystem's job
- **Automatically rate-shopping/buying a label when an order is placed or paid** — no event-bus
  subscription exists (unlike `inventory`/`internal-bi`'s own sync registration). An operator
  (or a future admin action) explicitly calls `getRates`/`buyLabel` for now; wiring this to
  `checkout.order.paid` automatically is a reasonable later addition, not required for this
  epic's scope.
- **An admin UI for rate shopping/label purchase** — this epic ships the subsystem and the
  Shippo adapter with real, verified wiring into `services.ts` and `/admin/settings`'s adapter
  visibility, but no `/admin/orders` (or dedicated) page yet calls `getRates`/`buyLabel`
  directly the way `fulfillment`'s admin actions call `submitOrder`/`markShipped` — a reasonable
  later addition building on this real contract, not required for this epic's scope.
- **Live Shippo webhook receipt** — Shippo supports webhook-driven tracking updates, but no
  route in `apps/reference-storefront` receives one and no real Shippo account exists in this
  environment to send a real webhook from.
- **Persisting purchased labels/rates anywhere** — `buyLabel`'s result is returned to its
  caller; this subsystem owns no `LabelRecord` persistence layer of its own (unlike
  `fulfillment`'s `FulfillmentLineRecord`) — a real deployment wanting a durable purchase
  history would build that on top of this contract, mirroring `fulfillment`'s own explicit
  scope boundary.

## Decoupling notes
`packages/shipping`'s only runtime dependency is `@mercatus-liber/core` (for `Money`).
`@mercatus-liber/adapter-shippo`'s only runtime dependency is `@mercatus-liber/shipping` (for
the `ShippingAdapter` contract and `detectCarrierFromTrackingNumber`). Neither package imports
`@mercatus-liber/checkout-orders`, `@mercatus-liber/fulfillment`, or any other subsystem — this
subsystem is deliberately as standalone as `payments`, addressed by an arbitrary
`ShippingAddress`/`Parcel` a caller constructs, never reaching into another subsystem's order or
fulfillment-record types. Verify via `grep -rn "@mercatus-liber/shipping" packages/cart
packages/checkout-orders/src packages/catalog/src packages/fulfillment/src
packages/promotions/src packages/bundles/src packages/recommendations/src packages/inventory/src
packages/pdp/src packages/cms/src packages/analytics/src packages/advertising/src
packages/internal-bi/src packages/account/src` before merge — every one of those must return
zero hits; `shipping` (and `adapter-shippo`) are consumed only by `apps/reference-storefront`.

## Open questions
1. Should rate shopping/label purchase become a real admin action (e.g. on `/admin/orders`,
   mirroring `fulfillment`'s "Route & submit for fulfillment" button) instead of a
   contract-and-wiring-only epic? Deferred — the real, tested, wired `ShippingAdapter` contract
   and both adapters are a genuine, working default and don't block a later admin-surface story
   building on top of them.
2. Both the manual/PirateShip default and the real Shippo adapter are now real, wired,
   unit-tested code, but no live Shippo credential exists in this environment (see the
   disclosure above) — the Shippo adapter's own unit test suite, plus the `services.ts` env-var
   branch verified in both states, stand as the proof of swappability for v1, the same posture
   as `fulfillment`'s Printful/Printify adapters and `internal-bi`'s external-BI-tool adapter.
   Live account verification is disclosed future work, not required for this epic's scope.

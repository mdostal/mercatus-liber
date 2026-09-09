# Backlog addendum — dropship/POD fulfillment (2026-09-09)

**Why a separate file, not a direct edit to `epic-backlog.md`:** that file has live, frequent,
uncommitted edits in progress from a concurrent session (epic 40's research squad and the
33-40 wave landed today). This addendum is written standalone to avoid colliding with that
work. Whoever next runs a planning pass should fold these rows into `epic-backlog.md` proper
at the next available epic numbers (41+ as of this writing — confirm the actual next number
at merge time, since 40 was still moving).

**Source:** direct user request (2026-09-09), from the `shop` repo session, about shop.mdostal.com:
adding 5+ SKUs before going live, including dropship print-on-demand (POD) branded merch (mugs,
cups, apparel with the dragon logo) alongside the existing self-3D-printed products. Asked for a
deep dive on integration approach and to open backlog tickets on the framework side.

**Relationship to epic 40 (`commerce-feature-parity-research`):** that epic's research squad is
independently surveying Shopify/BigCommerce/WooCommerce-class feature gaps broadly and may
surface fulfillment/dropshipping as one of many findings. This addendum is narrower and already
concretely scoped (a specific user request, not a general survey) — if epic 40's findings also
name dropship fulfillment, merge the two rather than duplicating; this addendum's research below
supersedes a shallow mention there since it's already provider-specific and API-verified.

---

## Research summary (verified against live provider docs 2026-09-09, not training-data recall)

**No existing concept of "who/how an order gets fulfilled" exists in this repo today.**
`checkout-orders`' `Order.status` (`pending_payment → paid → fulfilled → cancelled`) has no
notion of a fulfillment provider, per-line routing, or external tracking. Every shop built on
this framework so far implicitly assumes 100% self-fulfillment (an operator marks orders
fulfilled by hand). A mixed self-printed + dropshipped order is a genuinely new case.

### Printful
- Two live APIs: **v1** (mature) and **v2** (open beta). **v2 does not yet support
  product/variant sync or mockup templates** — that's v1-only today, so a real integration
  spans both versions (v1 for catalog/product setup, v2 preferred for orders once confirmed
  stable, v1 as fallback).
- Auth: Bearer API token, or OAuth2 with scopes.
- Mockups: `POST /v2/mockup-tasks` (catalog product id + variant ids + placement + design file
  URL; async, poll or `mockup_task_finished` webhook).
- Orders: `POST /v2/orders` lands as **draft, uncharged**; `POST /v2/orders/{id}/confirm` moves
  to production and charges. Status via polling or webhooks (`order_created`, `order_updated`,
  `shipment_sent`, `shipment_delivered`).
- **Billing: prepaid Wallet.** Every confirmed order draws from a Printful balance (manual
  top-up or auto-recharge from a card/PayPal at a threshold) — Printful charges *you*, you set
  your own retail price and keep the spread. No subscription, no minimum order.
- Rate limit: 120 req/min (v2).
- Concrete anchor: 11oz white glossy mug base cost **~$5.95**. Design spec ~300 DPI,
  ~2475×1155px (varies by wrap style), sRGB.
- Sources: developers.printful.com/docs/v2-beta/, Printful help center articles on API v2,
  Wallet, and billing.

### Printify
- **Marketplace model, not a single factory** — the same product (e.g. a mug) can be fulfilled
  by multiple independent print providers with *different base cost, print quality, and
  shipping time/rates*. "Printify Choice" can auto-route to the nearest regional provider for
  supported products; otherwise a provider is picked per listing manually. This is a real
  integration complexity a Printful-only design doesn't have: SKU→provider routing affects
  margin and delivery promise, and a provider swap on an existing SKU can silently change
  shipping cost/time.
- Auth: Personal Access Token (1-year expiry) or OAuth2 for multi-merchant apps; every request
  needs an app-identifying `User-Agent` header.
- Orders: `POST /v1/shops/{shop_id}/orders.json`. **Charged only when an order moves to
  production** — draft/on-hold/cancelled-before-production costs nothing. No wallet
  abstraction; charges whatever payment method is on file at that moment.
- Webhooks: `order:created`, `order:sent-to-production`, `order:shipment:created`, etc.
- Sources: developers.printify.com/docs/, Printify help center on API tokens, multi-provider
  listings, shipping cost calculation.

### Others
Gooten and CustomCat are credible alternatives with similar REST-order-submission models;
nothing found that clearly beats Printful/Printify for a small single-operator shop, so not
worth the added integration surface right now.

### Getting started cost/commitment
Both are free to sign up with no subscription and no minimum order quantity (true
zero-inventory, produced only when an order comes in). Both support building/testing the
integration at $0: Printful's draft orders are uncharged until `confirm`; Printify's
draft/on-hold orders are uncharged until production starts. Printful needs a funded Wallet
(or auto-recharge configured) before a *real* order can actually produce; Printify needs a
payment method on file that only gets charged at production-start.

### Unverified, flag before writing real adapter code
- Exact current field-level schema for Printful v2 `POST /v2/orders` (shape confirmed, not a
  full formal spec).
- Printful v2's webhook signature/HMAC verification format (v2 docs mention "request signing"
  as an improvement; exact verification mechanism not confirmed in this pass).
- Printify's exact rate limits (not surfaced; Printful's 120/min was clearly documented,
  Printify's wasn't found in this pass).

---

## Recommendation

**Printful first**, Printify as a credible second adapter once the pattern is proven — mirrors
how this repo already proved "third-party platform adapter" once with Shopify before
considering others, rather than building multi-provider routing complexity on day one. Reasons:
single-vendor model needs no per-SKU provider-selection/routing decision the way Printify's
marketplace does; the draft→confirm order flow and Wallet auto-recharge are a clean fit for a
small, single-operator shop; mockup generation for placing a logo on a product template is
directly documented. This is a recommendation, not a decision made on the business owner's
behalf — final call on which provider(s) to actually sign up for is his.

---

## Proposed epics (numbers TBD at merge time — written as A/B/C, fold into epic-backlog.md as 41+)

### Epic A: `fulfillment-routing` (foundational, provider-agnostic)

New subsystem, `@mercatus-liber/fulfillment` — same narrow-adapter-contract pattern as every
other subsystem in this repo (`PaymentSessionCreator`/`PricingAdjuster` in checkout-orders is
the closest existing template).

- `FulfillmentAdapter` interface: `submitOrder(...)`, `getOrderStatus(...)`,
  optional `handleWebhookEvent(...)` — mirrors `PaymentAdapter`'s shape in `packages/payments`.
- `FulfillmentRoutingRepository`: skuId → provider-key mapping (default: every SKU implicitly
  routes to a `"manual"` provider unless explicitly mapped otherwise) — owns this mapping
  itself rather than adding a field to `Product`/`Sku`, same "adapters reference SKUs by id
  only, never fork catalog's own types" discipline `bundles`/`promotions`/`recommendations`
  already follow.
- Default reference implementation: `createManualFulfillmentAdapter()` — zero-infra, models
  exactly today's *implicit* behavior (an operator fulfills by hand), needed regardless of
  whether a real POD adapter ever gets built, and the fallback for every self-printed SKU even
  after one does.
- **Design question to resolve during planning, not guessed here:** how a single order with
  mixed self-fulfilled + dropshipped lines is represented. Recommendation to evaluate: keep
  `checkout-orders`' `Order.status` as the coarse/aggregate status (unchanged contract), and let
  this new subsystem own its own per-order-line fulfillment records (orderId + skuId → provider,
  externalOrderId, status, trackingNumber/URL) read *alongside* orders via a narrow
  `OrderLookup`-shaped structural interface — the same non-forking relationship `internal-bi`
  already has with `Order`. Confirm this is actually sufficient before committing to it as the
  final design.
- Admin UI: new `/admin/fulfillment` (or a real extension of today's list-only `/admin/orders`)
  showing per-line routing + status, and a "mark shipped" action for manually-routed lines.
- **Depends on:** 1 (core-foundation), 9-ish familiarity with the existing payments adapter
  shape as the pattern template. No dependency on any specific POD provider — ship this before
  deciding Printful vs. Printify vs. both.

### Epic B: `adapter-printful`

Real third-party wrapper, `@mercatus-liber/adapter-printful`, implementing epic A's
`FulfillmentAdapter` against Printful's v1 (product/mockup) + v2 (orders, preferred once
confirmed stable) APIs — same shape as `adapter-shopify`/`adapter-clerk`/`adapter-sanity`: a
sibling package, real HTTP calls, external-id mapping via whatever field Printful's own API
uses for merchant-supplied references (research during planning; `adapter-shopify`'s reserved-
metafield approach is the precedent if Printful has no equivalent native field).

- **Blocked on a real credential**: a Printful account + API token. Per this repo's own
  standing policy, that's a real external-service/credential gate — surface it, don't invent a
  fake one, when this epic is actually planned/executed.
- Needs the two unverified items above (exact v2 order schema, webhook signature format)
  confirmed against live docs during planning, not assumed from this research pass.
- **Depends on:** A.

### Epic C: `adapter-printify` (later, optional)

Same shape as B, against Printify's API. Explicitly a *second* provider once A + B are proven —
not needed to ship the first wave of merch. Note the marketplace/multi-provider-per-listing
complexity in the research section above as a real design consideration this adapter will need
to resolve (which underlying print provider a given Printify-routed SKU actually uses, and how
that's surfaced to routing/margin decisions), not present in Printful's single-vendor model.

- **Depends on:** A. Independent of B (could be built without Printful ever existing).

---

## What this means concretely for shop.mdostal.com (not a mercatus-liber code question)

Business/manual steps, not code, and not this addendum's job to execute:
1. Pick a provider (recommendation above: start with Printful) and create the account.
2. Upload the dragon logo artwork at print-ready spec (Printful: ~300 DPI, sRGB, size varies by
   product/wrap — confirm exact spec per product when actually building templates) and set up
   product templates/mockups for the chosen items (mugs/cups/apparel) directly in that
   provider's own dashboard.
3. Decide retail pricing per item against the provider's base cost (e.g. Printful's ~$5.95 mug
   base) — a margin/business decision, not something this addendum decides.
4. Once epics A (+ B if Printful) are built in mercatus-liber and shop vendors the resulting
   packages (same pattern as this session's admin-auth/promotions integration), wire the real
   API token in via Portunus + Vercel env, same handling as every other credential this shop
   uses.

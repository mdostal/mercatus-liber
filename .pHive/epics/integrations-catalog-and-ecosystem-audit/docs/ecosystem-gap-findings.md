# Ecosystem gap audit — findings (2026-10-07)

Story `ica-02-ecosystem-gap-audit`, epic `integrations-catalog-and-ecosystem-audit` (77). Same
methodology as `commerce-gap-audit-3` (`.pHive/epics/commerce-gap-audit-3/docs/audit-findings.md`):
read real code first, then verify every candidate against real, current third-party documentation
(not training-data memory) via live web search, and dispose of each finding honestly — fix-now,
new-epic-candidate, already-on-VISION.md, or not-a-real-gap.

This audit is about missing integration **categories** (third-party systems this framework has no
adapter for at all), distinct from `VISION.md`'s "Wanted, not started — the community plugin
frontier" table (epic 47), which catalogs missing **features** verified against Shopify/
BigCommerce/WooCommerce documentation. Read in full before starting this audit; cross-referenced
per finding below rather than duplicated.

**Real current adapter/provider inventory, verified via `ls packages/` before researching any
candidate:** 12 adapter packages (`adapter-clerk`, `adapter-cloudinary`, `adapter-convex`,
`adapter-mongodb`, `adapter-postgres`, `adapter-postgres-inventory`, `adapter-printful`,
`adapter-printify`, `adapter-sanity`, `adapter-shippo`, `adapter-shopify`, `adapter-sqlite`), plus
built-in provider integrations inside non-adapter-named packages: `payments` → Stripe only
(`stripe-adapter.ts`, `sandbox-adapter.ts`), `analytics` → PostHog + GA4. `packages/plugins` is the
in-process event-subscription extension point (`core/event-bus.ts`'s in-memory pub/sub); it has no
outbound-HTTP delivery mechanism of any kind. No `tax`, `accounting`, `erp`, `marketplace`,
`loyalty`, `paypal`, `braintree`, `zapier`, or `webhook`-as-outbound-delivery package or module
exists anywhere in `packages/` (confirmed by repo-wide grep, not assumed).

## Summary

| # | Candidate | Real gap? | Disposition |
|---|---|---|---|
| 1 | Tax calculation (TaxJar/Avalara-class) | **Partial — not the clean gap the premise assumes** | **NOT A FULL GAP**, documented nuance below |
| 2 | Accounting/ERP sync (QuickBooks/Xero-class) | **Yes, genuine** | **New-epic-candidate**: `accounting-erp-sync-adapter` |
| 3 | Email/SMS marketing provider adapter (Klaviyo/Postmark-class) | Yes, but already captured | **Already on VISION.md's table** (rows 268–269), small clarifying fix applied |
| 4 | Marketplace/channel sync (Amazon/eBay-class) | Yes, but already captured | **Already on VISION.md's table** (row 276) — not re-litigated |
| 5 | Webhook/automation layer (Zapier-class, generic outbound event delivery) | **Yes, genuine** | **New-epic-candidate**: `outbound-webhook-event-delivery` |
| 6 | Second payment processor (PayPal/Braintree-class) | **Yes, genuine** | **New-epic-candidate**: `second-payment-processor-adapter` |
| 7 | Loyalty/rewards provider integration | Yes, but already captured | **Already on VISION.md's table** (row 273) — refined, not re-litigated |

Two small, in-scope doc fixes applied directly (committed with this document):
- `VISION.md`'s "Loyalty / rewards programs" row's contribution shape refined from "New subsystem"
  to name the real provider-adapter shape this audit's research surfaced (Smile.io/LoyaltyLion-class),
  mirroring how the email/SMS row already names Klaviyo/Postmark.
- No other `VISION.md` edit needed for findings 3/4 — both already name the correct provider class
  and gap, verified against the exact text, not re-litigated.

---

## 1. Tax calculation — NOT a full gap, documented nuance

**What was checked first (code, not assumption):** `packages/payments/src/stripe-adapter.ts` line
63 — `createPaymentSession` calls `stripe.checkout.sessions.create({ ..., automatic_tax: { enabled:
true }, ... })`. The file's own header comment (lines 38–44) states the adapter "wraps Stripe
Checkout Sessions (dynamic line items, hosted Checkout UI, **Stripe Tax**)... every sensitive/
compliance-bearing operation is delegated to Stripe's own hosted surfaces."

**Web-verified against Stripe's own current documentation** (`docs.stripe.com/tax/checkout`,
`stripe.com/docs/tax`): Stripe Tax, enabled via `automatic_tax.enabled = true` on a Checkout
Session, "automatically calculates the taxes on all purchases... based on the customer's location,"
supporting "sales tax, VAT, and GST across 50+ countries" — the same real-time, address-based
calculation TaxJar/Avalara sell as their core product (confirmed against
`developers.taxjar.com/api`'s `/v2/taxes` endpoint description and Avalara's AvaTax real-time
calculation docs, both of which compute tax from ship-from/ship-to address + line items at
checkout time, the identical shape Stripe Tax already performs here).

**So the premise ("no adapter for this category at all") does not hold for the framework's primary
production payment path.** Real-time, address-based sales tax calculation is already live and
wired for every Stripe checkout session today — this is a genuine integration, just delegated
through Stripe rather than a dedicated TaxJar/Avalara package.

**What is still a real, honestly-disclosed gap, smaller than the original premise:**
- `packages/payments/src/sandbox-adapter.ts` (the zero-key default every demo uses when
  `STRIPE_SECRET_KEY` is unset) computes `totalAmount` as a flat sum of line items with **no tax
  line at all** — acceptable for a "practice card" stub, but worth knowing: the reference
  storefront's default, credential-free path shows $0 tax, not real tax.
- Tax calculation is not its own adapter interface the way `PaymentAdapter` (`packages/payments/
  src/types.ts`) is — it's a single boolean flag hardcoded inside the Stripe-specific adapter. If
  finding 6 below (a second payment processor) is ever built, that processor's checkout path would
  not automatically inherit any tax calculation — PayPal's own Orders v2 API (verified against
  `developer.paypal.com/api/rest/integration/orders-api`) and Braintree's GraphQL API (verified
  against `developer.paypal.com/braintree/graphql/integration_guides/paypal`) both require the
  calling application to supply its own pre-computed tax amount as a line item; neither bundles an
  equivalent of Stripe Tax.

**Disposition: not a full gap, not written up as a new-epic-candidate.** Stripe Tax already closes
the real, live-path need; a dedicated provider-agnostic tax adapter (TaxJar/Avalara-class) would
mostly duplicate what Stripe Tax already does for the one real payment path this framework ships
today. Documented here, not escalated, matching this repo's own "be honest when it's not a real
gap" precedent (`commerce-gap-audit-3` findings 6/14). If/when finding 6 (second payment processor)
is actually built, that future epic's own design discussion should explicitly decide whether to
reuse Stripe Tax as a standalone calculation call (Stripe's Tax Calculations API works independent
of Checkout) or require a real TaxJar/Avalara integration at that point — flagged there, not here,
so this audit doesn't scope-creep into speculative design for work not yet planned.

## 2. Accounting/ERP sync (QuickBooks/Xero-class) — genuine gap

**Checked first:** repo-wide grep for `quickbooks`, `xero`, `erp`, `accounting` across every
`packages/*/src` — zero hits. No adapter, no built-in integration, no mention in `VISION.md`'s
community-plugin table or anywhere in `.pHive/planning/epic-backlog.md` (grepped directly, not
assumed).

**Web-verified:** QuickBooks Online's API (`developer.intuit.com`) is "the canonical accounting
integration for B2B SaaS products targeting SMB and mid-market customers" — a RESTful JSON API over
OAuth 2.0 (1-hour access / 100-day refresh tokens), with `SyncToken`-based optimistic locking per
write and Change Data Capture for incremental sync (verified against `getknit.dev`'s QuickBooks
integration guide, cross-checked against Intuit's own developer portal framing). Xero's API
(`developer.xero.com`) spans 11 distinct APIs (Accounting, Payroll, Bank Feeds) and over 100
endpoints, requiring an `xero-tenant-id` header after OAuth tenant selection — covering invoices,
payments, contacts, credit notes, and tax rates, the exact order/financial data a commerce platform
would need to push into a merchant's real books.

**Why this is a genuine, distinct infrastructure gap:** every commerce order this framework
processes today (`packages/checkout-orders`) lives only inside this framework's own persistence —
there is no mechanism, adapter interface, or even a documented extension point for pushing a
completed order into a merchant's real accounting system of record. This is a different shape of
integration than anything the 12 existing adapters cover (none of them are outbound-financial-sync).

**Disposition: new-epic-candidate — `accounting-erp-sync-adapter`.** Real, well-justified scope: a
new adapter interface (mirroring `PaymentAdapter`'s shape) that syncs completed orders/line
items/payments to a double-entry accounting system, with QuickBooks Online as the reference
implementation (largest SMB accounting install base, well-documented OAuth + REST API) and Xero as
the natural second implementation once the interface is proven. Depends on: none (additive, no
core-schema changes — would subscribe to `checkout-orders`'s existing `checkout.order.placed`-class
events via the event bus, same shape as `packages/plugins`'s reference `order-notification-plugin`).
Building the actual adapter is explicitly out of scope for this story.

## 3. Email/SMS marketing provider adapter (Klaviyo/Postmark-class) — already on VISION.md, small fix applied

**VISION.md's existing table, read first** (lines 268–269):

> | Abandoned-cart recovery | Automated email/SMS nudges for incomplete carts | Needs an
> email/SMS provider integration this project doesn't have yet | New subsystem + provider adapter
> (e.g. Klaviyo, Postmark) |
> | Lifecycle email/SMS marketing | Broader automated marketing flows beyond cart recovery | Same
> provider-integration gap as above | Same shape, larger scope |

This story's brief specifically asks the *distinct* question: separate from the deferred
*feature* (abandoned-cart recovery / lifecycle email), should a real *provider adapter* for this
category exist as infrastructure even if the feature stays community territory? Reading the table
text closely: it already answers that question — the "Contribution shape" column explicitly names
"provider adapter (e.g. Klaviyo, Postmark)" as part of what a contributor would build, not just the
feature subsystem. The infrastructure-adapter need is not a separate, unaddressed gap; it's already
named as the mechanism by which the feature would be built.

**Web-verified the provider class is real and current, for completeness, not because it was in
doubt:** Klaviyo's API (`developers.klaviyo.com/en/reference/api-overview`) exposes profiles,
events, lists, segments, campaigns, flows, catalogs, coupons, and webhooks — a real, current
e-commerce marketing automation API. Postmark's API (`postmarkapp.com`) is a transactional-email
REST API (Server + API token + domain DKIM verification, `/email` and `/email/withTemplate`
endpoints) with official SDKs for Node/Ruby/Python/.NET/PHP/Go.

**Disposition: already on VISION.md's table — not a new finding, not re-litigated.** One small,
genuinely in-scope doc fix applied: none needed to this specific row (its "Contribution shape"
cell already names the provider adapter correctly) — see finding 7 below for the one row that
*did* warrant a small refinement.

## 4. Marketplace/channel sync (Amazon/eBay-class) — already on VISION.md, not re-litigated

**VISION.md's existing table, row read directly** (line 276):

> | Marketplace / social channel sync | List and sync inventory to Amazon, Instagram/TikTok Shop,
> Google Shopping | Each is its own real third-party integration with its own auth/data model | One
> adapter per channel |

This is the exact category this audit was asked to check — already present, already correctly
scoped as "one adapter per channel," already flagged as deliberately community-contributable.
`.pHive/planning/epic-backlog.md` row 47 independently confirms this was folded in from epic 40's
own research pass (2026-09-09), citing Amazon/Instagram/TikTok Shop/Google Shopping by name.

**Web-verified for completeness, confirming the row's framing still holds today:** Amazon's
Selling Partner API (`developer-docs.amazon.com/sp-api`) — the Listings Items API (current version
`v2021-08-01`) supports creating/updating listings and syncing prices across marketplaces; eBay's
Inventory API + Feed API (`developer.ebay.com/develop/selling-apps/listing-management`) support the
same shape (inventory item records converted to marketplace offers, bulk feed upload/download).
Both remain real, distinct, per-channel auth/data-model integrations exactly as the existing row
describes — no correction needed.

**Disposition: confirmed already covered, no new finding, no edit.**

## 5. Webhook/automation layer (Zapier-class, generic outbound event delivery) — genuine gap

**Checked first, per this story's explicit instruction, before researching anything external:**
- `packages/core/src/event-bus.ts` — `createInMemoryEventBus()`'s own header comment states
  plainly: "Default in-process implementation... A queue/Redis-backed EventBus implementation for
  multi-instance deploys is a later, separate adapter." `publish`/`subscribe` are purely in-process
  function calls; there is no HTTP delivery, no persistence, no retry, no signing anywhere in this
  file.
- `packages/plugins/src/types.ts` — `PluginContext` exposes exactly one thing to a plugin: `events:
  EventBus`. `packages/plugins/src/registry.ts`'s `initAll` runs each plugin's `init(ctx)` in the
  same process. `packages/plugins/src/order-notification-plugin.ts`, the one reference plugin, only
  pushes to an in-memory array — its own comment says "A real deployment would send an email/Slack
  message here instead of logging in-memory," i.e. even the reference implementation's own
  documentation acknowledges that reaching an external system is left to each plugin's own
  hand-rolled HTTP call, not a framework-provided delivery mechanism.
- `docs/subsystems/12-plugins-extensibility.md` confirms this is by design: the subsystem's whole
  job is "the event-subscription-based extension points," nothing about outbound delivery to a
  third party; its own "Open questions" section (distribution, sandboxing, versioning) never raises
  outbound HTTP delivery either.
- Repo-wide grep for `webhook` across `packages/*/src` and `apps/reference-storefront` found only
  **inbound** webhook handling — Stripe (`payments/src/stripe-adapter.ts`'s
  `handleWebhookEvent`), Printful/Printify/Shippo's own webhook receivers
  (`adapter-printful/src/webhook.ts`, `adapter-printify/src/webhook.ts`) — i.e. this framework
  already knows how to *receive* a webhook from a provider, but has no mechanism to *send* one out
  to an arbitrary subscriber (Zapier, Make, n8n, or a merchant's own endpoint) when something
  happens inside it.

**Web-verified the real shape such a layer would need to match:** Zapier's own Platform docs
(`platform.zapier.com/build/hook-trigger`, `docs.zapier.com/platform/build/cli-hook-trigger`)
describe "REST Hooks" as the expected integration contract: Zapier calls a `Subscribe` endpoint
with a target URL per activated Zap, the app stores it, and "your app sends a payload of data back
to the unique URL to trigger that particular Zap whenever that trigger event occurs" — i.e. the
app must support dynamic subscription management (subscribe/unsubscribe per external consumer) plus
outbound HTTP delivery keyed to its own internal events. Nothing in this framework today provides
either half of that contract for anything other than the single in-process event bus.

**Disposition: new-epic-candidate — `outbound-webhook-event-delivery`.** Real, well-justified,
clearly distinct from the existing in-process plugin system (which this audit was specifically
asked to check first, per the story brief, and did): a new subsystem/package that (a) lets an
external consumer register a target URL against one or more internal event names (the same
`"<subsystem>.<thing>.<pastTenseVerb>"` naming convention `core/event-bus.ts` already documents),
(b) subscribes internally to the existing `EventBus` and performs signed, retried outbound HTTP
POSTs to each registered subscriber on every matching publish, and (c) exposes a REST-Hooks-shaped
subscribe/unsubscribe contract so Zapier (or Make/n8n/a merchant's own receiver) can integrate
without this framework needing a bespoke integration per automation platform. Depends on: `core`'s
`EventBus` only (additive, same non-invasive shape as the plugin system). Building the actual
subsystem is explicitly out of scope for this story.

## 6. Second payment processor (PayPal/Braintree-class) — genuine gap

**Checked first:** `packages/payments/src` has exactly two files implementing `PaymentAdapter`:
`stripe-adapter.ts` and `sandbox-adapter.ts` (a zero-provider practice-mode stub, not a second real
processor). Repo-wide grep for `paypal`/`braintree` across `packages/*/src` — zero hits. Not
mentioned anywhere in `VISION.md`'s table or `epic-backlog.md`.

**Web-verified:** PayPal's Orders v2 API (`developer.paypal.com/api/rest/integration/orders-api`)
— `POST /v2/checkout/orders` to create (with `intent: CAPTURE` or `AUTHORIZE`), `POST
/v2/checkout/orders/{id}/capture` to capture funds — a real, current, well-documented REST flow.
Braintree's GraphQL API (`developer.paypal.com/braintree/graphql/integration_guides/paypal`;
Braintree is itself a PayPal company) supports PayPal-as-payment-method plus direct card
processing through a single-use payment-method token returned to the merchant server, needing
Public Key/Private Key/Merchant ID credentials.

**Why this is genuinely distinct from finding 1's tax nuance:** `PaymentAdapter`
(`packages/payments/src/types.ts`) is already a clean, provider-agnostic interface — exactly the
kind of adapter boundary this framework's whole pattern is built on (the same shape as the 12
existing storage/CMS/fulfillment adapters). A second real implementation of that exact interface
for PayPal or Braintree is a mechanically well-scoped, well-precedented shape of work — but it does
not exist today, and every demo's checkout is 100% Stripe-or-sandbox.

**Disposition: new-epic-candidate — `second-payment-processor-adapter`.** Real, well-justified:
implement `PaymentAdapter` a second time against PayPal's Orders v2 API (most broadly recognized
alternative processor, no new interface design needed — the existing contract already fits), with
Braintree as a plausible follow-on given its shared PayPal ownership and card-processing superset.
Flags finding 1's tax-coupling risk explicitly for that future epic to resolve (PayPal/Braintree
have no Stripe-Tax-equivalent bundled calculation). Depends on: none beyond the existing
`PaymentAdapter` interface (additive). Building the actual adapter is explicitly out of scope for
this story.

## 7. Loyalty/rewards provider integration — already on VISION.md, contribution-shape refined

**VISION.md's existing table, row read directly** (line 273, before this audit's edit):

> | Loyalty / rewards programs | Points, tiers, redeemable rewards | Independent of the core
> purchase loop | New subsystem |

This category is already explicitly on the table, already correctly identified as deliberately
not-core. Confirmed via `epic-backlog.md` row 47 that it was folded in from epic 40's own research
pass (2026-09-09) under the same `vision-and-community-roadmap` epic — not a new discovery.

**Web-verified this audit's one genuine addition — the real provider landscape for this category:**
Smile.io (per its own marketing and third-party comparison data cross-checked across
`softwareadvice.com.au` and `getapp.de`) "powers reward programs for 30,000 merchants," offering
points/referral/VIP-tier programs with API access on its Enterprise tier, and explicitly integrates
with Klaviyo and other e-commerce tools. LoyaltyLion is its closest direct competitor, with
comparable points/API/third-party-integration feature parity. This confirms loyalty/rewards is, in
practice, a **provider-integration category** (merchants overwhelmingly buy a hosted loyalty
platform rather than build one in-house) — the same shape as the email/SMS row (finding 3), not a
wholly novel in-house subsystem the "New subsystem" wording alone implies.

**Disposition: already on VISION.md's table, one small fix-now applied directly** (in scope for
this story — a doc clarification, not a new adapter): the "Contribution shape" cell is refined from
"New subsystem" to explicitly name the real provider-adapter shape (Smile.io/LoyaltyLion-class),
mirroring how the email/SMS row (finding 3) already names Klaviyo/Postmark. This is a small,
research-grounded correction to an existing row, not a new finding and not re-litigating the row's
substance (which remains correct: still deliberately not core, still community-contributable).

---

## What this audit actually changed

1. `VISION.md` — refined the "Loyalty / rewards programs" row's "Contribution shape" cell (finding
   7) to name the real provider-adapter class (Smile.io/LoyaltyLion), matching this audit's
   web-verified research. One-line table-cell edit, no other table rows touched, no features
   re-litigated.
2. This document.

No new adapter package was built (explicitly out of scope for this story, per its own brief). No
code outside `VISION.md`'s one table cell was changed — this is a research/writeup story, so the
full monorepo check is expected to be a no-op; run and confirmed clean (see commit for the exact
`pnpm turbo run typecheck test build --force` result).

**Real, well-justified new-epic-candidates surfaced by this audit, for `.pHive/planning/
epic-backlog.md` to pick up later** (not added to that file directly, matching this story's own
scope boundary and the `commerce-gap-audit-3` precedent of listing candidates in the audit doc
rather than self-scheduling them):
- `accounting-erp-sync-adapter` (finding 2)
- `outbound-webhook-event-delivery` (finding 5)
- `second-payment-processor-adapter` (finding 6)

# Architecture — Mercatus Liber

_This document is the single map of how the system is decomposed and the rule that keeps it
decomposed as it grows. `.pHive/planning/epic-backlog.md` is the full build ledger._

## Why this exists
Every free/OSS commerce option evaluated for `shop.mdostal.com` (Medusa, Saleor, Vendure,
Spree/Solidus, Shopware, Bagisto/Sylius)
either forces the wrong stack, forces infrastructure a small shop doesn't need, or isn't
actually free. None of them, and no other free package found, cleanly separates a **sales
catalog** from a **marketing catalog** the way enterprise platforms (e.g. IBM's commerce stack)
do — that separation, plus a schema-first / adapter-everywhere architecture, is the actual gap
this project fills. `shop.mdostal.com` is its first real outside deployment.

## Prime directive: no tight coupling
Every subsystem below is a **separate package** with its own published interface (TypeScript
types + a small set of functions/classes it must implement). Subsystems never import each
other's internals. They interact only through:

1. **Shared core types** (`@mercatus-liber/core`) — the product/SKU/attribute/category/order/etc.
   shapes every subsystem agrees on.
2. **Adapter interfaces** — a subsystem that needs another capability (e.g. checkout needs
   payments) depends on an *interface*, not a concrete package. The host app wires a concrete
   implementation in at startup (dependency injection / config), not the subsystem itself.
3. **An event bus** for side-effecting workflows that shouldn't know about each other directly
   (e.g. `order.placed` → inventory subsystem decrements stock, notification subsystem sends an
   email — neither the checkout subsystem nor the inventory subsystem imports the other; both
   just publish/subscribe to named events with a typed payload).

**Test for whether something violates this:** if deleting/replacing subsystem A requires
changing a line of code inside subsystem B, they're too coupled. Swapping the Stripe payment
adapter for a different one, or swapping the Postgres DB adapter for SQLite/Mongo, must never
touch catalog, cart, or CMS code.

## Repo shape
A pnpm and Turborepo monorepo:

```
packages/
  core/                 schema, shared types, adapter interfaces, event bus (the contract)
  <subsystem>/          one package per subsystem, e.g. catalog, cart, checkout-orders
  adapter-<provider>/   one package per provider, e.g. adapter-postgres, adapter-printify
  ai-interface/         MCP server and tool definitions
  create-store/         store scaffolder
  auto-update/          applies updates to a scaffolded store
  migrate-shopify/      one-time Shopify import
  customization-ui/     framework-agnostic customizer Web Component
  storefront-ui/        common React storefront components
apps/
  reference-storefront/ the sample stores (Next.js)
  docs/                 the docs site (Nextra)
docs/
  ARCHITECTURE.md       this file
  subsystems/           one doc per subsystem
```

**Where UI lives.** Sample stores in `apps/reference-storefront` are public examples meant to be
copied. Themes live in `packages/theming`. Common components are moving to `packages/storefront-ui`, which holds the customizer, price
breakdown, and the cart and product page templates so far. The rest still live inside the app at `apps/reference-storefront/components`, and
a default UI built on the package is planned, not built.

`shop.mdostal.com` (separate repo) consumes these packages, vendored as `pnpm pack` tarballs until
they are on npm, with its own concrete config — it is NOT part of this monorepo. That keeps the "framework" and "a
real shop built on the framework" cleanly separate, and proves the packages work for an actual
external consumer, not just the in-repo reference app.

## Subsystem map

| # | Subsystem | Depends on (interfaces only) | Doc |
|---|---|---|---|
| 00 | Core schema & adapter contracts | — (the foundation) | [subsystems/00-core-schema.md](subsystems/00-core-schema.md) |
| 01 | Product Catalog (products, SKUs, attributes) | core | [subsystems/01-catalog.md](subsystems/01-catalog.md) |
| 02 | Marketing Catalog (categories) | core, catalog (read-only) | [subsystems/02-marketing-catalog.md](subsystems/02-marketing-catalog.md) |
| 03 | Search | core, catalog (read-only, via events/reindex) | [subsystems/03-search.md](subsystems/03-search.md) |
| 04 | Product Display Page (PDP) | core, catalog, theming | [subsystems/04-pdp.md](subsystems/04-pdp.md) |
| 05 | CMS (5 page types + components) | core, marketing-catalog, theming | [subsystems/05-cms-pages.md](subsystems/05-cms-pages.md) |
| 06 | Theming & Layout | core only | [subsystems/06-theming-layout.md](subsystems/06-theming-layout.md) |
| 07 | Cart | core, catalog (read-only) | [subsystems/07-cart.md](subsystems/07-cart.md) |
| 08 | Payments | core only (adapter interface) | [subsystems/08-payments.md](subsystems/08-payments.md) |
| 09 | Checkout & Orders | core, cart, payments (interface), inventory (event) | [subsystems/09-checkout-orders.md](subsystems/09-checkout-orders.md) |
| 10 | Customer Account | core, checkout-orders (read-only) | [subsystems/10-customer-account.md](subsystems/10-customer-account.md) |
| 11 | Inventory | core, catalog (read-only) | [subsystems/11-inventory.md](subsystems/11-inventory.md) |
| 12 | Plugins & Extensibility | core, event bus | [subsystems/12-plugins-extensibility.md](subsystems/12-plugins-extensibility.md) |
| 13 | Analytics & Tracking | core, event bus (subscriber only) | [subsystems/13-analytics-tracking.md](subsystems/13-analytics-tracking.md) |
| 14 | AI/MCP Interface | public interfaces of every subsystem it wraps | [subsystems/14-ai-mcp-interface.md](subsystems/14-ai-mcp-interface.md) |
| 15 | Service Areas (Location Pages) | core | [subsystems/15-service-areas.md](subsystems/15-service-areas.md) |
| 16 | Promotions & Discounts | core | [subsystems/16-promotions.md](subsystems/16-promotions.md) |
| 17 | Bundles | core | [subsystems/17-bundles.md](subsystems/17-bundles.md) |
| 18 | Recommendations (Upsell / Cross-sell) | core | [subsystems/18-recommendations.md](subsystems/18-recommendations.md) |
| 19 | Advertising | core | [subsystems/19-advertising.md](subsystems/19-advertising.md) |
| 20 | Internal BI / Metrics | core | [subsystems/20-internal-bi.md](subsystems/20-internal-bi.md) |
| 21 | Admin Auth | core | [subsystems/21-admin-auth.md](subsystems/21-admin-auth.md) |
| 22 | Fulfillment Routing | core | [subsystems/22-fulfillment.md](subsystems/22-fulfillment.md) |
| 23 | Shipping (Rate Shopping & Labels) | core | [subsystems/23-shipping.md](subsystems/23-shipping.md) |
| 24 | Reviews | core | [subsystems/24-reviews.md](subsystems/24-reviews.md) |
| 25 | Storefront Views | core | [subsystems/25-storefront-views.md](subsystems/25-storefront-views.md) |
| 26 | Community Goals | core | [subsystems/26-community-goals.md](subsystems/26-community-goals.md) |
| 27 | Customization | core | [subsystems/27-customization.md](subsystems/27-customization.md) |

Reading order for anyone new: 00 → 01 → 02 → then whichever subsystem you're actually working
on. 00 is the only doc every other subsystem doc assumes you've read.

## Design principles carried through every subsystem doc
1. **Schema-first.** Core types are defined once (00), and every subsystem's storage need is
   expressed as an interface against those types — never a subsystem-specific schema that
   duplicates or forks the core shape.
2. **DB adapters are a contract, not a choice we make for people.** Anyone can write a new
   adapter package implementing the persistence interfaces from 00. Two reference adapters
   (Postgres, SQLite) ship in-repo specifically to prove the interface is adapter-agnostic, not
   secretly Postgres-shaped.
3. **CMS over theming.** No forced whole-site "theme" the way Shopify requires (a full Liquid
   theme touching every page). Each of the 5 page types is independently CMS-editable with ~3
   default layout templates; a "theme" is just a bundle of layout/component choices + styling
   applied across pages as a convenience, and drop-in Shopify-style theme packages are a later,
   optional layer on top of the same per-page CMS primitives — not a prerequisite for using any
   single page.
4. **Adapters over hard dependencies.** Payments (Stripe first), inventory (in-house or
   external IMS), and persistence (Postgres/SQLite/anything) are all adapter interfaces from
   day one, even though only one concrete implementation ships initially per category. This is
   the resolved lesson from the shop's own CBA: don't force a specific backend service on
   people who don't need it.
5. **Events over direct calls for side effects.** Anything that's "X happened, now Y should
   react" (order placed → decrement inventory; checkout completed → notify) goes through the
   event bus, never a direct import from one subsystem into another's internals.
6. **Give it away.** MIT license, public repo, no *forced* telemetry phone-home to us as the
   project maintainers, no paid tier baked into the core. `shop.mdostal.com` is proof-by-use,
   not a upsell funnel for this project. (Distinct from subsystem 13: a *deployment's own*
   analytics — their PostHog, their events — is an opt-out-able plugin for the deployer's
   benefit, not data flowing back to us.)
7. **Analytics on by default, not bolted on.** Every subsystem already publishes semantic
   events to the bus for its own reasons; analytics (13) is purely a subscriber to that same
   stream, shipping with a PostHog adapter enabled by default. Adding/swapping analytics
   providers is a config change, never a per-subsystem instrumentation project.
8. **Built for AI and human operators equally.** Every capability this framework exposes to a
   human (shop, browse, manage catalog/CMS/inventory) is also exposed to AI agents via a
   documented skills/tool catalog and an MCP server (14) that calls the exact same subsystem
   interfaces — no shadow API, no reduced agent-only surface. This is a first-class design
   goal, not a later integration.

## Open questions (repo-level, not subsystem-specific)
1. Versioning and release strategy for the packages (independent per package, or one synced
   monorepo version). Needs an answer before the first npm publish.
2. Whether every subsystem must have a durable adapter on every database, or a documented
   support matrix per database. Today Postgres covers nearly every commerce subsystem, and the others mainly the catalog.

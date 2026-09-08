# Reference Storefront

A minimal Next.js app proving the `core-foundation` epic's vertical slice end-to-end: browse a
seeded catalog, add items to a cart, check out via Stripe, see the order.

**This is a proof-of-integration demo, not a production storefront template.** No theming, no
PDP layout options, no CMS -- those arrive in later epics (`pdp-theming`, `cms-pages`). Data is
entirely in-memory (SQLite `:memory:`, in-memory cart/order repositories) and reseeded fresh on
every process start.

## The one architectural rule this app exists to prove
`lib/services.ts` is **the only module in this repo** that imports concrete adapter
implementations (`@mercatus-liber/adapter-sqlite`, the Stripe payment adapter from
`@mercatus-liber/payments`). Every subsystem package it wires together
(catalog/cart/checkout-orders) only ever depends on `@mercatus-liber/core` plus narrow
structural interfaces -- see each package's own `src/` for confirmation. Deleting/replacing an
adapter here should never require touching a subsystem package's code.

## Running it
```
STRIPE_SECRET_KEY=sk_test_... STRIPE_WEBHOOK_SECRET=whsec_... pnpm dev
```
Without a real Stripe test-mode key, browsing/cart works fully; the "Check out with Stripe"
step will fail at the live Stripe API call (expected -- no key exists in this project's vault
yet, see cf-05/cf-07 execution notes in `.pHive/epics/core-foundation/`).

## Routes
`/` (CMS-authored home page -- see below), `/products/[slug]` (themed PDP -- see below), `/cart`,
`/category/[slug]`, `/search`, `/campaign/[slug]` (CMS marketing/campaign page), `/order/[id]`,
`/order/confirmed`, `/account` (order history + recent activity -- see below).

## Account (demo only -- no real auth)
`/account` is keyed by a `ml_customer_id` cookie (mirrors `cart-cookie.ts`'s pattern), created
automatically on first checkout via `lib/customer-cookie.ts`. This is **not** an auth system --
auth (login/session/password) is explicitly out of scope for `@mercatus-liber/account`'s
reference implementation (see `docs/subsystems/10-customer-account.md` open question 1). Order
history and recent activity are real, though: `checkout` structurally satisfies account's
`OrderLookup` interface already (no adapter object needed), and activity entries are logged
purely by account reacting to `checkout.order.paid` events.

## CMS
`/` and `/campaign/[slug]` render from `@mercatus-liber/cms` page content -- not hardcoded JSX
data. `components/cms-sections.tsx` maps a section's `componentType` (hero-banner, category-spot,
product-grid, ad-slot) to real markup, same "concrete choices live in the app" pattern as
theming's template map. The seeded marketing page (`fall-sale`) has its own curated,
ordered mini-catalog (`MarketingPageMeta`), distinct from `marketing-catalog`'s category-based
curation.

## Theming / PDP
`/products/[slug]` is driven by `@mercatus-liber/pdp`'s view model and `@mercatus-liber/theming`'s
resolved template key -- **not** hardcoded markup. `components/pdp-tabbed-detail.tsx` and
`components/pdp-long-scroll.tsx` are the two default templates (theming stays framework-agnostic;
turning a template *key* into real JSX is this app's job, same pattern as `lib/services.ts` for
adapters). Try `?template=pdp.long-scroll` on any product page to see the same data rendered
differently. Adding a third layout: register it with `theming.registerTemplate()`, add a
component, add one branch to the template-key map in `app/products/[slug]/page.tsx` -- no other
package changes.

## Testing
`test/integration.test.ts` drives the full seed -> browse -> cart -> checkout -> paid flow
against a **fake** payments adapter (no live Stripe key available yet) -- see the test file's
own header comment for why, and what the natural follow-up (a live Playwright E2E test) looks
like once a key exists. `test/marketing-catalog-search.test.ts` proves the seeded demo data
exercises many-to-many category assignment and that search stays in sync via events, with no
manual reindex call.

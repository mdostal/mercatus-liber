# Integrations

_Last verified 2026-10-07, directly against the running code — `ls packages/ | grep adapter-`,
`apps/reference-storefront/lib/services.ts`'s actual env-var branches, and
[`.pHive/planning/epic-backlog.md`](/planning-index)'s own disclosed build history. This page
goes stale the moment any of those three things change, so if you're reading this well after
the date above, re-run that same check before trusting a status below._

Mercatus Liber integrates with **12 real third-party adapter packages** (`packages/adapter-*`)
plus two built-in provider integrations (Stripe inside `@mercatus-liber/payments`, PostHog/GA4
inside `@mercatus-liber/analytics`) — 15 real integrations in total. Nothing below is
hypothetical or planned-but-unbuilt: every entry on this page is real, committed code with its
own test suite. What varies is how far past "built" each one has gotten:

- **Live in production** — actually running right now on one or more of
  [the 3 demo stores](/getting-started) at `commerce.mdostal.com`, named explicitly below.
- **Built, tested, credential-gated** — real code, a real unit-test suite proving it works
  against the provider's actual documented API shape, but never yet exercised against a live
  account because the credential doesn't exist in this project's environment. Not a stub, not
  a TODO — just honestly unverified end-to-end.
- **Built, tested, wired — but not into the reference demos** — one case (Shopify) where the
  adapter is real and used elsewhere in this repo, but deliberately not part of the 3 live
  demo stores' own wiring.

Every "not yet live" row below names the exact environment variable(s) that would flip it on,
read directly from `services.ts` — not guessed from a provider's generic docs.

## Persistence (catalog)

| Package | Wraps | Status | Env var(s) to enable |
|---|---|---|---|
| `adapter-sqlite` | SQLite (via `better-sqlite3`) | Zero-infra **reference default** — in-memory unless `SQLITE_FILE_PATH` is set. Not the active backend for any of the 3 production demos today (all 3 resolve to Postgres or Convex instead), but still the universal local-dev default and the fallback of last resort. | *(none required — default)*; `SQLITE_FILE_PATH` for a durable file-backed DB |
| `adapter-postgres` | Postgres (via `pg`) | **Live in production** — backs The Print Shop and Northline Home Tech (both resolve the same shared Supabase Postgres). Also backs 13 other subsystems on these two demos (cart, orders, promotions, reviews, storefront-views, bundles, recommendations, advertising, service areas, internal-BI event log, fulfillment routing, customer profiles, the named Catalog entity) per the `full-commerce-persistence-audit` epic. | `DATABASE_URL` |
| `adapter-postgres-inventory` | Postgres (second `InventoryAdapter` implementation) | **Live in production** for the same two Postgres-backed demos — shares the exact connection pool `adapter-postgres` already opened for `DATABASE_URL`. | `DATABASE_URL` (shared, no separate var) |
| `adapter-mongodb` | MongoDB (via the official `mongodb` driver) | **Built, tested** (13 unit tests against a fake `Db` double), wired into `services.ts`'s adapter-priority chain. **Blocked live on a real infra action, not a code fix**: a genuine `MongoServerSelectionError`/TLS handshake failure was reproduced in production, diagnosed as the MongoDB Atlas cluster's Network Access (IP allowlist) not yet including Vercel's serverless egress ranges, then reverted. Not currently the live backend for any demo. | `MONGODB_URL` (checked only when `DATABASE_URL` is unset); per-demo override `<DEMO>_MONGODB_URL` |
| `adapter-convex` | Convex (real-time, TypeScript-native reactive backend) | **Live in production** — backs Broadleaf & Co. on a real, deployed Convex project (`kindhearted-corgi-798`). Ships its own deployable function source in `convex-functions/`. | `CONVEX_URL` (checked only when `DATABASE_URL`/`MONGODB_URL` are unset); per-demo override `<DEMO>_CONVEX_URL` |
| `adapter-shopify` | Shopify's Admin GraphQL API, as a full commerce-backend `CatalogPersistenceAdapter` | **Built and unit-tested — but not wired into any of the 3 live reference demos at all.** `apps/reference-storefront/lib/services.ts` never imports this package. It's wired only into the `@mercatus-liber/create-store` scaffolder CLI (`--adapter shopify`), which generates a brand-new store's `services.ts` calling `createShopifyAdapter({ shop, accessToken })`. No live Shopify store has ever been provisioned or verified against it. | `SHOPIFY_SHOP` + `SHOPIFY_ACCESS_TOKEN` — only read inside a store scaffolded via `create-store --adapter shopify`, never by the reference storefront itself |

## CMS

| Package | Wraps | Status | Env var(s) to enable |
|---|---|---|---|
| `adapter-sanity` | Sanity's real Content API (Query + Mutations), as a `CmsPersistenceAdapter` | **Live in production**, all 3 demos — pages, marketing/campaign pages, and location pages all read/write through a real hosted Sanity project. | `SANITY_PROJECT_ID` (the sole signal that activates it) + optional `SANITY_DATASET` (defaults to `"production"`) + `SANITY_TOKEN` |

The zero-infra fallback when `SANITY_PROJECT_ID` is unset is the in-memory `CmsPersistenceAdapter`
shipped directly inside `@mercatus-liber/cms` — not a third-party integration, but worth naming
since it's what every local checkout runs against by default.

## Auth (admin)

| Package | Wraps | Status | Env var(s) to enable |
|---|---|---|---|
| `adapter-clerk` | Clerk's Next.js + Backend SDKs, as an `AdminAuthAdapter` | **Live in production**, gating `/admin` on all 3 demos. A real three-role model (owner/admin/viewer) stored in Clerk's own `publicMetadata`; a real test user has completed an interactive sign-in against production. | `CLERK_SECRET_KEY` + `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (both required — there is no separate non-`NEXT_PUBLIC_`-prefixed key this SDK version reads) |

Local dev fallback when Clerk isn't configured: `ADMIN_DEV_PASSWORD` / `ADMIN_VIEWER_PASSWORD`,
a zero-infra single-session dev adapter — explicitly **never** a real security boundary.

## Payments

| Package | Wraps | Status | Env var(s) to enable |
|---|---|---|---|
| `payments` (built-in) | Stripe Checkout Sessions, as the reference `PaymentAdapter` | **Live-wired, but currently running in sandbox mode in production** — no real (non-sandbox) Stripe key exists yet, so every order across all 3 demos today completes through the built-in `createSandboxPaymentAdapter`, a genuinely working, no-external-provider "practice card" checkout, not a placeholder or broken flow. | `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` (unset → sandbox mode) |

## Fulfillment & shipping

The `@mercatus-liber/fulfillment` and `@mercatus-liber/shipping` subsystems both always register
a real, zero-infra manual default first (self-fulfillment, and a documented PirateShip-by-hand
workflow respectively — PirateShip genuinely has no public API, confirmed by research rather
than assumed) — real third-party providers are *added* alongside that default, never swapped in
place of it.

| Package | Wraps | Status | Env var(s) to enable |
|---|---|---|---|
| `adapter-printful` | Printful's real v2 order API (draft-then-confirm) + v2 webhooks | **Built, tested** (21 unit tests), wired additively into `services.ts`. **Credential-gated** — no `PRINTFUL_API_TOKEN` exists in this environment; no live Printful account call has been made. | `PRINTFUL_API_TOKEN` (+ optional `PRINTFUL_STORE_ID`) |
| `adapter-printify` | Printify's real v1 order API (create-then-send-to-production) + HMAC-SHA256-verified webhooks | **Built, tested** (30 unit tests), a second, independent POD provider that can run alongside Printful. **Credential-gated** — `PRINTIFY_API_TOKEN`/`PRINTIFY_SHOP_ID` are both unset here. | `PRINTIFY_API_TOKEN` + `PRINTIFY_SHOP_ID` (both required — Printify accounts can have multiple shops with no auto-discovery) |
| `adapter-shippo` | Shippo's real REST API — rate shopping, label purchase, tracking lookup | **Built, tested** (20 unit tests). **Credential-gated** — no `SHIPPO_API_TOKEN` is set. | `SHIPPO_API_TOKEN` |

## Image / media

| Package | Wraps | Status | Env var(s) to enable |
|---|---|---|---|
| `adapter-cloudinary` | Cloudinary's real "fetch" delivery mode (remote-URL transform + CDN cache, no upload, no API key/secret needed) | **Built, tested. Credential-gated** — no `CLOUDINARY_CLOUD_NAME` is set anywhere in this environment; not live. | `CLOUDINARY_CLOUD_NAME` (the only credential fetch mode needs) |

The always-on default (`@mercatus-liber/media`'s `createPassthroughImageAdapter()`) serves a
product's raw image URL unchanged — a genuinely valid baseline, not a degraded state, which is
what every demo runs on today.

## Analytics & insights

| Integration | Wraps | Status | Env var(s) to enable |
|---|---|---|---|
| `analytics` (built-in) — PostHog, write side | PostHog's ingestion API, as the default `AnalyticsAdapter` event-bus subscriber | **Live in production** — real event capture across all 3 demos. | Server: `POSTHOG_API_KEY` (+ optional `POSTHOG_HOST`). Client: `NEXT_PUBLIC_POSTHOG_KEY` (+ optional `NEXT_PUBLIC_POSTHOG_HOST`) |
| `analytics` (built-in) — PostHog, read side ("Traffic & Sources") | PostHog's Query API (`POST /api/projects/:id/query`, HogQL) | **Built, tested. Credential-gated** — this needs a distinct **personal** API key with Query-Read scope (never the write-side project key above), which has never been provided. | `POSTHOG_PERSONAL_API_KEY` + `POSTHOG_PROJECT_ID` (+ optional `POSTHOG_APP_HOST`) |
| `analytics` (built-in) — GA4 insights | Google Analytics 4's Data API `runReport`, via a service-account self-signed-JWT flow | **Built, tested** (including a real RSA keypair verifying the signed JWT assertion). **Credential-gated** — no GA4 service-account key exists in this environment. | `GA4_PROPERTY_ID` + `GA4_SERVICE_ACCOUNT_EMAIL` + `GA4_PRIVATE_KEY` |

`/admin/metrics`' "Traffic & Sources" section renders every *configured* source above side by
side, each explicitly labeled by provider — it never silently merges or sums them, and renders
an honest "not configured" message for whichever provider(s) above aren't.

## Corrections made against the design discussion's starting-point table

This page was built by re-verifying everything below from the real, current code — not by
copying [epic 77's design discussion](/planning/integrations-catalog-and-ecosystem-audit)'s own
pre-researched table, per that document's own explicit warning that it could have drifted. Two
real corrections surfaced:

1. **`adapter-shopify`** was described there as "live-wired, credential-gated for a real
   store." That's not quite right: it isn't wired into the reference storefront's `services.ts`
   at all — it's wired only into the `create-store` scaffolder, for a brand-new store a
   self-hoster provisions outside this demo app entirely. None of the 3 live demos use it.
2. **`adapter-convex`**'s own epic row (`adapter-convex`, filed 2026-09-11) still says "not
   currently the live backend for any demo" — true the day it was written, but a later epic
   (`per-demo-backend-diversity`, 2026-09-16) made it the real, live backend for Broadleaf & Co.
   This page reflects that later, current state, not the stale original row.

## Not an integration gap: what this page doesn't cover

This catalogs third-party **systems** this framework talks to. It deliberately does not
re-list the *feature* gaps already tracked on [`/vision`](/vision)'s community-plugin-frontier
table (wishlist, subscriptions, loyalty, gift cards, etc.) — those are a different axis
(missing capabilities, not missing providers) and are covered there instead.

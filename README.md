# Mercatus Liber

_"Free market" (Latin). A legitimate, 100% free/open-source alternative to Shopify/Medusa/
Saleor/etc. -- headless, AI-agent-accessible, and built to be stood up with a single tool._

A free, MIT-licensed, headless commerce framework: schema-first product/SKU catalog with
pluggable database adapters, a **marketing catalog genuinely separate from the sales
catalog** (the gap no existing free/OSS commerce platform actually fills), a per-page CMS
instead of forced whole-site theming, a long-lived cart, adapter-based payments (Stripe first),
analytics on by default (PostHog, config-swappable), and a plugin system for everything else
(OMS, fulfillment, notifications).

Built as an **AI *and* human commerce tool from the ground up** — every capability exposed to a
human storefront/admin UI is equally exposed to AI agents via a documented skills/tool catalog
and an MCP server, calling the exact same subsystem interfaces. No shadow API, no reduced
agent-only surface.

**Status:** pre-alpha — core-foundation epic underway (`@mercatus-liber/core` schema +
`@mercatus-liber/adapter-sqlite` done; catalog/cart/payments/checkout-orders/reference-storefront
in progress). See `.pHive/planning/epic-backlog.md` for the full build-out backlog.

## Why
Evaluated against every serious free/OSS option (Medusa, Saleor, Vendure, Spree/Solidus,
Shopware, Bagisto, Sylius) plus proprietary options (Snipcart, Swell) for
[shop.mdostal.com](../shop) — a small maker shop needing a real multi-item cart. None fit: wrong
stack, wrong deploy shape, unnecessary infrastructure for a small catalog, or not actually free.
See [`shop/.pHive/epics/v1-launch/docs/oss-cart-cba.md`](../shop/.pHive/epics/v1-launch/docs/oss-cart-cba.md)
for the full CBA that led here.

`shop.mdostal.com` becomes this project's first real reference deployment once packages exist
here to consume.

## Read next
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — design principles, subsystem map, repo shape.
- [`docs/subsystems/`](docs/subsystems/) — one doc per subsystem (15 total), each covering
  purpose, dependencies, responsibilities, explicit non-responsibilities, and open questions.
- [`docs/NAMING-CANDIDATES.md`](docs/NAMING-CANDIDATES.md) — naming history (decided: Mercatus Liber).

## Prime directive
No subsystem imports another subsystem's internals. Everything talks through shared core
types, adapter interfaces, or a typed event bus. See `docs/ARCHITECTURE.md` → "Prime directive:
no tight coupling" for the test used to catch violations.

## Configuration
Environment variables `apps/reference-storefront` actually reads (confirmed by grepping
`process.env` across the app, not from memory). None are required to run the app locally —
every one has a documented, harmless fallback — but real deployments need the identity-provider
and payment keys to get real behavior instead of a local stand-in.

**Admin authentication** (subsystem 21, `@mercatus-liber/admin-auth` + `@mercatus-liber/adapter-clerk`):
- `CLERK_SECRET_KEY` — Clerk's Backend API secret key. This is the single signal the app uses to
  decide whether Clerk is configured at all: when set, `/admin` is gated by real Clerk
  authentication (`middleware.ts`) and the real `createClerkAdminAuthAdapter()` is wired in
  (`lib/services.ts`); when unset, Clerk's middleware/provider are skipped entirely and the app
  falls back to the zero-infra `createDefaultAdminAuthAdapter()` dev adapter.
- `CLERK_PUBLISHABLE_KEY` — Clerk's publishable key identifying the Clerk instance, required
  alongside `CLERK_SECRET_KEY` for Clerk's SDK (`<ClerkProvider>`, `clerkMiddleware()`) to
  function. Its client-exposed equivalent, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, would also be
  needed if this app ever renders Clerk client components directly (see
  `packages/adapter-clerk/README.md`).
- `ADMIN_DEV_PASSWORD` — **local-development-only fallback, never a real security boundary.**
  Gates the dev-default admin adapter's single shared session cookie (see
  `packages/admin-auth/src/default-adapter.ts`): whatever value this is set to must match the
  cookie value for a session to resolve, and it always resolves to a single synthetic "owner"
  identity. No per-user sessions, no expiry, no CSRF protection, no rate limiting. Unset means
  no dev session can ever authenticate. Not used at all once `CLERK_SECRET_KEY` is set.

**Payments** (predates this epic):
- `STRIPE_SECRET_KEY` — Stripe's secret API key. Without it, `lib/services.ts` still constructs
  the payments adapter (`createLazyStripeAdapter`), but it defers building the real Stripe
  client until a payment method is actually called — so every page except checkout keeps
  working, and checkout itself fails loudly only when actually exercised.
- `STRIPE_WEBHOOK_SECRET` — Stripe's webhook signing secret, used to verify incoming webhook
  events. Same empty-string fallback as `STRIPE_SECRET_KEY` above.

**Analytics** (predates this epic):
- `POSTHOG_API_KEY` — PostHog project API key, read server-side. When set, `lib/services.ts`
  wires the real `createPostHogAdapter()`; when unset, it falls back to a deliberately valid,
  fully-functional `createNoopAdapter()` (not an error state).
- `POSTHOG_HOST` — optional PostHog host override, only meaningful alongside `POSTHOG_API_KEY`.
- `NEXT_PUBLIC_POSTHOG_KEY` — PostHog project API key read client-side
  (`lib/analytics-client.ts`), for browser-only interaction/impression events. Without it,
  `trackEvent()` is a safe no-op that never touches the network.
- `NEXT_PUBLIC_POSTHOG_HOST` — optional client-side PostHog host override; falls back to
  `https://us.i.posthog.com` when unset.

**Content (CMS)** (`@mercatus-liber/cms` + `@mercatus-liber/adapter-sanity`):
- `SANITY_PROJECT_ID` — Sanity project ID. This is the single signal `lib/services.ts` uses to
  decide whether Sanity is configured at all: when set, the real `createSanityAdapter()` is
  wired in as the CMS's persistence; when unset, the app falls back to the zero-infra
  `createInMemoryCmsAdapter()` -- no external CMS required to run this app locally.
- `SANITY_DATASET` — optional, defaults to `"production"` (Sanity's own conventional dataset
  name) when unset. Only meaningful alongside `SANITY_PROJECT_ID`.
- `SANITY_TOKEN` — Sanity API token used to authenticate reads/writes against the configured
  project and dataset. Falls back to an empty string when unset, same posture as the Stripe
  keys above; only meaningful alongside `SANITY_PROJECT_ID`.

**Demo content**:
- Demo selection is routed, not env-var-driven — `apps/reference-storefront/lib/demos.ts`'s
  `DEMO_REGISTRY` holds three real public demo stores, each picked live via the
  `/demo/[demoSlug]/...` route param (see `.pHive/epics/commerce-landing-and-demo-routing/docs/design-discussion.md`
  §3; this replaced an earlier `DEMO_BRAND` env var, no longer read anywhere): `print-shop`
  ("The Print Shop", embroidery/custom prints, opens on the `editorial` theme by default),
  `northline` ("Northline Home Tech", a smart-home installer, opens on the `northline` theme by
  default), and `broadleaf` ("Broadleaf & Co.", an eclectic artisan/handmade-goods shop across
  Plants, Ceramics & Planters, Textiles & Fiber Arts, and Paper & Ephemera, opens on the
  `vibrant` theme by default).

**Docs site link**:
- `NEXT_PUBLIC_DOCS_URL` — the public URL of the deployed `apps/docs` documentation site,
  read client-side by the framework landing page's "Docs" link
  (`app/(landing)/layout.tsx`). Unset falls back to a clearly-labeled placeholder URL rather
  than a broken bare `/docs` link — the docs site's real, deployed public domain is an
  operational decision (DNS/domain binding, Vercel project creation) outside this repo's
  scope, not something to hardcode as a guess.

## License
MIT — see [`LICENSE`](LICENSE). Give it away.

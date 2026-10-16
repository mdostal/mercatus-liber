# Sample Stores

_Last verified 2026-10-16, directly against the running code and a live fetch of each URL
below — `apps/reference-storefront/lib/demos.ts`'s real `DEMO_REGISTRY`/`STANDALONE_DEMO_URLS`,
the `separate-deployed-sample-stores` epic's `ss-02` closeout, `npx vercel project ls` against
the real `mathew-dostals-projects` scope, and an actual HTTP request to each store (root
content, not just a successful build) plus a real unauthenticated-browser admin-route request
confirming Clerk's sign-in redirect on each new domain. This page goes stale the moment any of
those things change, so if you're reading it well after the date above, re-run that same check
before trusting a status below — the same discipline [`/integrations`](/integrations) holds
itself to._

Mercatus Liber seeds **three real, distinct demo storefronts** — not placeholders, not the
same catalog re-skinned three times. Each has its own theme, its own catalog, and (this is the
point) its own real persistence backend. As of epic 81's closeout, each also has its own
independently deployed Vercel project and its own real URL.

## Each store, independently deployed

Each store below is the exact same `apps/reference-storefront` codebase, deployed as its own
separate Vercel project (`mercatus-liber-print-shop`/`-northline`/`-broadleaf`), running in a
new env-gated single-tenant mode (`SINGLE_TENANT_DEMO_SLUG`, `ss-01`) that serves that one
store's content directly at its own root `/` — not a `/demo/<slug>` subpath:

| Store | Standalone URL | Backend | Theme | What it demonstrates |
|---|---|---|---|---|
| **The Print Shop** | [mercatus-liber-print-shop.vercel.app](https://mercatus-liber-print-shop.vercel.app) | Postgres (shared Supabase, `DATABASE_URL`) | `editorial` | Embroidery/custom-prints catalog — the default seed. |
| **Northline Home Tech** | [mercatus-liber-northline.vercel.app](https://mercatus-liber-northline.vercel.app) | Postgres (shared Supabase, same `DATABASE_URL`) | `northline` | Smart-home installer catalog — a second, differently themed catalog on the same adapter. |
| **Broadleaf & Co.** | [mercatus-liber-broadleaf.vercel.app](https://mercatus-liber-broadleaf.vercel.app) | Convex (its own deployed project, `kindhearted-corgi-798`, via a plain `CONVEX_URL` on this project since it's the only demo this deployment ever serves) | `vibrant` | Eclectic artisan/handmade-goods catalog — proves the persistence-adapter layer is genuinely swappable per store, not just in theory. |

That per-store backend split is not aspirational — it's real and already live today, fully
disclosed with the exact env vars and test evidence behind it on
[`/integrations`](/integrations)'s Persistence table. Two of the three stores share one
Postgres database; the third runs on a completely independent Convex deployment, in
production, right now.

**Admin auth on every new domain, live-verified, not assumed:** this app's Clerk instance is a
development-mode instance (`sk_test_…`/`pk_test_…`, confirmed via Clerk's own Backend API --
`environment_type: "development"`, `allowed_origins: null`) with no `authorizedParties`
allowlist configured in code either, so it isn't domain-locked -- no Clerk dashboard change was
needed for the new domains. Verified for real, not just inferred: an unauthenticated request
(real browser headers, a cookie jar carried across the full redirect chain) to each new
domain's `/admin/orders` correctly completes Clerk's handshake and lands on Clerk's real hosted
sign-in page (`accounts.dev/sign-in`) carrying that exact path as its `redirect_url` -- the
admin gate is genuinely active on every new deployment, not bypassed.

**A real bug found and fixed during this rollout:** the first live deploy of `ss-01`'s
single-tenant rewrite to a fresh Vercel project served the plain framework landing page at `/`
instead of the store, and real routes like `/cart` 404'd -- a cache-busted rebuild then failed
outright with `The Edge Function "_middleware" is referencing unsupported modules: node:crypto`.
Root cause: this repo's real installed `next@16.3.5` deprecates the `middleware.ts` file
convention in favor of `proxy.ts` -- the old name keeps Next's pre-16 Edge-runtime-by-default
behavior (no `node:crypto`), while `proxy.ts` gets Next 16's new Node.js-runtime default. Fixed
by renaming `middleware.ts` -> `proxy.ts` (export renamed `middleware` -> `proxy`, the same
rename Next's own `middleware-to-proxy` codemod performs); every one of the three new
deployments above was re-verified live after this fix, not before it.

## Still reachable: the original shared deployment's `/demo/<slug>` paths

The existing shared Vercel project `mercatus-liber-demo` (`commerce.mdostal.com`) is additive,
not replaced -- all three `/demo/<slug>` paths on it still work exactly as before:
[`/demo/print-shop`](https://commerce.mdostal.com/demo/print-shop),
[`/demo/northline`](https://commerce.mdostal.com/demo/northline),
[`/demo/broadleaf`](https://commerce.mdostal.com/demo/broadleaf) -- all three returned a live
`200` as of this verification pass (the free-tier Supabase sleep/500 issue
[`free-tier-resilience-and-keepalive`](/planning/free-tier-resilience-and-keepalive), epic 79,
was tracking is now mitigated by that epic's graceful-state + keep-alive job). The landing
page's own demo cards at `commerce.mdostal.com` link to both: the `/demo/<slug>` path (default
click target, unchanged) and each store's new standalone URL above ("Open as its own standalone
site").

## See also

- [Getting started](/getting-started) — how to run these same three demos locally, or
  provision your own store with `create-store`.
- [Integrations](/integrations) — the full real/live status of every backend, CMS, auth,
  payments, fulfillment, and analytics integration behind these stores, including the exact
  env var(s) that activate each one.
- [Planning corpus](/planning-index) — the real design-discussion behind this page
  ([`docs-wiki-examples-architecture`](/planning/docs-wiki-examples-architecture), epic 80),
  the free-tier resilience fix (epic 79), and the separate-deployments epic (epic 81).

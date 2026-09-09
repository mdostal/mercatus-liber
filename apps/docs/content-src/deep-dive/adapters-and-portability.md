# Adapters & Portability

Every other deep-dive page on this site eventually says some version of "this package declares
its own narrow interface instead of importing a concrete implementation." This page is about
that pattern itself — not one subsystem's version of it, but the cross-cutting architectural
principle that makes "roll your own commerce, own your store" actually true instead of a
slogan.

## The pattern: narrow interface, zero-infra default, real third-party adapters

Every subsystem that could plausibly have more than one real-world implementation — persistence,
CMS, payments, admin-auth, analytics — is built the same way:

1. The subsystem's own package declares a **narrow structural interface** describing exactly the
   shape of data access it needs (e.g. `CatalogPersistenceAdapter`, `CmsPersistenceAdapter`,
   `AdminAuthAdapter`), never a concrete database client or SDK type.
2. That same package (or a sibling in-repo default) ships a **zero-infra reference
   implementation** — in-memory, no external service required — so a fresh checkout works with
   no setup at all.
3. **Real third-party adapters live in separate, sibling packages** (`packages/adapter-*`), each
   implementing the exact same interface against a real backend. The subsystem package itself
   never imports them — nothing forces a specific vendor.
4. **Exactly one place in the entire codebase chooses which concrete adapter to wire in for a
   given deployment**: the app's own composition root. For the reference storefront, that's
   `apps/reference-storefront/lib/services.ts`.

That last point is the one worth dwelling on, because it's what actually prevents vendor
lock-in from creeping back in through the side door. `services.ts`'s own header comment says it
plainly:

```ts
// apps/reference-storefront/lib/services.ts
/**
 * THE ONLY MODULE IN THIS REPO that imports concrete adapter implementations
 * (adapter-sqlite, the Stripe payment adapter). Every subsystem package
 * (catalog/cart/payments/checkout-orders) only ever depends on
 * @mercatus-liber/core plus narrow structural interfaces -- this module is
 * where a real deployment chooses and wires concrete implementations together.
 */
```

## Structural typing, not registration

A detail that trips people up coming from other plugin architectures: adapters here aren't
registered through a plugin-manager API call. TypeScript's structural typing means a real
service can satisfy another subsystem's declared interface just by having the right method
shapes — no explicit "implements" declaration, no adapter-registration boilerplate. Bundles
needs to look up a SKU's price; catalog's `CatalogService` already has a `getSku()` method with
a compatible shape, so it's passed in directly:

```ts
// apps/reference-storefront/lib/services.ts
// `catalog` structurally satisfies bundles' own narrow SkuPriceLookup
// interface (getSku(id) -> { id, price, title? }) already -- no adapter
// object needed, same structural-satisfaction pattern used for
// account/inventory's OrderLookup below.
const bundles = createBundlesService({
  repository: createInMemoryBundleRepository(),
  skuLookup: catalog,
});
```

The same trick appears repeatedly in `services.ts`: `checkout` structurally satisfies both
account's `OrderLookup` and inventory's `OrderLookup` interfaces without either of those packages
importing `@mercatus-liber/checkout-orders`.

## The zero-infra-default pattern, in the actual env branches

The two-branch shape — a real env var truthy picks the real adapter, unset falls back to a
harmless local default — repeats across every swappable subsystem `services.ts` wires. Here it
is for CMS and analytics, taken directly from the composition root:

```ts
// apps/reference-storefront/lib/services.ts
const analytics: AnalyticsAdapter = process.env.POSTHOG_API_KEY
  ? createPostHogAdapter({ apiKey: process.env.POSTHOG_API_KEY, host: process.env.POSTHOG_HOST })
  : createNoopAdapter();

// ...

const cmsPersistence = process.env.SANITY_PROJECT_ID
  ? createSanityAdapter({
      projectId: process.env.SANITY_PROJECT_ID,
      dataset: process.env.SANITY_DATASET ?? "production",
      token: process.env.SANITY_TOKEN ?? "",
    })
  : createInMemoryCmsAdapter();
```

Admin-auth follows the identical shape, gated on `CLERK_SECRET_KEY` instead: a real
`createClerkAdminAuthAdapter()` when configured, a dev-only cookie-based
`createDevAdminAuthAdapter()` wrapper (itself built on `@mercatus-liber/admin-auth`'s own
`createDefaultAdminAuthAdapter`) otherwise. Payments follows a related but distinct shape —
there's only one real payment adapter (Stripe) today, so instead of a two-branch choice,
`services.ts` lazily constructs the Stripe client on first use so an unconfigured
`STRIPE_SECRET_KEY` doesn't crash every page in the app, just the first real payment call.

**Persistence is the one exception worth calling out honestly.** `apps/reference-storefront`
itself has no env-var branch for picking sqlite vs. postgres vs. Shopify — it's hardcoded to
`createSqliteAdapter(":memory:")`, because this app is documented as a demo/integration proof,
not a persistent production storefront. The swappability is real and proven at the *package*
level (see the table below, and `@mercatus-liber/create-store`'s `--adapter` flag in
[Getting started](/getting-started), which does let you pick sqlite/postgres/shopify at scaffold
time) — it's just that this particular running app only exercises one of the three.

## What's actually swappable today

This table was built by reading each `packages/adapter-*` package's real exports directly
(not assumed from naming conventions) and cross-checking against
`apps/reference-storefront/lib/adapter-info.ts` and `lib/services.ts`'s actual env-var branches.

| Subsystem | Interface | Adapters that really exist | Wired via env var in `services.ts`? |
| --- | --- | --- | --- |
| Persistence (catalog) | `CatalogPersistenceAdapter` | `createSqliteAdapter` (`packages/adapter-sqlite`) — in-process SQLite; `createPostgresAdapter` (`packages/adapter-postgres`) — real `pg`-backed Postgres; `createShopifyAdapter` (`packages/adapter-shopify`) — wraps the Shopify Admin GraphQL API as a catalog backend | No — the reference app hardcodes sqlite in-memory; `create-store`'s `--adapter` flag exercises all three at scaffold time |
| CMS | `CmsPersistenceAdapter` | `createInMemoryCmsAdapter` (`packages/cms`) — zero-infra default; `createSanityAdapter` (`packages/adapter-sanity`) — real Sanity Content API | Yes — `SANITY_PROJECT_ID` |
| Payments | `PaymentAdapter` | `createStripeAdapter` (`packages/payments`) — the only real payment adapter today | N/A (only one option; lazily constructed, not env-branched) |
| Admin auth | `AdminAuthAdapter` | `createDefaultAdminAuthAdapter` (`packages/admin-auth`) — dev-only cookie-based session, wrapped for Next.js as `createDevAdminAuthAdapter`; `createClerkAdminAuthAdapter` (`packages/adapter-clerk`) — real Clerk-backed auth | Yes — `CLERK_SECRET_KEY` |
| Analytics | `AnalyticsAdapter` | `createNoopAdapter` (`packages/analytics`) — zero-infra default (disabled, not an error state); `createPostHogAdapter` (`packages/analytics`) — real PostHog forwarding | Yes — `POSTHOG_API_KEY` |

Two things this table makes visible that a more casual retelling would gloss over. First,
**analytics' two adapters both live inside `packages/analytics` itself**, not in a separate
`packages/adapter-posthog` — unlike CMS/persistence/admin-auth, which each get their own sibling
adapter package. Second, **payments genuinely isn't swappable today**: there's exactly one
`PaymentAdapter` implementation in this codebase. The interface exists and is narrow (see
`packages/payments/src`), so a second implementation is architecturally straightforward to add —
it just hasn't been built. This table reports what's real, not what's merely possible in
principle.

## A real third-party adapter, end to end

`createShopifyAdapter` (`packages/adapter-shopify/src/index.ts`) is a good example of how far
this pattern stretches — it wraps an entire third-party commerce platform's own API behind the
same `CatalogPersistenceAdapter` interface the zero-infra SQLite adapter satisfies:

```ts
// packages/adapter-shopify/src/index.ts
export function createShopifyAdapter(config: ShopifyAdapterConfig & { currency?: string }): CatalogPersistenceAdapter {
  // ... wraps Shopify's Admin GraphQL API, mapping Shopify products/variants
  // onto this repo's own Product/Sku shapes
}
```

And `createSanityAdapter` (`packages/adapter-sanity/src/index.ts`) does the same for CMS,
wrapping Sanity's Content API behind `CmsPersistenceAdapter` — its public surface is *exactly*
`CmsPersistenceAdapter`, with no Sanity-specific type ever exported:

```ts
// packages/adapter-sanity/src/index.ts
export function createSanityAdapter(config: SanityAdapterConfig): CmsPersistenceAdapter {
  const client = createSanityClient(config);
  const pages: PageRepository = {
    async get(id) { /* ... */ },
    async getBySlug(slug) { /* ... */ },
    async list(filter) { /* ... */ },
    async save(page) { /* ... */ },
  };
  const marketingMeta: MarketingPageMetaRepository = { /* ... */ };
  return { pages, marketingMeta };
}
```

Neither adapter package is imported by the subsystem package it implements — `@mercatus-liber/cms`
has never heard of Sanity, and `@mercatus-liber/catalog` has never heard of Shopify. Both are
consumed only by an app's composition root.

## Why this matters beyond this repo

This is the concrete architecture behind epic 39's "roll your own commerce" capability-matrix
work: a deployment isn't locked into this project's own zero-infra defaults, and it isn't locked
into any single third-party vendor per subsystem either. Swapping CMS providers, swapping
payment providers (once a second real one exists), or standing up against a real Postgres
instead of the demo's in-memory SQLite are all composition-root changes — a different set of
`create*Adapter()` calls in one file — never a change to catalog, cart, checkout, or any other
subsystem's own source.

## Further reading

- [Architecture](/architecture) — the prime directive (no subsystem imports another subsystem's
  internals) this whole pattern depends on
- [Subsystem 01 — Catalog](/subsystems/01-catalog), [Subsystem 05 — CMS Pages](/subsystems/05-cms-pages),
  [Subsystem 08 — Payments](/subsystems/08-payments), [Subsystem 21 — Admin Auth](/subsystems/21-admin-auth),
  [Subsystem 13 — Analytics & Tracking](/subsystems/13-analytics-tracking) — each declares the
  swappable interface this page's table summarizes
- [Getting started](/getting-started) — `create-store`'s `--adapter sqlite|postgres|shopify`
  flag and the environment variables each adapter needs at runtime
- Planning corpus: [admin-adapter-visibility-settings](/planning/admin-adapter-visibility-settings),
  [cms-adapter-discoverability](/planning/cms-adapter-discoverability),
  [admin-auth-clerk](/planning/admin-auth-clerk)

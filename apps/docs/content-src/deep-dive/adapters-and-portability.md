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

**Persistence used to be the one exception worth calling out honestly — that finding is now
resolved.** `apps/reference-storefront` previously had no env-var branch for picking sqlite vs.
postgres at all: it was hardcoded to `createSqliteAdapter(":memory:")`, so every demo's catalog
data was lost on every restart. It now follows the identical two-branch shape as CMS/analytics/
admin-auth above, extended to three states (`lib/services.ts`'s `persistence` branch):

```ts
// apps/reference-storefront/lib/services.ts
const persistence = process.env.DATABASE_URL
  ? createPostgresAdapter(new Pool({ connectionString: process.env.DATABASE_URL }))
  : process.env.SQLITE_FILE_PATH
    ? createSqliteAdapter(process.env.SQLITE_FILE_PATH)
    : createSqliteAdapter(":memory:");
```

- `DATABASE_URL` set → a real `createPostgresAdapter()` (`packages/adapter-postgres`), backed by
  a `pg` `Pool` connected to that connection string.
- Else `SQLITE_FILE_PATH` set → a file-backed `createSqliteAdapter(path)` — durable across
  restarts, `journal_mode = WAL`.
- Else the original `createSqliteAdapter(":memory:")` default, unchanged — no setup required for
  a fresh checkout, but ephemeral: data resets on every restart. `lib/adapter-info.ts`'s
  `persistenceInfo()` now mirrors this exact branch and reports the in-memory case explicitly as
  "ephemeral — data resets on every restart" on `/admin/settings`, rather than silently reporting
  a single hardcoded row the way it did before this wiring existed.

Cart/order/promotion/etc. repositories stay in-memory regardless of persistence configuration —
this app's documented purpose is still a proof of integration/demo, not a fully persistent
production storefront (see `packages/adapter-sqlite`'s own README and this app's `package.json`
description). Catalog data is the one piece worth surviving a restart for a real demo/operator.
The swappability is also proven at the *package* level independent of this app's own wiring — see
the table below, and `@mercatus-liber/create-store`'s `--adapter` flag in
[Getting started](/getting-started), which lets you pick sqlite/postgres/shopify at scaffold
time.

## What's actually swappable today

This table was built by reading each `packages/adapter-*` package's real exports directly
(not assumed from naming conventions) and cross-checking against
`apps/reference-storefront/lib/adapter-info.ts` and `lib/services.ts`'s actual env-var branches.

| Subsystem | Interface | Adapters that really exist | Wired via env var in `services.ts`? |
| --- | --- | --- | --- |
| Persistence (catalog) | `CatalogPersistenceAdapter` | `createSqliteAdapter` (`packages/adapter-sqlite`) — in-process SQLite (`:memory:` or file-backed); `createPostgresAdapter` (`packages/adapter-postgres`) — real `pg`-backed Postgres; `createShopifyAdapter` (`packages/adapter-shopify`) — wraps the Shopify Admin GraphQL API as a catalog backend | Yes — `DATABASE_URL` (Postgres) else `SQLITE_FILE_PATH` (file-backed SQLite) else in-memory SQLite; `create-store`'s `--adapter` flag also exercises all three at scaffold time |
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

## Backup and restore

A durable, file-backed SQLite database (`SQLITE_FILE_PATH` pointed at a real path, not
`:memory:`) can be backed up and restored with `packages/adapter-sqlite`'s own CLI. Both
directions use SQLite's own **Online Backup API**, bound via `better-sqlite3`'s native
`.backup()` method — not a raw filesystem copy. A plain `cp`/`fs.copyFile` of a live database file
is unsafe: it can capture torn pages mid-write, and WAL-mode connections (the mode this adapter
sets) keep uncommitted data in `-wal`/`-shm` sidecar files a naive copy would miss entirely. The
Online Backup API copies page-by-page and re-copies any page that changes mid-backup, so it
produces a valid, consistent copy even while a real server process has the same file open and is
actively writing to it.

From a checkout of this monorepo:

```
pnpm --filter @mercatus-liber/adapter-sqlite build
node packages/adapter-sqlite/dist/cli.js backup <db-file-path> [backup-dir]
node packages/adapter-sqlite/dist/cli.js restore <backup-file-path> <target-db-file-path>
```

`backup` writes a new timestamped file (`<filename>.<ISO-timestamp>.bak`) into `[backup-dir]`
(defaults to a `backups/` directory next to `<db-file-path>`) and prints its full path:

```
node packages/adapter-sqlite/dist/cli.js backup ./data/catalog.db
# Backup written to ./data/backups/catalog.db.2026-09-09T12-34-56-789Z.bak
```

`restore` replays a backup into `<target-db-file-path>` using the same mechanism, and refuses to
run if the target path already exists — a restore can never silently clobber a live database:

```
node packages/adapter-sqlite/dist/cli.js restore ./data/backups/catalog.db.2026-09-09T12-34-56-789Z.bak ./data/catalog.restored.db
# Restored ./data/backups/catalog.db.2026-09-09T12-34-56-789Z.bak -> ./data/catalog.restored.db
```

See `packages/adapter-sqlite/README.md` for the full CLI reference, including the two commands'
plain, directly-importable function equivalents (`backupSqliteDatabase`/`restoreSqliteBackup`)
for programmatic use.

**This tooling is deliberately scoped to SQLite only.** Postgres- and Shopify-backed deployments
already have their own mature, real backup tooling — `pg_dump`/`pg_restore` for a Postgres
instance behind `DATABASE_URL`, and Shopify's own data export for a Shopify-backed catalog —
reinventing a worse version of either here would contradict the adapter-agnostic philosophy this
page is about. Use this repo's SQLite CLI only for the SQLite adapter; use each backend's own
native tooling everywhere else.

## Bring your own database

Pointing a deployment at a separately-hosted Postgres instance instead of the zero-infra SQLite
default is a one-variable change, no code edits required, because `services.ts`'s persistence
branch (above) already checks for it first:

1. Stand up a real Postgres instance anywhere you like (a managed service, a self-hosted
   container — this repo doesn't care, `@mercatus-liber/adapter-postgres` only needs a
   connection string a `pg.Pool` can use).
2. Set `DATABASE_URL` in the deployment's environment, e.g.
   `postgres://user:password@host:5432/mercatus_liber`.
3. Start (or restart) `apps/reference-storefront`. On boot, `lib/services.ts` sees
   `DATABASE_URL` is set and wires in `createPostgresAdapter(new Pool({ connectionString:
   process.env.DATABASE_URL }))` instead of any SQLite adapter — `@mercatus-liber/adapter-postgres`
   implements the exact same `CatalogPersistenceAdapter` interface the SQLite adapter does, so no
   other subsystem (catalog, cart, checkout, ...) notices or needs to change.
4. Confirm it took effect at `/admin/settings`, which reads `lib/adapter-info.ts`'s
   `persistenceInfo()` and will report `Persistence (catalog): Postgres — DATABASE_URL is set —
   createPostgresAdapter() (packages/adapter-postgres)` once the new adapter is live.

Unset `DATABASE_URL` (and `SQLITE_FILE_PATH`) to fall back to the harmless in-memory SQLite
default at any time — nothing about this path requires Postgres to run this app locally, it's
purely additive for a deployment that wants durable, production-grade catalog storage. The same
`--adapter postgres` flag on `@mercatus-liber/create-store` (see [Getting
started](/getting-started)) scaffolds a brand-new store already wired this way, rather than
retrofitting an existing `services.ts` by hand.

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

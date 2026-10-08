# @mercatus-liber/migrate-shopify

A **one-time** Shopify-to-native migration tool (epic
`shopify-migration-import-tool`). This is a different thing from
`@mercatus-liber/adapter-shopify`:

- `@mercatus-liber/adapter-shopify` is a **live wrapper**. Every catalog
  read/write proxies through Shopify's own API in real time, forever. A
  merchant using it is still fully hosted on Shopify.
- `@mercatus-liber/migrate-shopify` reads a merchant's existing Shopify
  store **once** and is meant to feed that data into Mercatus Liber's own
  native persistence (Postgres, SQLite, whichever backend the merchant
  picks), so they can actually leave Shopify.

## What this package does

1. **Read** (`readShopifyCatalog`): fully cursor-paginated reads of
   products, variants (mapped to this repo's `IdentifyingAttribute`/`Sku`
   shape), collections, and current inventory levels per variant, straight
   out of a real Shopify store. Returns structured in-memory data; writes
   nothing to Shopify.
2. **Write/import** (`importShopifyCatalog`): takes that snapshot and
   writes it into Mercatus Liber's own native persistence -- **exclusively**
   through the same public service-layer methods every other part of this
   app already uses: `CatalogService.createProduct`/`createSku`,
   `MarketingCatalogService.createCategory`/`assignProductToCategory`, and
   the real `InventoryAdapter.setStock`. There is no bespoke bulk-insert
   path, so the real service layer's own validation (e.g.
   `CatalogService`'s identifying-attribute-key check) always runs on every
   write this tool makes.

### Dry-run by default

`importShopifyCatalog(snapshot, deps, options)` defaults to `dryRun: true`.
A dry run performs **zero writes** -- it only calls read methods
(`getProductBySlug`, `getCategoryBySlug`, `listCategoriesForProduct`,
`resolveVariant`) against the real target persistence to compute an
accurate report: counts of products/categories/SKUs that would be created
vs. skipped, a sample of real product titles, and an `attention` list of
anything that doesn't cleanly map (a missing handle, a variant whose
identifying attributes don't match its product's, a collection referencing
a product handle absent from the whole snapshot) and would need manual
review. Pass `dryRun: false` explicitly to actually write.

### Idempotent -- safe to re-run

Every create is gated on a check against the target first: products and
categories by slug (`getProductBySlug`/`getCategoryBySlug`), SKUs by their
identifying attributes (`CatalogService.resolveVariant`) -- the same
check-by-slug-before-create convention already established in
`apps/reference-storefront/lib/idempotent-seed.ts`'s `upsertProduct`/
`upsertCategory`. Running the same import twice against the same snapshot
and the same target creates zero duplicate products, categories, or SKUs;
the second run's `created` counts are all `0` and its `skipped` counts
cover everything the first run created. A per-record try/catch also means
one bad record doesn't abort the rest of the import, so re-running after a
partial failure (a network error mid-import, etc.) only needs to redo what
actually failed.

## Out of scope for this first pass (disclosed, not silently dropped)

- **Orders, customers, and historical sales data.** A materially different
  and riskier data-sensitivity category than catalog data. Real future
  work, not migrated here.
- **Images/media.** Shopify product photos are never read by
  `readShopifyCatalog` and never written by `importShopifyCatalog`.
  Bringing them over would need to flow through `@mercatus-liber/media`'s
  own adapter pattern (Cloudinary or passthrough) -- a real integration
  point, scoped out of this first pass rather than half-implemented.
- **Shopify theme/storefront content.** Out of scope entirely -- this tool
  migrates catalog data, not a Shopify theme, which has no equivalent shape
  in this framework.

See `.pHive/epics/shopify-migration-import-tool/docs/design-discussion.md`
for the full scope rationale.

## Shopify API version

Targets Shopify Admin GraphQL API version `2026-10` (the current stable
release as of 2026-10-07 -- see `src/api-version.ts` for how that was
verified directly against Shopify's own live docs, not assumed). This is
newer than `@mercatus-liber/adapter-shopify`'s own default (`2025-01`,
likely retired); this package always passes its own version explicitly
rather than relying on that default.

## Multi-location inventory

Shopify supports inventory split across multiple locations; this repo's own
native inventory model (`packages/inventory`) is single-location (one
`onHand` number per SKU). This package sums each variant's Shopify
`on_hand` quantity across every location as the value to seed into the
native model, while still returning the full per-location breakdown
alongside it so nothing is silently dropped. See `src/inventory.ts` for the
full reasoning.

## Usage (programmatic)

```ts
import { createGraphQLClient, readShopifyCatalog, importShopifyCatalog } from "@mercatus-liber/migrate-shopify";

const client = createGraphQLClient({ shop: "my-shop.myshopify.com", accessToken: "shpat_..." });
const snapshot = await readShopifyCatalog(client);
// snapshot.products: ImportedProduct[]
// snapshot.collections: ImportedCollection[]

// Dry run first (the default) -- writes nothing, just reports.
const dryRunReport = await importShopifyCatalog(snapshot, { catalog, marketingCatalog, inventory });
console.log(dryRunReport);

// Only once the dry-run report looks right, actually write:
const realReport = await importShopifyCatalog(snapshot, { catalog, marketingCatalog, inventory }, { dryRun: false });
```

`catalog`, `marketingCatalog`, and `inventory` above are this repo's own
real `CatalogService`/`MarketingCatalogService`/`InventoryAdapter`
instances (the exact same ones wired up elsewhere in this app, e.g.
`apps/reference-storefront/lib/services.ts`) -- `importShopifyCatalog`
never constructs its own persistence; the caller is responsible for
pointing it at whichever native backend (SQLite, Postgres, etc.) the
merchant has chosen.

## Credentials: what you need from your real Shopify store

This tool only ever **reads** from Shopify (it never writes back to
Shopify -- see "Out of scope for this first pass" above), so it only needs
a **read-only** Admin API access token. Verified directly against Shopify's
own current live documentation on 2026-10-07 (`shopify.dev/docs/api/usage/
access-scopes`), not assumed from training data:

1. In your Shopify admin, create a **custom app** (Settings -> Apps and
   sales channels -> Develop apps) and configure its **Admin API access
   scopes**. The exact scopes this tool needs:
   - `read_products` -- grants read access to `Product`, `ProductVariant`,
     and `Collection` objects (everything `readAllProducts`/
     `readAllCollections` fetch).
   - `read_inventory` -- grants read access to `InventoryItem` and
     `InventoryLevel` objects (everything `readAllProducts`'s per-variant
     inventory read uses).
   - No write scopes (`write_products`, `write_inventory`, etc.) are
     needed -- this tool writes only into your chosen **native** target
     (SQLite/Postgres), never back into Shopify.
2. Install the custom app on your store and copy its **Admin API access
   token** (starts with `shpat_`) -- this is the `--access-token` /
   `SHOPIFY_ACCESS_TOKEN` value below. Treat it like any other secret:
   don't commit it, don't paste it into a shared chat.
3. Your store's domain (`<your-shop>.myshopify.com`) is the `--shop` /
   `SHOPIFY_SHOP` value.

This tool targets Shopify Admin GraphQL API version `2026-10` explicitly
(see "Shopify API version" above) -- a custom app's access token works
against any API version this tool requests; you don't need to separately
configure an API version on the Shopify side.

## Usage (CLI)

Two bins ship from this package:

### `migrate-shopify` -- the real tool (read -> dry-run report -> confirm -> write)

```sh
# Dry run (the default -- ALWAYS safe, performs zero writes to the target):
migrate-shopify \
  --shop my-shop.myshopify.com \
  --access-token shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --target sqlite --sqlite-file ./my-shop.sqlite

# Once the dry-run report above looks right, perform the real import
# (idempotent -- safe to re-run; already-imported records are skipped):
migrate-shopify \
  --shop my-shop.myshopify.com \
  --access-token shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --target sqlite --sqlite-file ./my-shop.sqlite \
  --confirm

# Postgres target instead of SQLite:
migrate-shopify \
  --shop my-shop.myshopify.com \
  --access-token shpat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  --target postgres --database-url postgres://user:pass@host:5432/db \
  --confirm
```

Every flag has an equivalent env var (`SHOPIFY_SHOP`,
`SHOPIFY_ACCESS_TOKEN`, `SHOPIFY_CURRENCY`, `SQLITE_FILE_PATH`,
`DATABASE_URL`) matching `apps/reference-storefront/lib/services.ts`'s own
env-var names, so a store that already has `SQLITE_FILE_PATH`/
`DATABASE_URL` set for its real deployment can run this tool against the
exact same target without repeating the connection string on the command
line. Dry-run is the **default** -- there is no flag that makes a run
write by accident; only an explicit `--confirm` does. Run `migrate-shopify`
with no arguments to see full usage.

`--target` currently wires two of this repo's native backends: `sqlite`
and `postgres` (the same two `packages/create-store`'s own `AdapterChoice`
offers a merchant at store-creation time) -- see `src/targets.ts`. This
repo also has real, already-tested MongoDB and Convex catalog adapters
(wired into `apps/reference-storefront/lib/services.ts`), but they are
**not yet plumbed into this CLI's `--target` flag** -- a disclosed gap,
not a silent one. `importShopifyCatalog` itself only depends on the
`CatalogService`/`MarketingCatalogService`/`InventoryAdapter` interfaces,
so adding Mongo/Convex as CLI targets later is a pure CLI-side addition.

One more disclosed limitation: for the `sqlite` target, this tool wires
the same `InventoryAdapter` choice `services.ts` does for SQLite --
**in-memory**. This repo has no SQLite-backed `InventoryAdapter`
implementation anywhere today, so a SQLite-targeted import's stock levels
do not survive a process restart (products/SKUs/categories do -- only
stock quantities are in-memory). The `postgres` target uses the real
`@mercatus-liber/adapter-postgres-inventory`-backed adapter, which is
durable.

### `migrate-shopify-read` -- read-only preview (unchanged, kept for back-compat)

```sh
SHOPIFY_SHOP=my-shop.myshopify.com SHOPIFY_ACCESS_TOKEN=shpat_... migrate-shopify-read
```

Prints a JSON summary (counts plus the full read snapshot) to stdout.
Read-only -- never calls `importShopifyCatalog`, never writes anywhere.
Useful for inspecting the raw snapshot shape before running a real
import. `migrate-shopify` above is the command an actual merchant should
run.

## Honest disclosure: no live Shopify store in this environment

No real Shopify store credentials exist in this development environment
(checked directly against the `mercatus-liber-commerce` Portunus vault
before this epic was planned -- confirmed absent). This tool has been
built for real and verified for real, but **never against an actual
Shopify store**:

- The **read** side (`readShopifyCatalog`) is tested for real against
  **injected fakes** implementing the same `GraphQLClient` interface
  `@mercatus-liber/adapter-shopify` already uses for its own tests (see
  `test/fake-graphql-client.ts`).
- The **write** side (`importShopifyCatalog`) is tested for real against
  a real, in-process SQLite database via `@mercatus-liber/adapter-sqlite`
  (see `test/test-persistence.ts`/`test/write-catalog.test.ts`), through
  the real `CatalogService`/`MarketingCatalogService`/`InventoryAdapter`
  -- genuinely real persistence, genuinely real validation, just not a
  real Shopify *source* and not Postgres/Mongo/Convex as the *target*
  (those adapters all implement the same `CatalogPersistenceAdapter`/
  category-repository contracts this test exercises against SQLite, so
  there's no reason to expect different write-path behavior against
  them, but it hasn't been separately verified here).
- The **full `migrate-shopify` CLI binary itself** (the actual compiled
  `dist/cli-migrate.js`, invoked from a real shell exactly as a merchant
  would) was run end to end against a real local HTTP server standing in
  for Shopify's Admin GraphQL endpoint (same fixture shapes as
  `test/fake-graphql-client.ts`, served over a real socket, with the
  CLI's own `fetch` call transparently redirected to it -- there being no
  real Shopify DNS entry to safely point at instead) and a real,
  file-backed SQLite target. Observed directly: a dry run that reads 2
  real fixture products / 1 collection, prints an accurate report, and
  writes zero rows; a `--confirm` run that writes the real rows; and a
  second `--confirm` run against the same target and the same snapshot
  that reports `created=0`/`skipped=<N>` across every entity kind with
  the on-disk row count unchanged -- idempotency verified through the
  real binary, not just through `vitest`.

**Live end-to-end verification against a real Shopify store is still
blocked and has not been done.** The gap above (injected fakes, not a
real Shopify store) is exactly the same honest-disclosure shape already
applied elsewhere in this repo for Printful, Printify, Shippo, GA4, a real
Stripe key, and MongoDB Atlas. Do not read any of the above -- real tests,
or a real CLI run against a real local fixture server -- as a substitute
for live verification against an actual Shopify store, which has never
happened.

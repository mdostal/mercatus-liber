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

## Usage (CLI preview)

```sh
SHOPIFY_SHOP=my-shop.myshopify.com SHOPIFY_ACCESS_TOKEN=shpat_... migrate-shopify-read
```

Prints a JSON summary (counts plus the full read snapshot) to stdout. This
CLI is still read-only -- it does not call `importShopifyCatalog`. A real
CLI entry point that drives the full read -> dry-run-report -> confirm ->
write flow end to end is separate, later work for this epic (the
CLI/docs pass); until that lands, use `importShopifyCatalog` the way
"Usage (programmatic)" above shows.

## Honest disclosure: no live Shopify store in this environment

No real Shopify store credentials exist in this development environment.
The **read** side is built for real and tested for real against
**injected fakes** implementing the same `GraphQLClient` interface
`@mercatus-liber/adapter-shopify` already uses for its own tests (see
`test/fake-graphql-client.ts`). The **write** side
(`importShopifyCatalog`) is tested for real against a real, in-process
SQLite database via `@mercatus-liber/adapter-sqlite` (see
`test/test-persistence.ts`/`test/write-catalog.test.ts`), through the real
`CatalogService`/`MarketingCatalogService`/`InventoryAdapter` -- genuinely
real persistence, genuinely real validation, just not a real Shopify
*source* and not Postgres/Mongo/Convex as the *target* (those adapters all
implement the same `CatalogPersistenceAdapter`/category-repository
contracts this test exercises against SQLite, so there's no reason to
expect different write-path behavior against them, but it hasn't been
separately verified here). **Live end-to-end verification against a real
Shopify store is blocked** and has not been done. Do not read test coverage
here as a substitute for that.

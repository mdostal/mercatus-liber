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

## Current scope: read-only

This package currently implements only the **read side**: fully
cursor-paginated reads of products, variants (mapped to this repo's
`IdentifyingAttribute`/`Sku` shape), collections, and current inventory
levels per variant. It returns structured in-memory data and writes
**nothing** -- not to Shopify, and not to Mercatus Liber's own persistence.
The write/import path (via `CatalogService`/`MarketingCatalogService`/the
inventory adapter, with dry-run and idempotent-upsert support) is separate,
later work. See
`.pHive/epics/shopify-migration-import-tool/docs/design-discussion.md` for
the full scope and rationale.

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
import { createGraphQLClient, readShopifyCatalog } from "@mercatus-liber/migrate-shopify";

const client = createGraphQLClient({ shop: "my-shop.myshopify.com", accessToken: "shpat_..." });
const snapshot = await readShopifyCatalog(client);
// snapshot.products: ImportedProduct[]
// snapshot.collections: ImportedCollection[]
```

## Usage (CLI preview)

```sh
SHOPIFY_SHOP=my-shop.myshopify.com SHOPIFY_ACCESS_TOKEN=shpat_... migrate-shopify-read
```

Prints a JSON summary (counts plus the full read snapshot) to stdout. This
is a read-only preview of this package's current scope, not the full
migration tool described above.

## Honest disclosure: no live Shopify store in this environment

No real Shopify store credentials exist in this development environment.
This package is built for real and tested for real against **injected
fakes** implementing the same `GraphQLClient` interface
`@mercatus-liber/adapter-shopify` already uses for its own tests (see
`test/fake-graphql-client.ts`), but **live end-to-end verification against
a real Shopify store is blocked** and has not been done. Do not read test
coverage here as a substitute for that.

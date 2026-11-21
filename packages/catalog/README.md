# @mercatus-liber/catalog

Products, SKUs, attributes, and catalogs. Storage goes through `CatalogPersistenceAdapter` from `@mercatus-liber/core`, so the same service runs on any adapter.

**Status:** used by the demo stores, on Postgres (Print Shop, Northline) and Convex (Broadleaf). Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { createInMemoryEventBus } from "@mercatus-liber/core";
import {
  createCatalogService,
  createInMemoryCatalogRepository,
  createInMemoryProductCatalogRepository,
} from "@mercatus-liber/catalog";

const catalog = createCatalogService({
  persistence,
  events: createInMemoryEventBus(),
  catalogs: createInMemoryCatalogRepository(),
  productCatalogs: createInMemoryProductCatalogRepository(),
});

const product = await catalog.createProduct({
  slug: "mug",
  title: "Mug",
  description: "A mug.",
  identifyingAttributeKeys: ["color"],
});
await catalog.generateSkus(product.id, { color: ["red", "blue"] }, { amount: 1999, currency: "USD" });
await catalog.publishProduct(product.id);
```

`persistence` is any `CatalogPersistenceAdapter`, such as `createSqliteAdapter` from `@mercatus-liber/adapter-sqlite` or `createPostgresAdapter` from `@mercatus-liber/adapter-postgres`.

## Sale windows

`createProduct`, `updateProduct`, `createSku` and `updateSku` take `activeFrom` / `activeTo`
(ISO 8601; `null` clears one). They're stored as UTC (`2026-11-30T12:00:00-06:00` becomes
`2026-11-30T18:00:00.000Z`), and an end that isn't after the start throws `InvalidScheduleError`.
Postgres, SQLite and MongoDB keep them; the Convex functions don't yet (their schema needs a
deploy). Read a product's state with `lifecycle` from `@mercatus-liber/core`.

## Lines (sales catalogs)

A store's main catalog is a master catalog. A **sales catalog** (a line or collection) reuses
master products in its own order, with its own schedule and landing page, like HCL Commerce's
sales catalogs. `createCatalog` / `updateCatalog` take:

- `kind: "sales"` and `masterCatalogId` (the store it belongs to);
- `activeFrom` / `activeTo` (UTC) and `status`;
- `hero` (`{ title, subtitle?, imageUrl?, imageAlt?, cta? }`);
- `sections` (ordered `{ slug, title, productIds }`). Their products are added to the catalog; an unknown product id is refused before anything is saved.

Lines can overlap and share products (membership is many-to-many).

- `listCatalogs({ kind, masterCatalogId })` filters.
- `getCatalogLanding(idOrSlug, now)` returns `{ catalog, lifecycle, sections (with active products), otherProducts }`. Empty sections are kept, so a line can be announced before it has products.
- `applyCatalogWindowToProducts(catalogId)` gives each product in a line a window covering every line it's in (earliest start, latest end). After a line's week its products go off sale unless another line or `updateProduct(id, { activeTo: null })` brings them back.

Postgres stores the new fields (additive columns); the in-memory repository needs nothing.

## Key exports

- `createCatalogService(deps)`: product, SKU, attribute, and catalog operations, including `generateSkus`, `resolveVariant`, and `listProductsInCatalog`.
- `createInMemoryCatalogRepository()`, `createInMemoryProductCatalogRepository()`.
- `attributesKey`, `cartesianProduct`.
- `ProductNotFoundError`, `InvalidIdentifyingAttributesError`, `CatalogNotFoundError`, `DuplicateCatalogSlugError`.

## Implementing storage

Implement `CatalogPersistenceAdapter` from `@mercatus-liber/core`. The service never sees a storage-specific type.

See [docs/subsystems/01-catalog.md](../../docs/subsystems/01-catalog.md).

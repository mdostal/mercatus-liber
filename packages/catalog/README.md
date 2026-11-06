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

## Key exports

- `createCatalogService(deps)`: product, SKU, attribute, and catalog operations, including `generateSkus`, `resolveVariant`, and `listProductsInCatalog`.
- `createInMemoryCatalogRepository()`, `createInMemoryProductCatalogRepository()`.
- `attributesKey`, `cartesianProduct`.
- `ProductNotFoundError`, `InvalidIdentifyingAttributesError`, `CatalogNotFoundError`, `DuplicateCatalogSlugError`.

## Implementing storage

Implement `CatalogPersistenceAdapter` from `@mercatus-liber/core`. The service never sees a storage-specific type.

See [docs/subsystems/01-catalog.md](../../docs/subsystems/01-catalog.md).

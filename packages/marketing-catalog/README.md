# @mercatus-liber/marketing-catalog

Merchandising categories, which are separate from the operational catalog: a category tree, product assignments, and suggested categories from attribute rules.

**Status:** used by the demo stores, with Postgres, Convex, and MongoDB repositories in the matching adapter packages. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import {
  createInMemoryCategoryRepository,
  createInMemoryProductCategoryRepository,
  createMarketingCatalogService,
} from "@mercatus-liber/marketing-catalog";

const marketing = createMarketingCatalogService({
  categories: createInMemoryCategoryRepository(),
  assignments: createInMemoryProductCategoryRepository(),
  attributes,
});

const productIds = await marketing.listProductIdsInCategory("category-1");
```

## Key exports

- `createMarketingCatalogService(deps)`: `createCategory`, `getCategory`, `getCategoryBySlug`, `listCategories`, `listChildCategories`, `assignProductToCategory`, `unassignProductFromCategory`, `listCategoriesForProduct`, `listProductIdsInCategory`, `suggestCategories`.
- `createInMemoryCategoryRepository()`, `createInMemoryProductCategoryRepository()`.
- `CategoryNotFoundError`.

See [docs/subsystems/02-marketing-catalog.md](../../docs/subsystems/02-marketing-catalog.md).

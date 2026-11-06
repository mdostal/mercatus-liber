# @mercatus-liber/storefront-views

Curated, schedulable views of a store: a hero, a set of categories, an optional theme, and an optional homepage override.

**Status:** used by the demo stores; a Postgres repository ships in `@mercatus-liber/adapter-postgres`. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import {
  createInMemoryStorefrontViewRepository,
  createStorefrontViewsService,
  isViewLive,
} from "@mercatus-liber/storefront-views";

const views = createStorefrontViewsService({
  repository: createInMemoryStorefrontViewRepository(),
});

const override = await views.getActiveDefaultOverride("print-shop");
const view = await views.getViewBySlug("print-shop", "summer-sale");
if (view) console.log(isViewLive(view));
```

## Key exports

- `createStorefrontViewsService(deps)`: `createView`, `getView`, `getViewBySlug`, `listViews`, `updateView`, `publishView`, `archiveView`, `getActiveDefaultOverride`.
- `isViewLive(view)`.
- `createInMemoryStorefrontViewRepository()`.
- `StorefrontViewNotFoundError`.

See [docs/subsystems/25-storefront-views.md](../../docs/subsystems/25-storefront-views.md).

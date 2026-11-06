# @mercatus-liber/cms

Pages made of registered components, plus marketing page metadata. Storage goes through `CmsPersistenceAdapter`.

**Status:** used by the demo stores. In-memory storage is the default; `@mercatus-liber/adapter-sanity` is the production backend. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { createCmsService, createComponentRegistry, createInMemoryCmsAdapter } from "@mercatus-liber/cms";

const cms = createCmsService({
  persistence: createInMemoryCmsAdapter(),
  components: createComponentRegistry(),
});

const page = await cms.getPageBySlug("home");
```

`createComponentRegistry()` starts with `DEFAULT_COMPONENTS`; pass your own list to replace them.

## Key exports

- `createCmsService(deps)`: `createPage`, `updatePage`, `publishPage`, `getPage`, `getPageBySlug`, `listPages`, `createMarketingPage`, `getMarketingPageMeta`, `components`.
- `createComponentRegistry(initial?)`, `DEFAULT_COMPONENTS`.
- `createInMemoryCmsAdapter()`, `createInMemoryPageRepository()`, `createInMemoryMarketingPageMetaRepository()`.
- `PageType`: `home`, `category`, `marketing`, `search`, `pdp`, `location`.
- `PageNotFoundError`.

## Implementing an adapter

Implement `CmsPersistenceAdapter`, `{ pages, marketingMeta }`, and pass it as `persistence`. See `@mercatus-liber/adapter-sanity` for a complete one. The component registry is also an extension point.

See [docs/subsystems/05-cms-pages.md](../../docs/subsystems/05-cms-pages.md).

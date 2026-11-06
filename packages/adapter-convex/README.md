# @mercatus-liber/adapter-convex

A `CatalogPersistenceAdapter` and category repositories backed by Convex.

**Status:** live in production for the Broadleaf demo store. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { connectConvexAdapter, connectConvexCategoryRepository } from "@mercatus-liber/adapter-convex";

const persistence = await connectConvexAdapter(process.env.CONVEX_URL!);
const categories = await connectConvexCategoryRepository(process.env.CONVEX_URL!);
```

To supply your own client, use `createConvexAdapter(client)` with anything matching `ConvexClientLike`.

## Setup

Deploy the functions in `convex-functions/` to your Convex project first; the adapter calls them by name. See `convex-functions/README.md`.

## Key exports

- `connectConvexAdapter(url)`, `createConvexAdapter(client)`.
- `connectConvexCategoryRepository(url)`, `createConvexCategoryRepository(client)`.
- `connectConvexProductCategoryRepository(url)`, `createConvexProductCategoryRepository(client)`.
- The `connect*` functions are async; the `create*` functions take a client you already hold.
- `connectConvexCustomizationRepositories(url)`, `createConvexCustomizationRepositories(client)`: all five customization repositories.
- `ConvexClientLike`: `{ query, mutation }`.

## Environment

- `CONVEX_URL`: used by the reference storefront only when `DATABASE_URL` and `MONGODB_URL` are unset.
- `<DEMO>_CONVEX_URL`: a per-demo-store override.

See [docs/subsystems/00-core-schema.md](../../docs/subsystems/00-core-schema.md) and [integrations.md](../../apps/docs/content-src/integrations.md).

# @mercatus-liber/adapter-mongodb

A `CatalogPersistenceAdapter` and category repositories backed by MongoDB.

**Status:** built and tested against a fake `Db`, and wired into the reference storefront behind `MONGODB_URL`. Not live anywhere yet, and unverified against a real MongoDB deployment. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { connectMongoAdapter } from "@mercatus-liber/adapter-mongodb";

const { adapter, close } = await connectMongoAdapter(process.env.MONGODB_URL!);

// Pass `adapter` as `persistence` to createCatalogService, then on shutdown:
await close();
```

If you already hold a database handle, use `createMongoAdapter(db)`, which accepts anything matching `DbLike`.

## Key exports

- `connectMongoAdapter(connectionString)`: returns `{ adapter, close }`.
- `createMongoAdapter(db)`.
- `createMongoCategoryRepository`, `createMongoProductCategoryRepository`.
- Customization: `createMongoPaletteRepository`, `createMongoFinishTierRepository`, `createMongoArtStyleRepository`, `createMongoProductCustomizationRepository`, `createMongoPricingRulesRepository`.
- `DbLike`, `CollectionLike`: the minimal driver surface used, which is what makes it testable with a fake.

See [docs/subsystems/00-core-schema.md](../../docs/subsystems/00-core-schema.md) and [integrations.md](../../apps/docs/content-src/integrations.md).

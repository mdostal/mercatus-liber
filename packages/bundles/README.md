# @mercatus-liber/bundles

Tiered product bundles: each tier is a set of SKUs, priced from those SKUs and checked for a single currency.

**Status:** used by the demo stores; a Postgres repository ships in `@mercatus-liber/adapter-postgres`. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { createBundlesService, createInMemoryBundleRepository } from "@mercatus-liber/bundles";

const bundles = createBundlesService({
  repository: createInMemoryBundleRepository(),
  skuLookup,
});

const pricing = await bundles.computeTierPricing("bundle-1", "tier-1");
```

## Key exports

- `createBundlesService(deps)`: `createBundle`, `getBundle`, `getBundleForProduct`, `listBundles`, `updateBundle`, `deactivateBundle`, `computeTierPricing`.
- `createInMemoryBundleRepository()`.
- `resolveTierCartSkuIds(tier, activeSelection, lookup)`: resolves a tier to the SKU ids to add to a cart.
- `SkuPriceLookup`, `TierSkuVariantLookup`: lookups you supply.
- `BundleSkuNotFoundError`, `BundleCurrencyMismatchError`.

## Implementing storage

Implement the repository interface this package exports and pass it as `repository`. `@mercatus-liber/adapter-postgres` has `createPostgresBundleRepository` as a reference.

See [docs/subsystems/17-bundles.md](../../docs/subsystems/17-bundles.md).

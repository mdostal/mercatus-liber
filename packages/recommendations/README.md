# @mercatus-liber/recommendations

Hand-curated product recommendation rules: from one source product to a list of targets, at a named placement.

**Status:** used by the demo stores; a Postgres repository ships in `@mercatus-liber/adapter-postgres`. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import {
  createInMemoryRecommendationRepository,
  createRecommendationsService,
} from "@mercatus-liber/recommendations";

const recommendations = createRecommendationsService({
  repository: createInMemoryRecommendationRepository(),
});

const rules = await recommendations.getRecommendationsForProduct("product-1");
```

`getRecommendationsForProduct` takes an optional placement to narrow the result. Rules are curated; there is no behavioral or machine-learned model in this package.

## Key exports

- `createRecommendationsService(deps)`: `createRule`, `getRule`, `listRules`, `updateRule`, `deactivateRule`, `getRecommendationsForProduct`.
- `createInMemoryRecommendationRepository()`.
- `RecommendationRule`, `RecommendationPlacement`.

See [docs/subsystems/18-recommendations.md](../../docs/subsystems/18-recommendations.md).

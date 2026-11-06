# @mercatus-liber/promotions

Percentage and fixed discounts, at cart or product scope, with coupon codes, schedules, minimum spends, and usage limits.

**Status:** used by the demo stores; a Postgres repository ships in `@mercatus-liber/adapter-postgres`. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { createInMemoryEventBus } from "@mercatus-liber/core";
import { createInMemoryPromotionRepository, createPromotionsService } from "@mercatus-liber/promotions";

const promotions = createPromotionsService({
  repository: createInMemoryPromotionRepository(),
  events: createInMemoryEventBus(),
});

const result = await promotions.evaluate({ items, couponCode: "WELCOME10" });
```

## Key exports

- `createPromotionsService(deps)`: `createPromotion`, `getPromotion`, `listPromotions`, `updatePromotion`, `deactivatePromotion`, `evaluate`, `recordAppliedPromotion`.
- `createInMemoryPromotionRepository()`.
- Types: `Promotion`, `PromotionKind` (`percentage`, `fixed`), `PromotionScope` (`cart`, `product`).

## Implementing storage

Implement the repository interface this package exports and pass it as `repository`.

See [docs/subsystems/16-promotions.md](../../docs/subsystems/16-promotions.md).

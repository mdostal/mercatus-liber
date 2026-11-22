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

## Promotions on a line or category

A product-scope promotion can name `targetCollectionIds`: line (sales catalog), catalog or category
ids. At evaluation every cart SKU in one of them is discounted too, so "20% off the Frost line this
week" is one promotion whose reach follows the line's membership. The store passes
`collections: { collectionIdsForSku }` to `createPromotionsService` (the reference storefront
returns the SKU's product's catalog and category ids). Combine with `startsAt` / `endsAt` for a
line-week deal. Postgres stores it in an additive `target_collection_ids` column.

## Key exports

- `createPromotionsService(deps)`: `createPromotion`, `getPromotion`, `listPromotions`, `updatePromotion`, `deactivatePromotion`, `evaluate`, `recordAppliedPromotion`.
- `createInMemoryPromotionRepository()`.
- Types: `Promotion`, `PromotionKind` (`percentage`, `fixed`), `PromotionScope` (`cart`, `product`).

## Implementing storage

Implement the repository interface this package exports and pass it as `repository`.

See [docs/subsystems/16-promotions.md](../../docs/subsystems/16-promotions.md).

## What gets charged, and counting redemptions

A cart-wide (`scope: "cart"`) discount is spread into every line's `unitAmount`
(`spreadCartDiscount`), rounded so the shopper never gets less than the discount, and
`discountTotal` is what the lines actually come to. Anything that sums the lines (a payment page)
charges exactly the evaluated total. (Before 2026-11-21 cart-wide discounts left the lines
undiscounted, so the payment page charged full price.)

A promotion applied at checkout waits in an `AppliedPromotionStore` until `checkout.order.paid`,
then counts one redemption. Pass a shared one on serverless (`createPostgresAppliedPromotionStore`
from adapter-postgres): its `take` is a single `DELETE ... RETURNING`, so the paid event counts
once whichever instance hears it. A repository with `incrementRedemptions` (Postgres has it)
counts concurrent redemptions without losing any. The default in-memory store only works in one
process.


# @mercatus-liber/reviews

Product reviews with moderation. A review starts as pending and appears publicly only after it is published.

**Status:** used by the demo stores; a Postgres repository ships in `@mercatus-liber/adapter-postgres`. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { createInMemoryEventBus } from "@mercatus-liber/core";
import { createInMemoryReviewRepository, createReviewsService } from "@mercatus-liber/reviews";

const reviews = createReviewsService({
  repository: createInMemoryReviewRepository(),
  events: createInMemoryEventBus(),
});

const review = await reviews.submitReview({
  productId: "product-1",
  rating: 5,
  authorName: "Ada",
  title: "Great",
  body: "Exactly as described.",
});
await reviews.moderateReview(review.id, "published");

const summary = await reviews.getRatingSummary("product-1");
```

## Key exports

- `createReviewsService(deps)`: `submitReview`, `getReview`, `listPublishedReviewsForProduct`, `listAllForModeration`, `moderateReview`, `getRatingSummary`.
- `createInMemoryReviewRepository()`.
- `ReviewNotFoundError`, `ReviewAlreadyRejectedError`.

See [docs/subsystems/24-reviews.md](../../docs/subsystems/24-reviews.md).

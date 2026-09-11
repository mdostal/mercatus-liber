import { randomUUID } from "node:crypto";
import type { EventBus } from "@mercatus-liber/core";
import { ReviewNotFoundError } from "./types.js";
import type { NewReviewInput, RatingSummary, Review, ReviewRepository, ReviewStatus } from "./types.js";

export interface ReviewsService {
  submitReview(input: NewReviewInput): Promise<Review>;
  getReview(id: string): Promise<Review | null>;
  /** Published reviews only -- the real public PDP read path. A pending/rejected review is never returned here, regardless of who's asking; moderation has its own listAllForModeration. */
  listPublishedReviewsForProduct(productId: string): Promise<Review[]>;
  /** Every review for this product regardless of status -- the admin moderation queue's per-product read path. */
  listAllForModeration(filter?: { status?: ReviewStatus }): Promise<Review[]>;
  /** pending -> published or pending -> rejected. Publishes reviews.review.published only on the published transition. Throws ReviewNotFoundError for an unknown id. */
  moderateReview(id: string, status: "published" | "rejected"): Promise<Review>;
  /** Computed fresh from listPublishedReviewsForProduct every call -- never cached/stale, mirrors PromotionsService.evaluate's "always live" posture. */
  getRatingSummary(productId: string): Promise<RatingSummary>;
}

function emptyDistribution(): RatingSummary["distribution"] {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

export function createReviewsService(deps: { repository: ReviewRepository; events: EventBus }): ReviewsService {
  const { repository, events } = deps;

  return {
    async submitReview(input: NewReviewInput): Promise<Review> {
      const review: Review = {
        id: randomUUID(),
        productId: input.productId,
        rating: input.rating,
        authorName: input.authorName,
        title: input.title,
        body: input.body,
        verifiedPurchase: input.verifiedPurchase ?? false,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      await repository.save(review);
      await events.publish("reviews.review.submitted", { id: review.id, productId: review.productId });
      return review;
    },

    async getReview(id: string): Promise<Review | null> {
      return repository.get(id);
    },

    async listPublishedReviewsForProduct(productId: string): Promise<Review[]> {
      const all = await repository.listByProduct(productId);
      return all.filter((review) => review.status === "published");
    },

    async listAllForModeration(filter?: { status?: ReviewStatus }): Promise<Review[]> {
      return repository.listAll(filter);
    },

    async moderateReview(id: string, status: "published" | "rejected"): Promise<Review> {
      const existing = await repository.get(id);
      if (!existing) throw new ReviewNotFoundError(id);
      const updated: Review = { ...existing, status };
      await repository.save(updated);
      if (status === "published") {
        await events.publish("reviews.review.published", { id: updated.id, productId: updated.productId });
      }
      return updated;
    },

    async getRatingSummary(productId: string): Promise<RatingSummary> {
      const published = (await repository.listByProduct(productId)).filter((review) => review.status === "published");
      const distribution = emptyDistribution();
      for (const review of published) distribution[review.rating] += 1;
      const count = published.length;
      const average = count === 0 ? 0 : published.reduce((sum, review) => sum + review.rating, 0) / count;
      return { productId, average, count, distribution };
    },
  };
}

import { createInMemoryEventBus, type EventBus } from "@mercatus-liber/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryReviewRepository } from "../src/in-memory-repository.js";
import { createReviewsService, type ReviewsService } from "../src/service.js";
import { ReviewNotFoundError } from "../src/types.js";
import type { NewReviewInput, ReviewRepository } from "../src/types.js";

function baseReview(overrides: Partial<NewReviewInput> = {}): NewReviewInput {
  return {
    productId: "p1",
    rating: 5,
    authorName: "Ada L.",
    title: "Exactly as described",
    body: "Real, specific praise about the product.",
    ...overrides,
  };
}

describe("reviews service", () => {
  let repository: ReviewRepository;
  let events: EventBus;
  let reviews: ReviewsService;
  const submittedEvents: unknown[] = [];
  const publishedEvents: unknown[] = [];

  beforeEach(() => {
    submittedEvents.length = 0;
    publishedEvents.length = 0;
    repository = createInMemoryReviewRepository();
    events = createInMemoryEventBus();
    events.subscribe("reviews.review.submitted", async (p) => {
      submittedEvents.push(p);
    });
    events.subscribe("reviews.review.published", async (p) => {
      publishedEvents.push(p);
    });
    reviews = createReviewsService({ repository, events });
  });

  describe("submitReview", () => {
    it("assigns an id, defaults to pending status and verifiedPurchase false, stamps createdAt", async () => {
      const review = await reviews.submitReview(baseReview());
      expect(review.id).toBeTruthy();
      expect(review.status).toBe("pending");
      expect(review.verifiedPurchase).toBe(false);
      expect(review.createdAt).toBeTruthy();
    });

    it("honors an explicit verifiedPurchase: true", async () => {
      const review = await reviews.submitReview(baseReview({ verifiedPurchase: true }));
      expect(review.verifiedPurchase).toBe(true);
    });

    it("publishes reviews.review.submitted, never reviews.review.published", async () => {
      const review = await reviews.submitReview(baseReview());
      expect(submittedEvents).toEqual([{ id: review.id, productId: "p1" }]);
      expect(publishedEvents).toEqual([]);
    });
  });

  describe("visibility -- pending/rejected never leak into published reads", () => {
    it("a freshly submitted (pending) review is invisible to listPublishedReviewsForProduct and getRatingSummary", async () => {
      await reviews.submitReview(baseReview());
      expect(await reviews.listPublishedReviewsForProduct("p1")).toEqual([]);
      const summary = await reviews.getRatingSummary("p1");
      expect(summary.count).toBe(0);
      expect(summary.average).toBe(0);
    });

    it("a rejected review stays invisible to the public read path forever", async () => {
      const review = await reviews.submitReview(baseReview());
      await reviews.moderateReview(review.id, "rejected");
      expect(await reviews.listPublishedReviewsForProduct("p1")).toEqual([]);
      expect((await reviews.getRatingSummary("p1")).count).toBe(0);
    });

    it("listAllForModeration sees every status regardless of publication state", async () => {
      const a = await reviews.submitReview(baseReview({ authorName: "A" }));
      const b = await reviews.submitReview(baseReview({ authorName: "B" }));
      await reviews.moderateReview(a.id, "published");
      await reviews.moderateReview(b.id, "rejected");
      const all = await reviews.listAllForModeration();
      expect(all).toHaveLength(2);
      expect(all.map((r) => r.status).sort()).toEqual(["published", "rejected"]);
    });

    it("listAllForModeration can filter by a single status", async () => {
      const a = await reviews.submitReview(baseReview());
      await reviews.submitReview(baseReview());
      await reviews.moderateReview(a.id, "published");
      const pending = await reviews.listAllForModeration({ status: "pending" });
      expect(pending).toHaveLength(1);
    });
  });

  describe("moderateReview", () => {
    it("publishing makes a review visible and fires reviews.review.published", async () => {
      const review = await reviews.submitReview(baseReview());
      const published = await reviews.moderateReview(review.id, "published");
      expect(published.status).toBe("published");
      expect(await reviews.listPublishedReviewsForProduct("p1")).toHaveLength(1);
      expect(publishedEvents).toEqual([{ id: review.id, productId: "p1" }]);
    });

    it("throws ReviewNotFoundError for an unknown id", async () => {
      await expect(reviews.moderateReview("missing", "published")).rejects.toThrow(ReviewNotFoundError);
    });
  });

  describe("getRatingSummary", () => {
    it("computes a correct average and full 1-5 distribution across only published reviews", async () => {
      const ratings = [5, 5, 3, 1, 5] as const;
      for (const rating of ratings) {
        const review = await reviews.submitReview(baseReview({ rating }));
        await reviews.moderateReview(review.id, "published");
      }
      // One more, left pending -- must not affect the summary.
      await reviews.submitReview(baseReview({ rating: 2 }));

      const summary = await reviews.getRatingSummary("p1");
      expect(summary.count).toBe(5);
      expect(summary.average).toBeCloseTo((5 + 5 + 3 + 1 + 5) / 5, 5);
      expect(summary.distribution).toEqual({ 1: 1, 2: 0, 3: 1, 4: 0, 5: 3 });
    });

    it("returns average 0 and an all-zero distribution for a product with zero published reviews", async () => {
      const summary = await reviews.getRatingSummary("unreviewed-product");
      expect(summary.average).toBe(0);
      expect(summary.count).toBe(0);
      expect(summary.distribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
    });

    it("never mixes ratings across different productIds", async () => {
      const r1 = await reviews.submitReview(baseReview({ productId: "p1", rating: 1 }));
      const r2 = await reviews.submitReview(baseReview({ productId: "p2", rating: 5 }));
      await reviews.moderateReview(r1.id, "published");
      await reviews.moderateReview(r2.id, "published");
      expect((await reviews.getRatingSummary("p1")).average).toBe(1);
      expect((await reviews.getRatingSummary("p2")).average).toBe(5);
    });
  });
});

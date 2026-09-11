/**
 * "pending" the instant a shopper submits one -- never auto-published.
 * "published" only after a real moderation action (ReviewsService.moderateReview).
 * "rejected" is a terminal, real moderation outcome (e.g. spam, off-topic),
 * kept (not deleted) so the moderation queue has a real audit trail.
 */
export type ReviewStatus = "pending" | "published" | "rejected";

export interface Review {
  id: string;
  productId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  authorName: string;
  title: string;
  body: string;
  /** True only when the submitter's cookie-scoped customerId (see reference-storefront's lib/customer-cookie.ts) has a real "paid" order containing this product -- a real, checkable claim, never a self-reported checkbox. Optional/false for a guest with no matching order. */
  verifiedPurchase: boolean;
  status: ReviewStatus;
  createdAt: string;
}

export interface NewReviewInput {
  productId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  authorName: string;
  title: string;
  body: string;
  verifiedPurchase?: boolean;
}

/** Adapter pattern, as everywhere else in this codebase. */
export interface ReviewRepository {
  get(id: string): Promise<Review | null>;
  listByProduct(productId: string): Promise<Review[]>;
  /** Every review, any status -- the admin moderation queue's read path. */
  listAll(filter?: { status?: ReviewStatus }): Promise<Review[]>;
  save(review: Review): Promise<void>;
}

export interface RatingSummary {
  productId: string;
  /** 0 when count is 0 -- never NaN/undefined for an unreviewed product. */
  average: number;
  count: number;
  /** Count of published reviews at each star rating, always all 5 keys present (0 for a rating with no reviews). */
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
}

export class ReviewNotFoundError extends Error {
  constructor(id: string) {
    super(`Review not found: ${id}`);
    this.name = "ReviewNotFoundError";
  }
}

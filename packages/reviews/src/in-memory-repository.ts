import type { Review, ReviewRepository, ReviewStatus } from "./types.js";

/**
 * Default in-memory ReviewRepository -- Map-backed, structuredClone in/out
 * so callers can never mutate stored state through a returned reference,
 * the same convention as @mercatus-liber/promotions's own in-memory
 * repository.
 */
export function createInMemoryReviewRepository(): ReviewRepository {
  const reviews = new Map<string, Review>();

  return {
    async get(id: string): Promise<Review | null> {
      const review = reviews.get(id);
      return review ? structuredClone(review) : null;
    },
    async listByProduct(productId: string): Promise<Review[]> {
      return Array.from(reviews.values())
        .filter((review) => review.productId === productId)
        .map((review) => structuredClone(review));
    },
    async listAll(filter?: { status?: ReviewStatus }): Promise<Review[]> {
      const all = Array.from(reviews.values());
      const filtered = filter?.status ? all.filter((review) => review.status === filter.status) : all;
      return filtered.map((review) => structuredClone(review));
    },
    async save(review: Review): Promise<void> {
      reviews.set(review.id, structuredClone(review));
    },
  };
}

import type { Pool } from "pg";
import type { Review, ReviewRepository, ReviewStatus } from "@mercatus-liber/reviews";

/**
 * Self-contained DDL for this file only -- deliberately NOT folded into this
 * package's shared schema.ts (see this file's header context: 12 other
 * agents are adding their own self-contained persistence files to this same
 * package concurrently; a later, sequential story wires everyone's DDL/
 * exports into schema.ts/index.ts together, once). Every Review field is a
 * plain scalar (see @mercatus-liber/reviews's types.ts), so this stays real
 * flat columns throughout -- no JSONB needed here, unlike e.g. cart.ts's
 * `items`. createdAt is stored as TEXT, not TIMESTAMPTZ: Review.createdAt is
 * a plain ISO-8601 string (see reviews' types.ts), and this repository's
 * job is to round-trip that string exactly, not to reinterpret it as a
 * driver-native Date.
 */
const REVIEWS_DDL = `
  CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    rating INTEGER NOT NULL,
    author_name TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    verified_purchase BOOLEAN NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
  CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
`;

interface ReviewRow {
  id: string;
  product_id: string;
  rating: number;
  author_name: string;
  title: string;
  body: string;
  verified_purchase: boolean;
  status: ReviewStatus;
  created_at: string;
}

function rowToReview(row: ReviewRow): Review {
  return {
    id: row.id,
    productId: row.product_id,
    rating: row.rating as Review["rating"],
    authorName: row.author_name,
    title: row.title,
    body: row.body,
    verifiedPurchase: row.verified_purchase,
    status: row.status,
    createdAt: row.created_at,
  };
}

/**
 * Real Postgres-backed ReviewRepository -- until now
 * @mercatus-liber/reviews's ReviewRepository was in-memory-only regardless
 * of backend (see in-memory-repository.ts's header comment), so a review
 * never survived a server restart. Matches the in-memory reference
 * implementation's semantics exactly: `listByProduct` returns every status
 * for that product (no implicit status filtering -- the in-memory
 * reference doesn't filter there either, only `listAll`'s explicit
 * `filter.status` does), and `save` is a real upsert so re-saving an
 * existing id (e.g. a pending -> published moderation transition) updates
 * the row in place rather than duplicating it.
 *
 * Runs its own idempotent `CREATE TABLE IF NOT EXISTS` on construction
 * rather than relying on this package's shared schema.ts, per this file's
 * file-isolation requirement. Every method awaits that DDL's completion
 * first, so a repository is safe to use immediately after construction.
 */
export function createPostgresReviewRepository(pool: Pool): ReviewRepository {
  const ready = pool.query(REVIEWS_DDL);

  return {
    async get(id: string): Promise<Review | null> {
      await ready;
      const result = await pool.query<ReviewRow>("SELECT * FROM reviews WHERE id = $1", [id]);
      return result.rows[0] ? rowToReview(result.rows[0]) : null;
    },
    async listByProduct(productId: string): Promise<Review[]> {
      await ready;
      const result = await pool.query<ReviewRow>("SELECT * FROM reviews WHERE product_id = $1", [productId]);
      return result.rows.map(rowToReview);
    },
    async listAll(filter?: { status?: ReviewStatus }): Promise<Review[]> {
      await ready;
      if (filter?.status) {
        const result = await pool.query<ReviewRow>("SELECT * FROM reviews WHERE status = $1", [filter.status]);
        return result.rows.map(rowToReview);
      }
      const result = await pool.query<ReviewRow>("SELECT * FROM reviews");
      return result.rows.map(rowToReview);
    },
    async save(review: Review): Promise<void> {
      await ready;
      await pool.query(
        `INSERT INTO reviews (id, product_id, rating, author_name, title, body, verified_purchase, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           product_id = EXCLUDED.product_id,
           rating = EXCLUDED.rating,
           author_name = EXCLUDED.author_name,
           title = EXCLUDED.title,
           body = EXCLUDED.body,
           verified_purchase = EXCLUDED.verified_purchase,
           status = EXCLUDED.status,
           created_at = EXCLUDED.created_at`,
        [
          review.id,
          review.productId,
          review.rating,
          review.authorName,
          review.title,
          review.body,
          review.verifiedPurchase,
          review.status,
          review.createdAt,
        ],
      );
    },
  };
}

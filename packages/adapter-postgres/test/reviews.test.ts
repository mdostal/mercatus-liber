/**
 * Real, table-backed ReviewRepository coverage (see this package's
 * src/reviews.ts) -- @mercatus-liber/reviews's ReviewRepository was
 * in-memory-only across every adapter, including Postgres, until now. Per
 * this file's isolation requirement, this test defines its OWN local fake
 * `pg` Pool double (not the shared test/fake-pool.ts) -- same style/shape as
 * fake-pool.ts's header comment describes, scoped to exactly the `reviews`
 * table and the fixed set of SQL statements src/reviews.ts issues.
 */
import type { Review } from "@mercatus-liber/reviews";
import { beforeEach, describe, expect, it } from "vitest";
import { createPostgresReviewRepository } from "../src/reviews.js";

interface FakeRow {
  [key: string]: unknown;
}

interface FakePool {
  query<T = FakeRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

function createFakeReviewsPool(): FakePool {
  const reviews = new Map<string, FakeRow>();

  return {
    async query<T = FakeRow>(text: string, values: unknown[] = []): Promise<{ rows: T[] }> {
      const sql = text.trim();

      if (sql.includes("CREATE TABLE") || sql.includes("CREATE INDEX")) {
        return { rows: [] };
      }

      if (sql === "SELECT * FROM reviews WHERE id = $1") {
        const row = reviews.get(values[0] as string);
        return { rows: (row ? [row] : []) as T[] };
      }

      if (sql === "SELECT * FROM reviews WHERE product_id = $1") {
        return { rows: [...reviews.values()].filter((r) => r.product_id === values[0]) as T[] };
      }

      if (sql === "SELECT * FROM reviews WHERE status = $1") {
        return { rows: [...reviews.values()].filter((r) => r.status === values[0]) as T[] };
      }

      if (sql === "SELECT * FROM reviews") {
        return { rows: [...reviews.values()] as T[] };
      }

      if (sql.startsWith("INSERT INTO reviews")) {
        const [id, productId, rating, authorName, title, body, verifiedPurchase, status, createdAt] = values as [
          string,
          string,
          number,
          string,
          string,
          string,
          boolean,
          string,
          string,
        ];
        reviews.set(id, {
          id,
          product_id: productId,
          rating,
          author_name: authorName,
          title,
          body,
          verified_purchase: verifiedPurchase,
          status,
          created_at: createdAt,
        });
        return { rows: [] };
      }

      throw new Error(`FakeReviewsPool: unrecognized query -- ${sql}`);
    },
  };
}

describe("createPostgresReviewRepository", () => {
  let pool: FakePool;
  let reviews: ReturnType<typeof createPostgresReviewRepository>;

  beforeEach(() => {
    pool = createFakeReviewsPool();
    reviews = createPostgresReviewRepository(pool as never);
  });

  const pendingReview: Review = {
    id: "r1",
    productId: "p1",
    rating: 5,
    authorName: "Alice",
    title: "Great product",
    body: "Really happy with this purchase.",
    verifiedPurchase: true,
    status: "pending",
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("returns null for a missing review", async () => {
    expect(await reviews.get("missing")).toBeNull();
  });

  it("saves and retrieves a review by id (round-trip)", async () => {
    await reviews.save(pendingReview);
    expect(await reviews.get("r1")).toEqual(pendingReview);
  });

  it("listByProduct returns only that product's reviews, across every status, matching the in-memory reference", async () => {
    await reviews.save(pendingReview);
    await reviews.save({ ...pendingReview, id: "r2", status: "published" });
    await reviews.save({ ...pendingReview, id: "r3", status: "rejected" });
    await reviews.save({ ...pendingReview, id: "r4", productId: "p2" });

    const found = await reviews.listByProduct("p1");
    expect(found).toHaveLength(3);
    expect(found.map((r) => r.id).sort()).toEqual(["r1", "r2", "r3"]);
    expect(found.map((r) => r.status).sort()).toEqual(["pending", "published", "rejected"]);
  });

  it("listByProduct returns an empty array for a product with no reviews", async () => {
    expect(await reviews.listByProduct("no-such-product")).toEqual([]);
  });

  it("listAll with no filter returns every review, any status", async () => {
    await reviews.save(pendingReview);
    await reviews.save({ ...pendingReview, id: "r2", productId: "p2", status: "published" });
    await reviews.save({ ...pendingReview, id: "r3", productId: "p3", status: "rejected" });

    const found = await reviews.listAll();
    expect(found).toHaveLength(3);
  });

  it("listAll with a status filter returns only reviews at that status", async () => {
    await reviews.save(pendingReview);
    await reviews.save({ ...pendingReview, id: "r2", productId: "p2", status: "published" });
    await reviews.save({ ...pendingReview, id: "r3", productId: "p3", status: "published" });

    const published = await reviews.listAll({ status: "published" });
    expect(published).toHaveLength(2);
    expect(published.map((r) => r.id).sort()).toEqual(["r2", "r3"]);

    const rejected = await reviews.listAll({ status: "rejected" });
    expect(rejected).toEqual([]);
  });

  it("a real pending -> published status transition via re-save (upsert, not a duplicate row)", async () => {
    await reviews.save(pendingReview);
    await reviews.save({ ...pendingReview, status: "published" });

    const found = await reviews.get("r1");
    expect(found?.status).toBe("published");
    expect(await reviews.listAll()).toHaveLength(1);
  });
});

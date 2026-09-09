/**
 * backup-restore-01: the real-Postgres half of the DATABASE_URL acceptance
 * criterion ("Given DATABASE_URL set to a real reachable Postgres
 * connection string, then services.ts constructs a real Postgres-backed
 * persistence adapter, verified by a real query against it").
 *
 * Unlike persistence-wiring.test.ts (which mocks createPostgresAdapter,
 * matching this repo's usual "no real Postgres in the ordinary test suite"
 * convention -- see packages/adapter-postgres/test/fake-pool.ts's header
 * comment), this file runs lib/services.ts completely unmocked against a
 * REAL, reachable Postgres instance.
 *
 * Skipped unless LIVE_POSTGRES_URL is set to a reachable Postgres
 * connection string, so it never runs (or requires Postgres) in the
 * ordinary `pnpm test`/CI path -- there is no Postgres service available
 * there, matching the rest of this repo. To run it for real against a
 * throwaway local Postgres (requires Docker):
 *
 *   docker run --rm -d --name ml-pg-verify -e POSTGRES_PASSWORD=postgres \
 *     -p 55432:5432 postgres:16
 *   LIVE_POSTGRES_URL=postgres://postgres:postgres@localhost:55432/postgres \
 *     pnpm --filter @mercatus-liber/reference-storefront exec vitest run \
 *     test/persistence-postgres-live.test.ts
 *   docker stop ml-pg-verify
 */
import { Pool } from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";

const LIVE_POSTGRES_URL = process.env.LIVE_POSTGRES_URL;

describe.skipIf(!LIVE_POSTGRES_URL)(
  "Persistence wiring against a real, reachable Postgres instance (DATABASE_URL)",
  () => {
    afterAll(async () => {
      if (!LIVE_POSTGRES_URL) return;
      // Clean up so repeated runs against the same long-lived instance start fresh.
      const pool = new Pool({ connectionString: LIVE_POSTGRES_URL });
      await pool.query("DROP TABLE IF EXISTS product_attributes, skus, products CASCADE");
      await pool.end();
    });

    it("constructs a real Postgres-backed persistence adapter, and the seeded demo catalog is genuinely queryable through it", async () => {
      vi.stubEnv("DATABASE_URL", LIVE_POSTGRES_URL);
      vi.stubEnv("SQLITE_FILE_PATH", "");
      vi.resetModules();

      const { getServicesForDemo } = await import("../lib/services.js");
      const services = await getServicesForDemo("print-shop");

      const products = await services.catalog.listProducts();
      expect(products.length).toBeGreaterThan(0);

      // Independent verification: query Postgres directly with a
      // brand-new pool/connection that has nothing to do with services.ts,
      // to prove the seeded data really landed in real Postgres tables.
      const verifyPool = new Pool({ connectionString: LIVE_POSTGRES_URL });
      try {
        const result = await verifyPool.query<{ count: number }>("SELECT count(*)::int AS count FROM products");
        expect(result.rows[0]?.count).toBe(products.length);

        const first = products[0]!;
        const row = await verifyPool.query("SELECT slug, title FROM products WHERE id = $1", [first.id]);
        expect(row.rows[0]?.slug).toBe(first.slug);
        expect(row.rows[0]?.title).toBe(first.title);
      } finally {
        await verifyPool.end();
      }

      vi.unstubAllEnvs();
    });
  },
);

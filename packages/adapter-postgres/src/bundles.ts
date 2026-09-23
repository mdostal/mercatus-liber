import type { Pool } from "pg";
import type { Bundle, BundleRepository, BundleStatus, BundleTier } from "@mercatus-liber/bundles";

/**
 * Self-contained schema for the bundles persistence surface. Run at
 * createPostgresBundleRepository call time, same "own schema-init, no
 * shared-file edits" pattern this package's orders.ts already established
 * (see that file's header comment) -- bundles is not part of schema.ts's
 * SCHEMA_SQL.
 *
 * `tiers` stores the full BundleTier[] as one JSONB column rather than a
 * separate tiers table -- there's no real independent query need beyond
 * "give me this bundle's tiers" (see this package's task brief), and it
 * mirrors how products.identifying_attribute_keys already stores an array
 * as JSONB in this same package.
 */
const BUNDLES_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS bundles (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  title TEXT NOT NULL,
  tiers JSONB NOT NULL,
  status TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bundles_product_id ON bundles(product_id);
-- commerce-gap-audit-3 finding 13: bundles had no demo-scoping concept at
-- all, so under the shared Postgres backend print-shop and Northline Home
-- Tech both resolve to, print-shop's own /admin/bundles list mixed in
-- Northline's bundles too -- same bug class/fix shape as
-- service_areas.demo_slug (commerce-gap-audit-3 findings 1-3) and
-- categories.demo_slug (epic 61)/pages.demo_slug (epic 60) before it.
-- Optional/additive: ADD COLUMN IF NOT EXISTS is safe against the
-- already-live production "bundles" table.
ALTER TABLE bundles ADD COLUMN IF NOT EXISTS demo_slug TEXT;
CREATE INDEX IF NOT EXISTS idx_bundles_demo_slug ON bundles(demo_slug);
`;

interface BundleRow {
  id: string;
  product_id: string;
  title: string;
  tiers: BundleTier[]; // JSONB -- already parsed by the pg driver
  status: string;
  demo_slug: string | null;
}

function rowToBundle(row: BundleRow): Bundle {
  return {
    id: row.id,
    productId: row.product_id,
    title: row.title,
    tiers: row.tiers,
    status: row.status as BundleStatus,
    ...(row.demo_slug ? { demoSlug: row.demo_slug } : {}),
  };
}

/**
 * Real Postgres-backed BundleRepository -- until now
 * apps/reference-storefront/lib/services.ts always constructed
 * createInMemoryBundleRepository() regardless of backend, so every curated
 * tiered-bundle offer was lost on restart. Runs its own schema-init
 * (BUNDLES_SCHEMA_SQL above) rather than folding into this package's shared
 * schema.ts, per this package's orders.ts "own schema, no shared-file edits"
 * precedent.
 */
export function createPostgresBundleRepository(pool: Pool): BundleRepository {
  const schemaReady = pool.query(BUNDLES_SCHEMA_SQL).then(() => undefined);

  return {
    async get(id: string): Promise<Bundle | null> {
      await schemaReady;
      const result = await pool.query<BundleRow>("SELECT * FROM bundles WHERE id = $1", [id]);
      return result.rows[0] ? rowToBundle(result.rows[0]) : null;
    },

    async list(filter?: { demoSlug?: string }): Promise<Bundle[]> {
      await schemaReady;
      const result = filter?.demoSlug
        ? await pool.query<BundleRow>("SELECT * FROM bundles WHERE demo_slug = $1", [filter.demoSlug])
        : await pool.query<BundleRow>("SELECT * FROM bundles");
      return result.rows.map(rowToBundle);
    },

    async save(bundle: Bundle): Promise<void> {
      await schemaReady;
      await pool.query(
        `INSERT INTO bundles (id, product_id, title, tiers, status, demo_slug)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           product_id = EXCLUDED.product_id,
           title = EXCLUDED.title,
           tiers = EXCLUDED.tiers,
           status = EXCLUDED.status,
           demo_slug = EXCLUDED.demo_slug`,
        [bundle.id, bundle.productId, bundle.title, JSON.stringify(bundle.tiers), bundle.status, bundle.demoSlug ?? null],
      );
    },
  };
}

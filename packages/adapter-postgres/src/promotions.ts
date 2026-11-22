import type { Pool } from "pg";
import type { Money } from "@mercatus-liber/core";
import type { AppliedPromotionStore, Promotion, PromotionRepository } from "@mercatus-liber/promotions";

/**
 * Self-contained DDL for this file only -- deliberately NOT folded into this
 * package's shared schema.ts (see cart.ts's/reviews.ts's header comments:
 * multiple agents are adding their own self-contained persistence files to
 * this same package concurrently; a later, sequential story wires everyone's
 * DDL/exports into schema.ts/index.ts together, once). `targetSkuIds` (a
 * string array) and `minCartAmount` (a nullable Money object) have no
 * natural flat-column mapping worth the join/complexity, so -- mirroring
 * this package's own precedent for storing a JS array/object as JSONB via
 * the `pg` driver (see index.ts's `products` table:
 * identifying_attribute_keys/images, and cart.ts's `items`) -- both are
 * stored as JSONB columns, serialized with JSON.stringify on the way in and
 * auto-parsed back into a JS value by the driver on the way out.
 */
const PROMOTIONS_DDL = `
  CREATE TABLE IF NOT EXISTS promotions (
    id TEXT PRIMARY KEY,
    code TEXT,
    kind TEXT NOT NULL,
    scope TEXT NOT NULL,
    value NUMERIC NOT NULL,
    currency TEXT NOT NULL,
    target_sku_ids JSONB NOT NULL,
    min_cart_amount JSONB,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    usage_limit INTEGER,
    redemption_count INTEGER NOT NULL,
    status TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_promotions_code ON promotions(code);
  -- commerce-gap-audit-3: promotions had no demo-scoping concept at all, so
  -- under the shared Postgres backend print-shop and Northline Home Tech
  -- both resolve to, either demo's coupon code was genuinely redeemable at
  -- the OTHER demo's checkout -- same bug class/fix shape as
  -- categories.demo_slug (epic 61) and pages.demo_slug (epic 60). Optional/
  -- additive: ADD COLUMN IF NOT EXISTS is safe against the already-live
  -- production "promotions" table.
  ALTER TABLE promotions ADD COLUMN IF NOT EXISTS demo_slug TEXT;
  CREATE INDEX IF NOT EXISTS idx_promotions_demo_slug ON promotions(demo_slug);
  -- scheduled-lines epic: lines or categories a product-scope promotion covers.
  ALTER TABLE promotions ADD COLUMN IF NOT EXISTS target_collection_ids JSONB;
  -- Which promotion each unpaid order used, until it's paid (counted then).
  CREATE TABLE IF NOT EXISTS promotion_applications (
    order_id TEXT PRIMARY KEY,
    promotion_id TEXT NOT NULL,
    discount_amount JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
`;

interface PromotionRow {
  id: string;
  code: string | null;
  kind: string;
  scope: string;
  // NUMERIC comes back from node-postgres as a string, not a number, to
  // avoid silent precision loss -- must be parsed back into a JS number.
  value: string;
  currency: string;
  target_sku_ids: string[]; // JSONB -- already parsed by the pg driver
  min_cart_amount: Money | null; // JSONB
  // TIMESTAMPTZ comes back from node-postgres as a Date, not a string --
  // must be re-serialized to the ISO 8601 string Promotion.startsAt/endsAt
  // expect.
  starts_at: Date | null;
  ends_at: Date | null;
  usage_limit: number | null;
  redemption_count: number;
  status: string;
  demo_slug: string | null;
  target_collection_ids?: string[] | null;
}

function toIsoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function rowToPromotion(row: PromotionRow): Promotion {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind as Promotion["kind"],
    scope: row.scope as Promotion["scope"],
    value: Number(row.value),
    currency: row.currency,
    targetSkuIds: row.target_sku_ids,
    minCartAmount: row.min_cart_amount,
    startsAt: toIsoOrNull(row.starts_at),
    endsAt: toIsoOrNull(row.ends_at),
    usageLimit: row.usage_limit,
    redemptionCount: row.redemption_count,
    status: row.status as Promotion["status"],
    ...(row.demo_slug ? { demoSlug: row.demo_slug } : {}),
    ...(row.target_collection_ids?.length ? { targetCollectionIds: row.target_collection_ids } : {}),
  };
}

/**
 * Real Postgres-backed PromotionRepository -- until now
 * @mercatus-liber/promotions's PromotionRepository was in-memory-only
 * regardless of backend (see that package's in-memory-repository.ts header
 * comment), so a real coupon code, its redemption count, and its
 * active/inactive status never survived a server restart.
 *
 * Runs its own idempotent `CREATE TABLE IF NOT EXISTS` on construction
 * rather than relying on this package's shared schema.ts, per this file's
 * file-isolation requirement. `get`/`list`/`save` each await that DDL's
 * completion first, so a repository is safe to use immediately after
 * construction.
 */
export function createPostgresPromotionRepository(pool: Pool): PromotionRepository {
  const ready = pool.query(PROMOTIONS_DDL);

  return {
    async get(id: string): Promise<Promotion | null> {
      await ready;
      const result = await pool.query<PromotionRow>("SELECT * FROM promotions WHERE id = $1", [id]);
      return result.rows[0] ? rowToPromotion(result.rows[0]) : null;
    },
    async list(filter?: { demoSlug?: string }): Promise<Promotion[]> {
      await ready;
      const result = filter?.demoSlug
        ? await pool.query<PromotionRow>("SELECT * FROM promotions WHERE demo_slug = $1", [filter.demoSlug])
        : await pool.query<PromotionRow>("SELECT * FROM promotions");
      return result.rows.map(rowToPromotion);
    },
    async incrementRedemptions(id: string): Promise<void> {
      await ready;
      await pool.query("UPDATE promotions SET redemption_count = redemption_count + 1 WHERE id = $1", [id]);
    },
    async save(promotion: Promotion): Promise<void> {
      await ready;
      await pool.query(
        `INSERT INTO promotions (
           id, code, kind, scope, value, currency, target_sku_ids, min_cart_amount,
           starts_at, ends_at, usage_limit, redemption_count, status, demo_slug, target_collection_ids
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (id) DO UPDATE SET
           code = EXCLUDED.code,
           kind = EXCLUDED.kind,
           scope = EXCLUDED.scope,
           value = EXCLUDED.value,
           currency = EXCLUDED.currency,
           target_sku_ids = EXCLUDED.target_sku_ids,
           min_cart_amount = EXCLUDED.min_cart_amount,
           starts_at = EXCLUDED.starts_at,
           ends_at = EXCLUDED.ends_at,
           usage_limit = EXCLUDED.usage_limit,
           redemption_count = EXCLUDED.redemption_count,
           status = EXCLUDED.status,
           demo_slug = EXCLUDED.demo_slug,
           target_collection_ids = EXCLUDED.target_collection_ids`,
        [
          promotion.id,
          promotion.code,
          promotion.kind,
          promotion.scope,
          promotion.value,
          promotion.currency,
          JSON.stringify(promotion.targetSkuIds),
          promotion.minCartAmount ? JSON.stringify(promotion.minCartAmount) : null,
          promotion.startsAt,
          promotion.endsAt,
          promotion.usageLimit,
          promotion.redemptionCount,
          promotion.status,
          promotion.demoSlug ?? null,
          promotion.targetCollectionIds?.length ? JSON.stringify(promotion.targetCollectionIds) : null,
        ],
      );
    },
  };
}

/**
 * Postgres AppliedPromotionStore (@mercatus-liber/promotions): applied
 * promotions shared by every server instance. `take` is one DELETE ...
 * RETURNING, so the paid event that finds a record is the only one that does.
 */
export function createPostgresAppliedPromotionStore(pool: Pool): AppliedPromotionStore {
  const ready = pool.query(PROMOTIONS_DDL);
  return {
    async save(application) {
      await ready;
      await pool.query(
        `INSERT INTO promotion_applications (order_id, promotion_id, discount_amount) VALUES ($1, $2, $3)
         ON CONFLICT (order_id) DO UPDATE SET promotion_id = EXCLUDED.promotion_id, discount_amount = EXCLUDED.discount_amount`,
        [application.orderId, application.promotionId, JSON.stringify(application.discountAmount)],
      );
    },
    async take(orderId) {
      await ready;
      const result = await pool.query<{ order_id: string; promotion_id: string; discount_amount: { amount: number; currency: string } }>(
        "DELETE FROM promotion_applications WHERE order_id = $1 RETURNING order_id, promotion_id, discount_amount",
        [orderId],
      );
      const row = result.rows[0];
      return row ? { orderId: row.order_id, promotionId: row.promotion_id, discountAmount: row.discount_amount } : null;
    },
  };
}

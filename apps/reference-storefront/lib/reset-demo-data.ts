import { Pool, type PoolClient } from "pg";
import { demoEnvPrefix, evictServicesForDemo, getServicesForDemo, resolveDemoPersistenceEnv } from "./services";
import type { DemoSlug } from "./demos";

/**
 * data-reset-and-safety epic: the real, live-database-safe implementation
 * behind `resetDemoDataAction` (lib/actions.ts). See
 * .pHive/epics/data-reset-and-safety/docs/design-discussion.md §2d for the
 * design this follows -- "reset one demo back to its canonical seeded
 * state" -- and this module's own header below for the single highest-risk
 * property it exists to protect: all 3 demo stores share ONE live Postgres
 * database today (confirmed by this epic's own audit -- see
 * idempotent-seed.ts's header comment, which already documents that every
 * product/category/campaign slug had to be checked for global uniqueness
 * across all 3 stores precisely because they share one database), so every
 * DELETE issued here MUST be provably scoped to exactly one demo's own
 * rows, never a bare `DELETE FROM table`.
 *
 * ---------------------------------------------------------------------
 * SCOPING AUDIT (read this before changing any query below)
 * ---------------------------------------------------------------------
 * Two real cases exist, resolved per call via `resolveDemoPersistenceEnv`
 * (per-demo-backend-diversity epic) and `demoEnvPrefix`:
 *
 * Case A -- a demo has its OWN dedicated `<PREFIX>_DATABASE_URL` (e.g.
 * `NORTHLINE_DATABASE_URL`): that whole Postgres database is exclusively
 * this demo's data, so every table can be truncated unscoped, safely.
 * Not exercised by any of the 3 demos in this repo's real deployment today
 * (confirmed: no per-demo `<PREFIX>_DATABASE_URL` is set for print-shop,
 * northline, or broadleaf -- all 3 fall through to the shared global
 * `DATABASE_URL`), but implemented for real so a future deployment that
 * does give one demo its own database gets a real, safe, unscoped reset
 * rather than an unnecessarily-slow scoped one.
 *
 * Case B -- the real, live, default case for all 3 demos today: they share
 * ONE Postgres database/connection string. Every table this epic can
 * reach falls into one of three buckets:
 *
 *  1. Directly demo-scoped (has its own `demo_slug` column):
 *     - storefront_views
 *
 *  2. Transitively scoped via this demo's own Catalog row (see
 *     `getCatalogBySlug`/`DEMO_CATALOG_SLUG` below) -> its product ids ->
 *     its SKU ids, walking the real relationships the design doc calls
 *     for:
 *     - product_attributes, skus (product_id)
 *     - reviews, bundles (product_id)
 *     - recommendation_rules (source_product_id)
 *     - fulfillment_routing (sku_id)
 *     - cart_items (sku_id), then `carts` rows themselves ONLY once every
 *       one of their items has been deleted as part of this scoped pass
 *       (a real safety net: a cart that had even one item from ANOTHER
 *       demo keeps its row, since it still has remaining items after this
 *       demo's items are removed)
 *     - orders, scoped by requiring EVERY line item's skuId to be in this
 *       demo's own SKU set (an order with even one line from another demo
 *       is left untouched -- shouldn't structurally happen given each cart
 *       only ever adds SKUs from its own demo's catalog, but this is a
 *       real safety net, not an assumption)
 *     - customer_profiles, scoped to exactly the customerIds referenced by
 *       the orders just deleted above, AND ONLY those customerIds with no
 *       remaining order (from any other demo) still referencing them
 *     - categories / product_category_assignments, and service_areas /
 *       service_area_product_assignments: each pair uses the same
 *       "delete this demo's assignment rows first, then delete the parent
 *       entity row ONLY if it now has zero remaining assignment rows"
 *       orphan-safety pattern -- a category/service-area still assigned to
 *       another demo's product keeps its row.
 *     - product_catalog_assignments (catalog_id), products (id, via those
 *       assignments), catalogs (the one row itself, last)
 *
 *  3. A REAL, DOCUMENTED GAP -- rows this schema genuinely cannot
 *     unambiguously scope to one demo today, so this module does NOT
 *     delete them, ever, rather than risk cross-demo damage:
 *     - `promotions` rows with an EMPTY `target_sku_ids` (i.e.
 *       `scope: "cart"`, a whole-cart discount) -- confirmed live in this
 *       session's own seed-data audit: every one of the 3 demos' main
 *       coupon-code promotions (PROMO_CODE / NORTHLINE_PROMO_CODE /
 *       BLOOM_PROMO_CODE) is exactly this shape. Only a `scope: "product"`
 *       promotion with a non-empty `target_sku_ids` fully contained in
 *       this demo's own SKU set is scoped and deleted here.
 *     - `campaigns` (advertising) rows whose `targeting` has no
 *       `serviceAreaId` AND no way to independently verify a `pageSlug`
 *       against a persisted table (CMS pages are never Postgres-persisted
 *       in this app -- see lib/services.ts's `cmsPersistence` branch).
 *       Confirmed live: every one of the 3 demos' main campaigns
 *       ("Print Shop Sale", "Northline Fall Install Special",
 *       "Broadleaf Bloom Sale") targets `{ serviceAreaId: null,
 *       pageSlug: null }` -- completely unscopable today. Only a campaign
 *       whose `targeting.serviceAreaId` matches one of THIS demo's own
 *       (already-scoped, per bucket 2 above) service area ids is deleted
 *       here.
 *     - `bi_events` (internal-bi) -- `payload` is an arbitrary
 *       `Record<string, unknown>` whose shape varies per `eventType` with
 *       no schema-guaranteed key naming a demo, order, or SKU id
 *       reliably; heuristically parsing it would be exactly the kind of
 *       risky, unverified delete this epic's design doc explicitly warns
 *       against. Left untouched, always, for every demo's reset.
 *
 * A demo that has never been seeded yet (no `catalogs` row for its known
 * catalog slug) short-circuits to a no-op scoped pass (every scoped
 * delete's id list is empty) plus the always-safe `storefront_views`
 * delete and the cache eviction -- never an error.
 *
 * REAL, LIVE-DATABASE FINDING from this feature's own verification pass
 * (see this epic's final report): `resetDemoData` calls
 * `await getServicesForDemo(demoSlug)` first (see that call's own doc
 * comment below for why), which -- ONLY on a genuine cold start (this
 * demo's service graph wasn't already warm) -- re-runs that demo's whole
 * seed function before this module's own scoped delete ever runs. Two of
 * that seed function's calls (`reviews.submitReview`, a rule-creation call
 * in advertising/recommendations seeding) are NOT idempotent the way
 * upsertProduct/upsertCategory/upsertCatalog/upsertServiceArea/
 * upsertStorefrontView are -- a genuine cold start can therefore briefly
 * create a duplicate set of reviews/recommendation rules for this demo
 * moments before this function deletes them again. Confirmed harmless to
 * the FINAL state (every such duplicate is still correctly demo-scoped, so
 * it's captured and removed by this same pass -- see the real live-database
 * proof in this epic's final report, where northline ended at exactly 0
 * leftover rows across every scoped table despite this), just wasted work
 * on a cold reset. In the realistic admin-UI calling path this is normally
 * a non-issue: an operator reaching this page has almost always already
 * warmed this demo's service graph by navigating other admin pages first,
 * so `getServicesForDemo` here just returns the already-resolved promise.
 * Not fixed here (a pre-existing, orthogonal seed-idempotency gap in
 * reviews/recommendations/bundles/promotions/campaigns seeding, affecting
 * every real serverless cold start too, not just this feature) -- flagged
 * for a future pass rather than expanding this epic's scope.
 */

/**
 * The real catalog slug each demo's own seed file passes to `upsertCatalog`
 * (see lib/seed.ts, lib/seed-northline.ts, lib/seed-broadleaf.ts's own
 * `seedRealCatalog`/equivalent functions) -- the one stable, already-unique
 * identifier this module can use to find "this demo's own Catalog row"
 * among the shared `catalogs` table, per the design doc's own "found via
 * that demo's own Catalog record (found via getCatalogBySlug)" instruction.
 * Kept as an explicit, reviewable map here (not derived at runtime) so a
 * drift between this map and a seed file's real slug fails safe: a demo
 * whose slug doesn't match anything in `catalogs` just resolves to "nothing
 * to scope-delete" (see the module doc comment above), never a wrong match.
 */
const DEMO_CATALOG_SLUG: Record<DemoSlug, string> = {
  "print-shop": "the-print-shop",
  northline: "northline-home-tech",
  broadleaf: "broadleaf-and-co",
};

/** Every table this epic (full-commerce-persistence-audit) plus the Catalog entity's own 2 tables added, in FK-safe delete order for Case A's unscoped per-database truncate. */
const ALL_OWNED_TABLES = [
  "product_attributes",
  "skus",
  "reviews",
  "bundles",
  "recommendation_rules",
  "fulfillment_routing",
  "cart_items",
  "carts",
  "orders",
  "customer_profiles",
  "promotions",
  "campaigns",
  "storefront_views",
  "product_category_assignments",
  "categories",
  "service_area_product_assignments",
  "service_areas",
  "product_catalog_assignments",
  "products",
  "catalogs",
  "bi_events",
] as const;

export interface ResetDemoDataResult {
  demoSlug: DemoSlug;
  mode: "dedicated-database-truncate" | "shared-database-scoped-delete" | "non-postgres-cache-only";
  /** Real row counts actually deleted per table, only present for Postgres modes. */
  deletedCounts: Record<string, number>;
  /** Table names deliberately left untouched this pass, with a short reason -- see this module's header comment for the full audit. */
  skippedTables: { table: string; reason: string }[];
}

async function withTransaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Row-count helper -- every DELETE below is issued with a real WHERE scoping clause, never bare `DELETE FROM table`. */
async function deleteScoped(client: PoolClient, sql: string, params: unknown[]): Promise<number> {
  const result = await client.query(sql, params);
  return result.rowCount ?? 0;
}

interface OrderRowForScoping {
  id: string;
  customer_id: string | null;
  items: { skuId: string }[];
}

interface PromotionRowForScoping {
  id: string;
  target_sku_ids: string[];
}

interface CampaignRowForScoping {
  id: string;
  targeting: { serviceAreaId: string | null; pageSlug: string | null };
}

/**
 * Case B -- the real, live shape today. Runs entirely inside ONE
 * transaction on ONE checked-out client (see cart.ts's own `withTransaction`
 * precedent in @mercatus-liber/adapter-postgres, mirrored here): either
 * every scoped delete for this demo commits together, or none of them do.
 */
async function scopedDeleteForDemo(pool: Pool, demoSlug: DemoSlug): Promise<ResetDemoDataResult> {
  const deletedCounts: Record<string, number> = {};
  const skippedTables: ResetDemoDataResult["skippedTables"] = [];

  await withTransaction(pool, async (client) => {
    const catalogSlug = DEMO_CATALOG_SLUG[demoSlug];
    const catalogResult = await client.query<{ id: string }>("SELECT id FROM catalogs WHERE slug = $1", [
      catalogSlug,
    ]);
    const catalogId = catalogResult.rows[0]?.id ?? null;

    let productIds: string[] = [];
    if (catalogId) {
      const productsResult = await client.query<{ product_id: string }>(
        "SELECT product_id FROM product_catalog_assignments WHERE catalog_id = $1",
        [catalogId],
      );
      productIds = productsResult.rows.map((row) => row.product_id);
    }

    let skuIds: string[] = [];
    if (productIds.length > 0) {
      const skusResult = await client.query<{ id: string }>("SELECT id FROM skus WHERE product_id = ANY($1::text[])", [
        productIds,
      ]);
      skuIds = skusResult.rows.map((row) => row.id);
    }

    // -- product_attributes, skus, reviews, bundles, recommendation_rules --
    // directly scoped via product_id/source_product_id, no orphan-safety
    // join needed (these columns are NOT NULL and always identify a real
    // product this demo's own product-id set already unambiguously owns).
    deletedCounts.product_attributes = await deleteScoped(
      client,
      "DELETE FROM product_attributes WHERE product_id = ANY($1::text[])",
      [productIds],
    );
    deletedCounts.skus = await deleteScoped(client, "DELETE FROM skus WHERE product_id = ANY($1::text[])", [
      productIds,
    ]);
    deletedCounts.reviews = await deleteScoped(client, "DELETE FROM reviews WHERE product_id = ANY($1::text[])", [
      productIds,
    ]);
    deletedCounts.bundles = await deleteScoped(client, "DELETE FROM bundles WHERE product_id = ANY($1::text[])", [
      productIds,
    ]);
    deletedCounts.recommendation_rules = await deleteScoped(
      client,
      "DELETE FROM recommendation_rules WHERE source_product_id = ANY($1::text[])",
      [productIds],
    );
    deletedCounts.fulfillment_routing = await deleteScoped(
      client,
      "DELETE FROM fulfillment_routing WHERE sku_id = ANY($1::text[])",
      [skuIds],
    );

    // -- cart_items / carts -- scoped via sku_id, then a real safety-netted
    // parent-row delete: only a cart with ZERO remaining items (every item
    // it ever had belonged to this demo) gets its own `carts` row removed.
    const cartCandidatesResult = await client.query<{ cart_id: string }>(
      "SELECT DISTINCT cart_id FROM cart_items WHERE sku_id = ANY($1::text[])",
      [skuIds],
    );
    const cartCandidateIds = cartCandidatesResult.rows.map((row) => row.cart_id);
    deletedCounts.cart_items = await deleteScoped(client, "DELETE FROM cart_items WHERE sku_id = ANY($1::text[])", [
      skuIds,
    ]);
    deletedCounts.carts = await deleteScoped(
      client,
      `DELETE FROM carts WHERE id = ANY($1::text[])
         AND NOT EXISTS (SELECT 1 FROM cart_items WHERE cart_items.cart_id = carts.id)`,
      [cartCandidateIds],
    );

    // -- orders -- scoped by requiring EVERY line item's skuId to already be
    // in this demo's own SKU set (a real safety net against a mixed order,
    // which shouldn't structurally happen but is never assumed away here).
    const skuIdSet = new Set(skuIds);
    const ordersResult = await client.query<OrderRowForScoping>("SELECT id, customer_id, items FROM orders");
    const scopedOrderIds: string[] = [];
    const referencedCustomerIds = new Set<string>();
    for (const row of ordersResult.rows) {
      if (row.items.length === 0) continue;
      const allInScope = row.items.every((item) => skuIdSet.has(item.skuId));
      if (!allInScope) continue;
      scopedOrderIds.push(row.id);
      if (row.customer_id) referencedCustomerIds.add(row.customer_id);
    }
    deletedCounts.orders = await deleteScoped(client, "DELETE FROM orders WHERE id = ANY($1::text[])", [
      scopedOrderIds,
    ]);

    // -- customer_profiles -- only the customerIds referenced by the orders
    // just deleted, AND only those with no remaining order (from any OTHER
    // demo) still referencing them.
    let customerIdsToDelete: string[] = [];
    if (referencedCustomerIds.size > 0) {
      const stillReferencedResult = await client.query<{ customer_id: string }>(
        "SELECT DISTINCT customer_id FROM orders WHERE customer_id = ANY($1::text[])",
        [[...referencedCustomerIds]],
      );
      const stillReferenced = new Set(stillReferencedResult.rows.map((row) => row.customer_id));
      customerIdsToDelete = [...referencedCustomerIds].filter((id) => !stillReferenced.has(id));
    }
    deletedCounts.customer_profiles = await deleteScoped(
      client,
      "DELETE FROM customer_profiles WHERE id = ANY($1::text[])",
      [customerIdsToDelete],
    );

    // -- promotions -- ONLY rows with a non-empty target_sku_ids fully
    // contained in this demo's SKU set. Cart-scope (empty target_sku_ids)
    // promotions are a documented gap -- see this module's header comment.
    const promotionsResult = await client.query<PromotionRowForScoping>(
      "SELECT id, target_sku_ids FROM promotions",
    );
    const scopedPromotionIds = promotionsResult.rows
      .filter((row) => row.target_sku_ids.length > 0 && row.target_sku_ids.every((id) => skuIdSet.has(id)))
      .map((row) => row.id);
    const unscopedPromotionCount = promotionsResult.rows.length - scopedPromotionIds.length;
    deletedCounts.promotions = await deleteScoped(client, "DELETE FROM promotions WHERE id = ANY($1::text[])", [
      scopedPromotionIds,
    ]);
    if (unscopedPromotionCount > 0) {
      skippedTables.push({
        table: "promotions (cart-scope, empty target_sku_ids rows only)",
        reason:
          `${unscopedPromotionCount} promotion row(s) globally have no target_sku_ids (cart-wide discounts) and ` +
          "cannot be unambiguously attributed to one demo under the current schema -- left untouched.",
      });
    }

    // -- categories / product_category_assignments -- orphan-safety pattern.
    const categoryCandidatesResult = await client.query<{ category_id: string }>(
      "SELECT DISTINCT category_id FROM product_category_assignments WHERE product_id = ANY($1::text[])",
      [productIds],
    );
    const categoryCandidateIds = categoryCandidatesResult.rows.map((row) => row.category_id);
    deletedCounts.product_category_assignments = await deleteScoped(
      client,
      "DELETE FROM product_category_assignments WHERE product_id = ANY($1::text[])",
      [productIds],
    );
    deletedCounts.categories = await deleteScoped(
      client,
      `DELETE FROM categories WHERE id = ANY($1::text[])
         AND NOT EXISTS (
           SELECT 1 FROM product_category_assignments
           WHERE product_category_assignments.category_id = categories.id
         )`,
      [categoryCandidateIds],
    );

    // -- service_areas / service_area_product_assignments -- same
    // orphan-safety pattern as categories above.
    const serviceAreaCandidatesResult = await client.query<{ service_area_id: string }>(
      "SELECT DISTINCT service_area_id FROM service_area_product_assignments WHERE product_id = ANY($1::text[])",
      [productIds],
    );
    const serviceAreaCandidateIds = serviceAreaCandidatesResult.rows.map((row) => row.service_area_id);
    deletedCounts.service_area_product_assignments = await deleteScoped(
      client,
      "DELETE FROM service_area_product_assignments WHERE product_id = ANY($1::text[])",
      [productIds],
    );
    // Determine which candidates are ACTUALLY deleted (fully orphaned) --
    // needed below so campaigns targeting one of them can be scoped too.
    const stillAssignedResult = await client.query<{ service_area_id: string }>(
      `SELECT DISTINCT service_area_id FROM service_area_product_assignments
         WHERE service_area_id = ANY($1::text[])`,
      [serviceAreaCandidateIds],
    );
    const stillAssignedServiceAreaIds = new Set(stillAssignedResult.rows.map((row) => row.service_area_id));
    const deletedServiceAreaIds = serviceAreaCandidateIds.filter((id) => !stillAssignedServiceAreaIds.has(id));
    deletedCounts.service_areas = await deleteScoped(
      client,
      "DELETE FROM service_areas WHERE id = ANY($1::text[])",
      [deletedServiceAreaIds],
    );

    // -- campaigns (advertising) -- ONLY rows whose targeting.serviceAreaId
    // is one of THIS demo's own (just-deleted, so definitively
    // demo-exclusive) service area ids. Every other shape (null
    // serviceAreaId, or a pageSlug-only campaign) is a documented gap -- see
    // this module's header comment.
    const deletedServiceAreaIdSet = new Set(deletedServiceAreaIds);
    const campaignsResult = await client.query<CampaignRowForScoping>("SELECT id, targeting FROM campaigns");
    const scopedCampaignIds = campaignsResult.rows
      .filter((row) => row.targeting.serviceAreaId && deletedServiceAreaIdSet.has(row.targeting.serviceAreaId))
      .map((row) => row.id);
    const unscopedCampaignCount = campaignsResult.rows.length - scopedCampaignIds.length;
    deletedCounts.campaigns = await deleteScoped(client, "DELETE FROM campaigns WHERE id = ANY($1::text[])", [
      scopedCampaignIds,
    ]);
    if (unscopedCampaignCount > 0) {
      skippedTables.push({
        table: "campaigns (rows with no matching serviceAreaId)",
        reason:
          `${unscopedCampaignCount} campaign row(s) globally have no targeting.serviceAreaId matching one of ` +
          "this demo's own service areas (most demo campaigns target { serviceAreaId: null, pageSlug: null }) " +
          "and cannot be unambiguously attributed to one demo under the current schema -- left untouched.",
      });
    }

    // -- storefront_views -- directly demo-scoped, no derivation needed.
    deletedCounts.storefront_views = await deleteScoped(
      client,
      "DELETE FROM storefront_views WHERE demo_slug = $1",
      [demoSlug],
    );

    // -- product_catalog_assignments, products, catalogs -- last, after
    // every child table above (skus/product_attributes) that FK-references
    // `products` has already been cleared.
    deletedCounts.product_catalog_assignments = await deleteScoped(
      client,
      "DELETE FROM product_catalog_assignments WHERE catalog_id = $1",
      [catalogId],
    );
    deletedCounts.products = await deleteScoped(client, "DELETE FROM products WHERE id = ANY($1::text[])", [
      productIds,
    ]);
    deletedCounts.catalogs = await deleteScoped(client, "DELETE FROM catalogs WHERE id = $1", [catalogId]);
  });

  skippedTables.push({
    table: "bi_events",
    reason:
      "internal-bi's event payload is an arbitrary Record<string, unknown> with no schema-guaranteed key " +
      "naming a demo/order/SKU id reliably across every eventType -- heuristically parsing it would risk " +
      "deleting (or missing) another demo's rows, so this table is never touched by a reset.",
  });

  return { demoSlug, mode: "shared-database-scoped-delete", deletedCounts, skippedTables };
}

/**
 * Case A -- a demo with its own dedicated `<PREFIX>_DATABASE_URL`. Not
 * exercised by any of the 3 real demos today (see this module's header
 * comment), but implemented for real: the whole database is exclusively
 * this demo's, so every owned table is truncated unscoped, safely.
 */
async function truncateAllForDedicatedDatabase(pool: Pool): Promise<ResetDemoDataResult["deletedCounts"]> {
  const existingResult = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [ALL_OWNED_TABLES as unknown as string[]],
  );
  const existingTables = new Set(existingResult.rows.map((row) => row.table_name));
  const deletedCounts: Record<string, number> = {};

  if (existingTables.size === 0) {
    return deletedCounts;
  }

  // Real row counts before the truncate, for an honest report (TRUNCATE
  // itself doesn't report a row count the way DELETE does).
  for (const table of ALL_OWNED_TABLES) {
    if (!existingTables.has(table)) continue;
    const countResult = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${table}`);
    deletedCounts[table] = Number(countResult.rows[0]?.count ?? "0");
  }

  const tableList = ALL_OWNED_TABLES.filter((table) => existingTables.has(table)).join(", ");
  await pool.query(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);

  return deletedCounts;
}

/**
 * The real entry point `resetDemoDataAction` (lib/actions.ts) calls, after
 * its own typed-confirmation check has already passed. Resolves this ONE
 * demo's real persistence backend (mirroring lib/services.ts's own
 * `resolveDemoPersistenceEnv`), performs the correct real Case A/B delete
 * for that backend, then evicts this demo's cached service graph so the
 * next request re-seeds from scratch.
 *
 * `await getServicesForDemo(demoSlug)` is called FIRST, deliberately, before
 * this function opens its own separate `Pool` -- that guarantees every
 * table's own idempotent `CREATE TABLE IF NOT EXISTS` DDL (fired by each
 * repository factory inside `buildServices`, all serialized through that
 * SAME max:1 pgPool) has genuinely completed before this function's own,
 * separate connection ever queries any of them: `buildServices` only
 * resolves after its own `await DEMO_REGISTRY[demoSlug].seed(...)` call
 * returns, and since every one of those DDL-firing repository factories
 * runs earlier on that same single (max:1) connection, Postgres's own
 * per-connection FIFO ordering guarantees they've all completed by then.
 *
 * Non-Postgres backends (Mongo/Convex/SQLite/in-memory) are out of this
 * pass's real scope, matching this whole epic's established Postgres-only
 * precedent for these 13 tables (see e.g. catalog-entity.ts's own doc
 * comment) -- this function still evicts the cache (so an in-memory-backed
 * demo's next cold start genuinely gets a fresh in-memory Map), but issues
 * no real delete against a persisted Mongo/Convex/SQLite-file store.
 */
export async function resetDemoData(demoSlug: DemoSlug): Promise<ResetDemoDataResult> {
  await getServicesForDemo(demoSlug);

  const env = resolveDemoPersistenceEnv(demoSlug);
  if (!env.databaseUrl) {
    evictServicesForDemo(demoSlug);
    return {
      demoSlug,
      mode: "non-postgres-cache-only",
      deletedCounts: {},
      skippedTables: [
        {
          table: "(all -- non-Postgres backend)",
          reason:
            "This demo isn't resolving to Postgres (Mongo/Convex/SQLite-file/in-memory) -- real scoped/unscoped " +
            "deletes against those backends are out of scope for this pass, matching this epic's own established " +
            "Postgres-only precedent. Only this demo's in-process service-graph cache was evicted.",
        },
      ],
    };
  }

  const prefix = demoEnvPrefix(demoSlug);
  const hasDedicatedDatabase = Boolean(process.env[`${prefix}_DATABASE_URL`]);

  const pool = new Pool({ connectionString: env.databaseUrl, max: 1 });
  let result: ResetDemoDataResult;
  try {
    if (hasDedicatedDatabase) {
      const deletedCounts = await truncateAllForDedicatedDatabase(pool);
      result = { demoSlug, mode: "dedicated-database-truncate", deletedCounts, skippedTables: [] };
    } else {
      result = await scopedDeleteForDemo(pool, demoSlug);
    }
  } finally {
    await pool.end();
  }

  evictServicesForDemo(demoSlug);
  return result;
}

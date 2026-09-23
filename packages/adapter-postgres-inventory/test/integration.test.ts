import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPostgresInventoryAdapter } from "../src/index.js";

/**
 * Real-Postgres integration test -- deliberately separate from
 * adapter.test.ts (which only exercises this adapter's query-construction
 * logic against fake-pool.ts's stateful double, and explicitly documents
 * that it does NOT validate real Postgres wire protocol/SQL dialect
 * quirks). That gap is exactly how commit()/release()'s real bug shipped
 * to production undetected: both built a raw SQL VALUES list containing a
 * bare unary "-$2" applied directly to an untyped libpq parameter (e.g.
 * `VALUES ($1, -$2, -$2)`), which is genuinely ambiguous to Postgres's own
 * operator resolver and fails at real query time with "operator is not
 * unique: - unknown" -- a class of failure no mocked pool can ever
 * surface, since it's a real Postgres parser/planner behavior, not
 * anything this adapter's own TypeScript computes. Confirmed live: this
 * exact error is what production's `checkout.order.paid` event fan-out
 * threw (wrapped in nested AggregateErrors) when a shopper's sandbox
 * checkout tried to pay, see checkout-order-paid-crash investigation
 * notes / .pHive/planning/epic-backlog.md.
 *
 * Gated on TEST_DATABASE_URL (never this app's own DATABASE_URL) so it
 * never silently runs against -- or writes test rows into -- a real
 * deployment's production database; it's a no-op skip everywhere that var
 * isn't explicitly set. Every row this test writes uses a randomUUID() sku
 * id and is deleted in afterAll, so a real run leaves the target database
 * exactly as it found it.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)("createPostgresInventoryAdapter -- real Postgres integration", () => {
  let pool: Pool;
  const skuIds: string[] = [];

  beforeAll(() => {
    pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  });

  afterAll(async () => {
    if (skuIds.length > 0) {
      await pool.query("DELETE FROM stock_levels WHERE sku_id = ANY($1)", [skuIds]);
    }
    await pool.end();
  });

  function freshSkuId(): string {
    const id = `test-${randomUUID()}`;
    skuIds.push(id);
    return id;
  }

  it("reserve/commit/release all execute against real Postgres without throwing (regression for the real 'operator is not unique: - unknown' production crash)", async () => {
    const adapter = await createPostgresInventoryAdapter(pool);
    const skuId = freshSkuId();

    await adapter.setStock(skuId, 10);
    await expect(adapter.reserve(skuId, 4)).resolves.toBeUndefined();
    expect(await adapter.getStock(skuId)).toEqual({ skuId, onHand: 10, reserved: 4 });

    // This is the exact real call checkout.order.paid's inventory
    // subscriber makes (packages/inventory/src/subscriber.ts) -- the one
    // that threw in production.
    await expect(adapter.commit(skuId, 4)).resolves.toBeUndefined();
    expect(await adapter.getStock(skuId)).toEqual({ skuId, onHand: 6, reserved: 0 });

    await expect(adapter.reserve(skuId, 3)).resolves.toBeUndefined();
    // This is the exact real call payments.payment.failed's inventory
    // subscriber makes.
    await expect(adapter.release(skuId, 3)).resolves.toBeUndefined();
    expect(await adapter.getStock(skuId)).toEqual({ skuId, onHand: 6, reserved: 0 });
  });

  it("commit on a never-before-seen SKU (the INSERT branch of the upsert) also executes without throwing", async () => {
    const adapter = await createPostgresInventoryAdapter(pool);
    const skuId = freshSkuId();

    // Exercises the VALUES ($1, -$2::integer, -$2::integer) INSERT branch
    // directly (no prior row for this sku), not just the ON CONFLICT
    // UPDATE branch -- the same unary-minus-on-an-untyped-parameter
    // ambiguity existed in the VALUES list, independent of which branch of
    // the upsert actually applies.
    await expect(adapter.commit(skuId, 2)).resolves.toBeUndefined();
    expect(await adapter.getStock(skuId)).toEqual({ skuId, onHand: -2, reserved: -2 });
  });

  it("release on a never-before-seen SKU (the INSERT branch) also executes without throwing", async () => {
    const adapter = await createPostgresInventoryAdapter(pool);
    const skuId = freshSkuId();

    await expect(adapter.release(skuId, 2)).resolves.toBeUndefined();
    expect(await adapter.getStock(skuId)).toEqual({ skuId, onHand: 0, reserved: -2 });
  });
});

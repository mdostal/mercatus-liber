/**
 * Real, table-backed PromotionRepository coverage (see this package's
 * src/promotions.ts) -- @mercatus-liber/promotions's PromotionRepository
 * was in-memory-only across every adapter, including Postgres, until now.
 * Per this file's isolation requirement, this test defines its OWN local
 * fake `pg` Pool double (not the shared test/fake-pool.ts) -- same
 * style/shape as fake-pool.ts's header comment describes, scoped to exactly
 * the `promotions` table and the fixed set of SQL statements
 * src/promotions.ts issues. It also mirrors real node-postgres driver
 * quirks that matter here: NUMERIC columns come back as strings, and
 * TIMESTAMPTZ columns come back as Date objects, not the ISO strings that
 * went in.
 */
import type { Promotion } from "@mercatus-liber/promotions";
import { beforeEach, describe, expect, it } from "vitest";
import { createPostgresPromotionRepository } from "../src/promotions.js";

interface FakeRow {
  [key: string]: unknown;
}

interface FakePool {
  query<T = FakeRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

function createFakePromotionsPool(): FakePool {
  const promotions = new Map<string, FakeRow>();

  return {
    async query<T = FakeRow>(text: string, values: unknown[] = []): Promise<{ rows: T[] }> {
      const sql = text.trim();

      if (sql.includes("CREATE TABLE") || sql.includes("CREATE INDEX")) {
        return { rows: [] };
      }

      if (sql === "SELECT * FROM promotions WHERE id = $1") {
        const row = promotions.get(values[0] as string);
        return { rows: (row ? [row] : []) as T[] };
      }

      if (sql === "SELECT * FROM promotions WHERE demo_slug = $1") {
        return { rows: [...promotions.values()].filter((p) => p.demo_slug === values[0]) as T[] };
      }

      if (sql === "SELECT * FROM promotions") {
        return { rows: [...promotions.values()] as T[] };
      }

      if (sql.startsWith("INSERT INTO promotions")) {
        const [
          id,
          code,
          kind,
          scope,
          value,
          currency,
          targetSkuIds,
          minCartAmount,
          startsAt,
          endsAt,
          usageLimit,
          redemptionCount,
          status,
          demoSlug,
        ] = values as [
          string,
          string | null,
          string,
          string,
          number,
          string,
          string,
          string | null,
          string | null,
          string | null,
          number | null,
          number,
          string,
          string | null,
        ];
        promotions.set(id, {
          id,
          code,
          kind,
          scope,
          // Real NUMERIC columns come back from node-postgres as a string,
          // not a number, to avoid silent precision loss.
          value: String(value),
          currency,
          // Real JSONB columns are auto-parsed back into a JS value by the
          // driver.
          target_sku_ids: JSON.parse(targetSkuIds),
          min_cart_amount: minCartAmount ? JSON.parse(minCartAmount) : null,
          // Real TIMESTAMPTZ columns come back from node-postgres as a
          // Date, not a string.
          starts_at: startsAt ? new Date(startsAt) : null,
          ends_at: endsAt ? new Date(endsAt) : null,
          usage_limit: usageLimit,
          redemption_count: redemptionCount,
          status,
          demo_slug: demoSlug,
        });
        return { rows: [] };
      }

      throw new Error(`FakePromotionsPool: unrecognized query -- ${sql}`);
    },
  };
}

describe("createPostgresPromotionRepository", () => {
  let pool: FakePool;
  let promotions: ReturnType<typeof createPostgresPromotionRepository>;

  beforeEach(() => {
    pool = createFakePromotionsPool();
    promotions = createPostgresPromotionRepository(pool as never);
  });

  const summerSale: Promotion = {
    id: "promo1",
    code: "SUMMER10",
    kind: "percentage",
    scope: "cart",
    value: 10,
    currency: "USD",
    targetSkuIds: [],
    minCartAmount: { amount: 5000, currency: "USD" },
    startsAt: "2026-06-01T00:00:00.000Z",
    endsAt: "2026-08-31T23:59:59.000Z",
    usageLimit: 100,
    redemptionCount: 3,
    status: "active",
  };

  it("returns null for a missing promotion", async () => {
    expect(await promotions.get("missing")).toBeNull();
  });

  it("saves and retrieves a promotion by id (full round-trip)", async () => {
    await promotions.save(summerSale);
    expect(await promotions.get("promo1")).toEqual(summerSale);
  });

  it("round-trips a null code as a real auto-applied promotion, not a coupon", async () => {
    const autoApplied: Promotion = { ...summerSale, id: "promo2", code: null };
    await promotions.save(autoApplied);
    const found = await promotions.get("promo2");
    expect(found?.code).toBeNull();
  });

  it("round-trips a null minCartAmount", async () => {
    const noMinimum: Promotion = { ...summerSale, id: "promo3", minCartAmount: null };
    await promotions.save(noMinimum);
    const found = await promotions.get("promo3");
    expect(found?.minCartAmount).toBeNull();
  });

  it("round-trips a non-empty targetSkuIds array through JSONB, preserving order and values", async () => {
    const productScoped: Promotion = {
      ...summerSale,
      id: "promo4",
      scope: "product",
      targetSkuIds: ["sku-1", "sku-2", "sku-3"],
    };
    await promotions.save(productScoped);
    const found = await promotions.get("promo4");
    expect(found?.targetSkuIds).toEqual(["sku-1", "sku-2", "sku-3"]);
  });

  it("round-trips null startsAt/endsAt/usageLimit", async () => {
    const unlimited: Promotion = {
      ...summerSale,
      id: "promo5",
      startsAt: null,
      endsAt: null,
      usageLimit: null,
    };
    await promotions.save(unlimited);
    const found = await promotions.get("promo5");
    expect(found?.startsAt).toBeNull();
    expect(found?.endsAt).toBeNull();
    expect(found?.usageLimit).toBeNull();
  });

  it("round-trips a fixed-kind promotion's numeric value and currency", async () => {
    const fixedOff: Promotion = { ...summerSale, id: "promo6", kind: "fixed", value: 500, currency: "USD" };
    await promotions.save(fixedOff);
    const found = await promotions.get("promo6");
    expect(found?.value).toBe(500);
    expect(typeof found?.value).toBe("number");
  });

  it("lists every promotion", async () => {
    await promotions.save(summerSale);
    await promotions.save({ ...summerSale, id: "promo2", code: "FALL10" });
    const found = await promotions.list();
    expect(found).toHaveLength(2);
  });

  it("upserts on save with the same id (ON CONFLICT DO UPDATE) -- e.g. an incremented redemptionCount", async () => {
    await promotions.save(summerSale);
    await promotions.save({ ...summerSale, redemptionCount: 4, status: "inactive" });
    const found = await promotions.get("promo1");
    expect(found?.redemptionCount).toBe(4);
    expect(found?.status).toBe("inactive");
    expect(await promotions.list()).toHaveLength(1);
  });

  /**
   * commerce-gap-audit-3: a real, live-reachable finding -- print-shop and
   * Northline Home Tech both resolve to the same shared Postgres
   * `promotions` table (both demos resolve the same global DATABASE_URL
   * pool with no per-demo persistence override configured). An unscoped
   * list() returned both demos' coupon codes combined, and
   * PromotionsService.evaluate()'s coupon lookup (which calls list() under
   * the hood) let either demo's real code be redeemed at the OTHER demo's
   * checkout. Proves the fix: list(filter) scopes by demo_slug, and an
   * unscoped list() (no filter) still returns everything -- same shape as
   * categories.test.ts's/advertising.test.ts's own demoSlug tests.
   */
  it("list(filter) scopes by demoSlug -- two demos' promotions never bleed into each other's results", async () => {
    const printShop: Promotion = { ...summerSale, id: "promo-print-shop", code: "STITCH15", demoSlug: "print-shop" };
    const northline: Promotion = { ...summerSale, id: "promo-northline", code: "NORTHLINE15", demoSlug: "northline" };
    await promotions.save(printShop);
    await promotions.save(northline);

    const printShopOnly = await promotions.list({ demoSlug: "print-shop" });
    expect(printShopOnly).toEqual([printShop]);

    const northlineOnly = await promotions.list({ demoSlug: "northline" });
    expect(northlineOnly).toEqual([northline]);

    const everything = await promotions.list();
    expect(everything.map((p) => p.id).sort()).toEqual(["promo-northline", "promo-print-shop"]);
  });

  it("round-trips demoSlug through save/get, and omits it entirely when never set (backward compatible)", async () => {
    await promotions.save(summerSale);
    const found = await promotions.get("promo1");
    expect(found?.demoSlug).toBeUndefined();
    expect(found).not.toHaveProperty("demoSlug");
  });
});

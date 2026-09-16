/**
 * Real, table-backed FulfillmentRoutingRepository coverage (see this
 * package's src/fulfillment-routing.ts) -- @mercatus-liber/fulfillment's
 * FulfillmentRoutingRepository was in-memory-only across every backend,
 * including Postgres, until now. Per this package's
 * bundles.test.ts/cart.test.ts isolation precedent, this test defines its
 * OWN local fake `pg` Pool double (not the shared test/fake-pool.ts) --
 * scoped to exactly the `fulfillment_routing` table and the fixed set of
 * SQL statements src/fulfillment-routing.ts issues. This avoids
 * concurrent-edit collisions with other agents extending the shared
 * fake-pool.ts for their own tables in parallel.
 */
import { MANUAL_FULFILLMENT_PROVIDER } from "@mercatus-liber/fulfillment";
import { beforeEach, describe, expect, it } from "vitest";
import { createPostgresFulfillmentRoutingRepository } from "../src/fulfillment-routing.js";

interface FakeRow {
  [key: string]: unknown;
}

interface FakePool {
  query<T = FakeRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

function createFakeFulfillmentRoutingPool(): FakePool {
  const routing = new Map<string, FakeRow>();

  return {
    async query<T = FakeRow>(text: string, values: unknown[] = []): Promise<{ rows: T[] }> {
      const sql = text.trim();

      if (sql.includes("CREATE TABLE") || sql.includes("CREATE INDEX")) {
        return { rows: [] };
      }

      if (sql === "SELECT * FROM fulfillment_routing WHERE sku_id = $1") {
        const row = routing.get(values[0] as string);
        return { rows: (row ? [row] : []) as T[] };
      }

      if (sql === "SELECT * FROM fulfillment_routing") {
        return { rows: [...routing.values()] as T[] };
      }

      if (sql.startsWith("INSERT INTO fulfillment_routing")) {
        const [skuId, provider] = values as [string, string];
        // Real ON CONFLICT (sku_id) DO UPDATE SET provider = EXCLUDED.provider
        // semantics -- re-routing an already-mapped SKU replaces its
        // provider, not a duplicate row.
        routing.set(skuId, { sku_id: skuId, provider });
        return { rows: [] };
      }

      throw new Error(`FakeFulfillmentRoutingPool: unrecognized query -- ${sql}`);
    },
  };
}

describe("createPostgresFulfillmentRoutingRepository", () => {
  let pool: FakePool;
  let routing: ReturnType<typeof createPostgresFulfillmentRoutingRepository>;

  beforeEach(() => {
    pool = createFakeFulfillmentRoutingPool();
    routing = createPostgresFulfillmentRoutingRepository(pool as never);
  });

  it("returns MANUAL_FULFILLMENT_PROVIDER for a never-mapped sku, never null/undefined/throw", async () => {
    expect(await routing.getProviderForSku("sku-unmapped")).toBe(MANUAL_FULFILLMENT_PROVIDER);
  });

  it("setProviderForSku then getProviderForSku returns the real mapped provider", async () => {
    await routing.setProviderForSku("sku-tshirt", "printful");
    expect(await routing.getProviderForSku("sku-tshirt")).toBe("printful");
  });

  it("setProviderForSku is a real upsert -- re-routing an already-mapped sku replaces the provider", async () => {
    await routing.setProviderForSku("sku-tshirt", "printful");
    await routing.setProviderForSku("sku-tshirt", "printify");
    expect(await routing.getProviderForSku("sku-tshirt")).toBe("printify");
    expect(await routing.listMappings()).toHaveLength(1);
  });

  it("listMappings only includes explicit mappings -- unmapped skus are never included", async () => {
    await routing.setProviderForSku("sku-tshirt", "printful");
    // sku-mug is never explicitly mapped, even after being queried.
    await routing.getProviderForSku("sku-mug");

    const mappings = await routing.listMappings();
    expect(mappings).toEqual([{ skuId: "sku-tshirt", provider: "printful" }]);
  });

  it("returns an empty array from listMappings when nothing has ever been mapped", async () => {
    expect(await routing.listMappings()).toEqual([]);
  });

  it("supports multiple distinct sku -> provider mappings", async () => {
    await routing.setProviderForSku("sku-a", "printful");
    await routing.setProviderForSku("sku-b", "printify");
    await routing.setProviderForSku("sku-c", MANUAL_FULFILLMENT_PROVIDER);

    const mappings = await routing.listMappings();
    expect(mappings).toEqual(
      expect.arrayContaining([
        { skuId: "sku-a", provider: "printful" },
        { skuId: "sku-b", provider: "printify" },
        { skuId: "sku-c", provider: MANUAL_FULFILLMENT_PROVIDER },
      ]),
    );
    expect(mappings).toHaveLength(3);
  });
});

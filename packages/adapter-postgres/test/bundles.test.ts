/**
 * Real, table-backed BundleRepository coverage (see this package's
 * src/bundles.ts) -- @mercatus-liber/bundles' BundleRepository was
 * in-memory-only across every backend, including Postgres, until now. Per
 * this package's cart.test.ts/orders.ts isolation precedent, this test
 * defines its OWN local fake `pg` Pool double (not the shared
 * test/fake-pool.ts) -- same style/shape as fake-pool.ts's header comment
 * describes, scoped to exactly the `bundles` table and the fixed set of SQL
 * statements src/bundles.ts issues. This avoids concurrent-edit collisions
 * with other agents extending the shared fake-pool.ts for their own tables
 * in parallel.
 */
import type { Bundle } from "@mercatus-liber/bundles";
import { beforeEach, describe, expect, it } from "vitest";
import { createPostgresBundleRepository } from "../src/bundles.js";

interface FakeRow {
  [key: string]: unknown;
}

interface FakePool {
  query<T = FakeRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

function createFakeBundlesPool(): FakePool {
  const bundles = new Map<string, FakeRow>();

  return {
    async query<T = FakeRow>(text: string, values: unknown[] = []): Promise<{ rows: T[] }> {
      const sql = text.trim();

      if (sql.includes("CREATE TABLE") || sql.includes("CREATE INDEX")) {
        return { rows: [] };
      }

      if (sql === "SELECT * FROM bundles WHERE id = $1") {
        const row = bundles.get(values[0] as string);
        return { rows: (row ? [row] : []) as T[] };
      }

      if (sql === "SELECT * FROM bundles") {
        return { rows: [...bundles.values()] as T[] };
      }

      if (sql.startsWith("INSERT INTO bundles")) {
        const [id, productId, title, tiers, status] = values as [string, string, string, string, string];
        bundles.set(id, {
          id,
          product_id: productId,
          title,
          // Real Postgres auto-parses a JSONB column back into a JS value
          // for the driver -- mirrored here the same way
          // fake-pool.ts's products.identifying_attribute_keys is.
          tiers: JSON.parse(tiers),
          status,
        });
        return { rows: [] };
      }

      throw new Error(`FakeBundlesPool: unrecognized query -- ${sql}`);
    },
  };
}

describe("createPostgresBundleRepository", () => {
  let pool: FakePool;
  let bundles: ReturnType<typeof createPostgresBundleRepository>;

  beforeEach(() => {
    pool = createFakeBundlesPool();
    bundles = createPostgresBundleRepository(pool as never);
  });

  const setupBundle: Bundle = {
    id: "b1",
    productId: "p-printer",
    title: "Printer Setup Bundle",
    tiers: [
      { id: "t1", label: "Product Only", skuIds: ["sku-printer"] },
      { id: "t2", label: "+ Pro Setup", skuIds: ["sku-printer", "sku-setup"] },
      { id: "t3", label: "Complete Overhaul", skuIds: ["sku-printer", "sku-setup", "sku-ink", "sku-paper"] },
    ],
    status: "active",
  };

  it("returns null for an unknown bundle id", async () => {
    expect(await bundles.get("missing")).toBeNull();
  });

  it("saves and retrieves a multi-tier bundle, round-tripping each tier's skuIds array", async () => {
    await bundles.save(setupBundle);
    const found = await bundles.get("b1");

    expect(found).toEqual(setupBundle);
    expect(found?.tiers).toHaveLength(3);
    expect(found?.tiers[2].skuIds).toEqual(["sku-printer", "sku-setup", "sku-ink", "sku-paper"]);
  });

  it("lists every bundle", async () => {
    await bundles.save(setupBundle);
    await bundles.save({ ...setupBundle, id: "b2", title: "Second Bundle" });
    const found = await bundles.list();
    expect(found).toHaveLength(2);
  });

  it("returns an empty array when no bundles exist", async () => {
    expect(await bundles.list()).toEqual([]);
  });

  it("upserts on save with the same id (ON CONFLICT DO UPDATE), not creating a duplicate row", async () => {
    await bundles.save(setupBundle);
    await bundles.save({ ...setupBundle, status: "inactive" });

    const found = await bundles.get("b1");
    expect(found?.status).toBe("inactive");
    expect(await bundles.list()).toHaveLength(1);
  });

  it("save is a full replace of tiers, not a merge -- saving fewer tiers genuinely removes the extras", async () => {
    await bundles.save(setupBundle);
    await bundles.save({ ...setupBundle, tiers: [setupBundle.tiers[0]] });

    const found = await bundles.get("b1");
    expect(found?.tiers).toEqual([setupBundle.tiers[0]]);
    expect(found?.tiers).toHaveLength(1);
  });
});

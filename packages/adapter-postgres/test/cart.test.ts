/**
 * Real, table-backed CartRepository coverage (see this package's
 * src/cart.ts) -- @mercatus-liber/cart's CartRepository was in-memory-only
 * across every adapter, including Postgres, until now. Per this file's
 * isolation requirement, this test defines its OWN local fake `pg` Pool
 * double (not the shared test/fake-pool.ts) -- same style/shape as
 * fake-pool.ts's header comment describes, scoped to exactly the `carts`
 * table and the fixed set of SQL statements src/cart.ts issues.
 */
import type { Cart } from "@mercatus-liber/cart";
import { beforeEach, describe, expect, it } from "vitest";
import { createPostgresCartRepository } from "../src/cart.js";

interface FakeRow {
  [key: string]: unknown;
}

interface FakePool {
  query<T = FakeRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

function createFakeCartPool(): FakePool {
  const carts = new Map<string, FakeRow>();

  return {
    async query<T = FakeRow>(text: string, values: unknown[] = []): Promise<{ rows: T[] }> {
      const sql = text.trim();

      if (sql.includes("CREATE TABLE")) {
        return { rows: [] };
      }

      if (sql === "SELECT * FROM carts WHERE id = $1") {
        const row = carts.get(values[0] as string);
        return { rows: (row ? [row] : []) as T[] };
      }

      if (sql.startsWith("INSERT INTO carts")) {
        const [id, items] = values as [string, string];
        carts.set(id, {
          id,
          // Real Postgres auto-parses a JSONB column back into a JS value
          // for the driver -- mirrored here the same way
          // fake-pool.ts's products.identifying_attribute_keys is.
          items: JSON.parse(items),
        });
        return { rows: [] };
      }

      throw new Error(`FakeCartPool: unrecognized query -- ${sql}`);
    },
  };
}

describe("createPostgresCartRepository", () => {
  let pool: FakePool;
  let carts: ReturnType<typeof createPostgresCartRepository>;

  beforeEach(() => {
    pool = createFakeCartPool();
    carts = createPostgresCartRepository(pool as never);
  });

  it("returns null for an unknown cart id", async () => {
    expect(await carts.get("missing")).toBeNull();
  });

  it("saves and retrieves a multi-item cart, round-tripping a line with a customizationNote and one without", async () => {
    const cart: Cart = {
      id: "cart-1",
      items: [
        {
          skuId: "sku-shirt",
          quantity: 2,
          priceSnapshot: { amount: 2500, currency: "USD" },
          customizationNote: "Text: Sarah -- thread color: navy",
        },
        {
          skuId: "sku-mug",
          quantity: 1,
          priceSnapshot: { amount: 1200, currency: "USD" },
        },
      ],
    };

    await carts.save(cart);
    const found = await carts.get("cart-1");

    expect(found).toEqual(cart);
  });

  it("does not store customizationNote as null/undefined when absent -- the key round-trips as genuinely absent", async () => {
    const cart: Cart = {
      id: "cart-2",
      items: [{ skuId: "sku-mug", quantity: 1, priceSnapshot: { amount: 1200, currency: "USD" } }],
    };

    await carts.save(cart);
    const found = await carts.get("cart-2");

    expect(found?.items[0]).not.toHaveProperty("customizationNote");
    expect(Object.keys(found?.items[0] ?? {}).sort()).toEqual(["priceSnapshot", "quantity", "skuId"]);
  });

  it("save is a full replace, not a merge -- saving fewer items genuinely removes the extras", async () => {
    const initial: Cart = {
      id: "cart-3",
      items: [
        { skuId: "sku-a", quantity: 1, priceSnapshot: { amount: 100, currency: "USD" } },
        { skuId: "sku-b", quantity: 1, priceSnapshot: { amount: 200, currency: "USD" } },
        { skuId: "sku-c", quantity: 1, priceSnapshot: { amount: 300, currency: "USD" } },
      ],
    };
    await carts.save(initial);

    const trimmed: Cart = {
      id: "cart-3",
      items: [{ skuId: "sku-b", quantity: 1, priceSnapshot: { amount: 200, currency: "USD" } }],
    };
    await carts.save(trimmed);

    const found = await carts.get("cart-3");
    expect(found?.items).toEqual(trimmed.items);
    expect(found?.items).toHaveLength(1);
  });

  it("upserts on save with the same id (ON CONFLICT DO UPDATE), not creating a duplicate row", async () => {
    const cart: Cart = {
      id: "cart-4",
      items: [{ skuId: "sku-a", quantity: 1, priceSnapshot: { amount: 100, currency: "USD" } }],
    };
    await carts.save(cart);
    await carts.save({ ...cart, items: [{ ...cart.items[0], quantity: 5 }] });

    const found = await carts.get("cart-4");
    expect(found?.items[0].quantity).toBe(5);
  });
});

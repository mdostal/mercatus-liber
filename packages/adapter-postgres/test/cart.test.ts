/**
 * Real, table-backed CartRepository coverage (see this package's
 * src/cart.ts) -- @mercatus-liber/cart's CartRepository was in-memory-only
 * across every adapter, including Postgres, until now. Per this file's
 * isolation requirement, this test defines its OWN local fake `pg` Pool
 * double (not the shared test/fake-pool.ts) -- same style/shape as
 * fake-pool.ts's header comment describes, scoped to exactly the `carts`/
 * `cart_items` tables and the fixed set of SQL statements src/cart.ts
 * issues, but ALSO fakes `pool.connect()` returning a dedicated client with
 * real BEGIN/COMMIT/ROLLBACK semantics (via a snapshot-and-restore of the
 * underlying Maps), since src/cart.ts's `save` genuinely depends on
 * transactional rollback, not just query shape.
 */
import type { Cart } from "@mercatus-liber/cart";
import { beforeEach, describe, expect, it } from "vitest";
import { createPostgresCartRepository } from "../src/cart.js";

interface FakeRow {
  [key: string]: unknown;
}

interface FakeClient {
  query<T = FakeRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
  release(): void;
}

interface FakePool {
  query<T = FakeRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
  connect(): Promise<FakeClient>;
}

/** Magic sku id that makes the fake pool's INSERT handler throw -- lets a
 * test simulate a mid-transaction failure without a mocking library. */
const POISON_SKU_ID = "__FAIL__";

function createFakeCartPool(): FakePool {
  const carts = new Map<string, FakeRow>();
  const cartItems = new Map<number, FakeRow>();
  let nextItemId = 1;

  function handle<T>(sql: string, values: unknown[]): { rows: T[] } {
    if (sql.includes("CREATE TABLE") || sql.includes("CREATE INDEX")) {
      return { rows: [] };
    }

    if (sql === "SELECT id FROM carts WHERE id = $1") {
      const row = carts.get(values[0] as string);
      return { rows: (row ? [row] : []) as T[] };
    }

    if (sql.startsWith("INSERT INTO carts")) {
      const [id] = values as [string];
      if (!carts.has(id)) {
        carts.set(id, { id });
      }
      return { rows: [] };
    }

    if (sql === "SELECT * FROM cart_items WHERE cart_id = $1 ORDER BY id") {
      const rows = [...cartItems.values()]
        .filter((r) => r.cart_id === values[0])
        .sort((a, b) => (a.id as number) - (b.id as number));
      return { rows: rows as T[] };
    }

    if (sql.startsWith("DELETE FROM cart_items")) {
      const [cartId] = values as [string];
      for (const [key, row] of cartItems) {
        if (row.cart_id === cartId) {
          cartItems.delete(key);
        }
      }
      return { rows: [] };
    }

    if (sql.startsWith("INSERT INTO cart_items")) {
      const [cartId, skuId, quantity, priceAmount, priceCurrency, customizationNote] = values as [
        string,
        string,
        number,
        number,
        string,
        string | null,
      ];
      if (skuId === POISON_SKU_ID) {
        throw new Error("simulated failure mid-transaction");
      }
      const id = nextItemId++;
      cartItems.set(id, {
        id,
        cart_id: cartId,
        sku_id: skuId,
        quantity,
        price_amount: priceAmount,
        price_currency: priceCurrency,
        customization_note: customizationNote,
      });
      return { rows: [] };
    }

    throw new Error(`FakeCartPool: unrecognized query -- ${sql}`);
  }

  return {
    async query<T = FakeRow>(text: string, values: unknown[] = []): Promise<{ rows: T[] }> {
      return handle<T>(text.trim(), values);
    },
    async connect(): Promise<FakeClient> {
      // Real transaction semantics: snapshot both tables at BEGIN, restore
      // them verbatim on ROLLBACK, discard the snapshot on COMMIT. This is
      // enough to prove src/cart.ts's delete-then-reinsert `save` genuinely
      // leaves previous state untouched when a later statement throws.
      let snapshot: { carts: Map<string, FakeRow>; cartItems: Map<number, FakeRow> } | null = null;

      return {
        async query<T = FakeRow>(text: string, values: unknown[] = []): Promise<{ rows: T[] }> {
          const sql = text.trim();
          if (sql === "BEGIN") {
            snapshot = { carts: new Map(carts), cartItems: new Map(cartItems) };
            return { rows: [] };
          }
          if (sql === "COMMIT") {
            snapshot = null;
            return { rows: [] };
          }
          if (sql === "ROLLBACK") {
            if (snapshot) {
              carts.clear();
              for (const [k, v] of snapshot.carts) carts.set(k, v);
              cartItems.clear();
              for (const [k, v] of snapshot.cartItems) cartItems.set(k, v);
              snapshot = null;
            }
            return { rows: [] };
          }
          return handle<T>(sql, values);
        },
        release(): void {
          // no-op -- the fake pool has no connection limit to give back
        },
      };
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

  it("save REPLACES the full item set on a second call -- not an accumulate", async () => {
    await carts.save({
      id: "cart-3",
      items: [
        { skuId: "sku-a", quantity: 1, priceSnapshot: { amount: 100, currency: "USD" } },
        { skuId: "sku-b", quantity: 1, priceSnapshot: { amount: 200, currency: "USD" } },
      ],
    });

    const trimmed: Cart = {
      id: "cart-3",
      items: [{ skuId: "sku-c", quantity: 1, priceSnapshot: { amount: 300, currency: "USD" } }],
    };
    await carts.save(trimmed);

    const found = await carts.get("cart-3");
    expect(found?.items).toEqual(trimmed.items);
    expect(found?.items).toHaveLength(1);
  });

  it("returns an empty items array (not null) for a cart row that exists with no items", async () => {
    await carts.save({ id: "cart-empty", items: [] });
    expect(await carts.get("cart-empty")).toEqual({ id: "cart-empty", items: [] });
  });

  it("a transaction failure mid-save leaves the cart in its PREVIOUS state, not partially written", async () => {
    const original: Cart = {
      id: "cart-4",
      items: [{ skuId: "sku-a", quantity: 1, priceSnapshot: { amount: 100, currency: "USD" } }],
    };
    await carts.save(original);

    const poisoned: Cart = {
      id: "cart-4",
      items: [
        { skuId: "sku-b", quantity: 1, priceSnapshot: { amount: 200, currency: "USD" } },
        // This line's sku id trips the fake pool's poison check, throwing
        // mid-transaction, AFTER the previous items were already deleted.
        { skuId: POISON_SKU_ID, quantity: 1, priceSnapshot: { amount: 300, currency: "USD" } },
      ],
    };

    await expect(carts.save(poisoned)).rejects.toThrow("simulated failure mid-transaction");

    // Rollback must have restored cart-4 to exactly its pre-save state --
    // neither the delete nor the one successful insert before the poison
    // line should have stuck.
    const found = await carts.get("cart-4");
    expect(found).toEqual(original);
  });
});

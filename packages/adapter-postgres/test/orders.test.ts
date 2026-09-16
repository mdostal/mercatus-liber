/**
 * Real, table-backed OrderRepository coverage (see this package's
 * src/orders.ts) -- until now @mercatus-liber/checkout-orders' Order never
 * survived a server restart, in every adapter including Postgres. Uses its
 * OWN local fake Postgres Pool double (not the shared test/fake-pool.ts --
 * see this package's file-isolation constraint: 12 other agents are adding
 * their own self-contained persistence files/tests to this same package
 * concurrently).
 */
import type { Order } from "@mercatus-liber/checkout-orders";
import { beforeEach, describe, expect, it } from "vitest";
import { createPostgresOrderRepository } from "../src/orders.js";

interface FakeRow {
  [key: string]: unknown;
}

interface FakePool {
  query<T = FakeRow>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

/**
 * Local fake `pg.Pool` double, scoped to this test file only -- recognizes
 * exactly the fixed set of SQL statements src/orders.ts issues and serves
 * them from an in-memory Map with real upsert/unique/filter semantics, so
 * the repository's own query-construction logic is genuinely exercised.
 */
function createFakeOrdersPool(): FakePool {
  const orders = new Map<string, FakeRow>();

  return {
    async query<T = FakeRow>(text: string, values: unknown[] = []): Promise<{ rows: T[] }> {
      const sql = text.trim();

      if (sql.includes("CREATE TABLE") || sql.includes("CREATE INDEX")) {
        return { rows: [] };
      }

      if (sql === "SELECT * FROM orders WHERE id = $1") {
        const row = orders.get(values[0] as string);
        return { rows: (row ? [row] : []) as T[] };
      }

      if (sql === "SELECT * FROM orders WHERE idempotency_key = $1") {
        const row = [...orders.values()].find((o) => o.idempotency_key === values[0]);
        return { rows: (row ? [row] : []) as T[] };
      }

      if (sql === "SELECT * FROM orders WHERE customer_id = $1") {
        return { rows: [...orders.values()].filter((o) => o.customer_id === values[0]) as T[] };
      }

      if (sql === "SELECT * FROM orders WHERE status = $1") {
        return { rows: [...orders.values()].filter((o) => o.status === values[0]) as T[] };
      }

      if (sql === "SELECT * FROM orders") {
        return { rows: [...orders.values()] as T[] };
      }

      if (sql.startsWith("INSERT INTO orders")) {
        const [
          id,
          cartId,
          idempotencyKey,
          items,
          status,
          shippingInfo,
          paymentSessionId,
          paymentRedirectUrl,
          customerId,
          discountTotal,
          appliedPromotionCode,
          createdAt,
        ] = values as [
          string,
          string,
          string,
          string,
          string,
          string,
          string | null,
          string | null,
          string | null,
          string,
          string | null,
          string,
        ];

        // Real UNIQUE (idempotency_key) semantics: reject a conflicting
        // idempotency_key on a *different* id, the same way a real UNIQUE
        // constraint would (this file's ON CONFLICT target is `id`, not
        // `idempotency_key`, so a clash there isn't resolved by upsert).
        const clash = [...orders.values()].find((o) => o.idempotency_key === idempotencyKey && o.id !== id);
        if (clash) {
          throw new Error(`duplicate key value violates unique constraint "orders_idempotency_key_key"`);
        }

        orders.set(id, {
          id,
          cart_id: cartId,
          idempotency_key: idempotencyKey,
          items: JSON.parse(items),
          status,
          shipping_info: JSON.parse(shippingInfo),
          payment_session_id: paymentSessionId,
          payment_redirect_url: paymentRedirectUrl,
          customer_id: customerId,
          discount_total: JSON.parse(discountTotal),
          applied_promotion_code: appliedPromotionCode,
          created_at: createdAt,
        });
        return { rows: [] };
      }

      throw new Error(`FakeOrdersPool: unrecognized query -- ${sql}`);
    },
  };
}

describe("createPostgresOrderRepository", () => {
  let pool: FakePool;
  let orders: ReturnType<typeof createPostgresOrderRepository>;

  beforeEach(() => {
    pool = createFakeOrdersPool();
    orders = createPostgresOrderRepository(pool as never);
  });

  const baseOrder: Order = {
    id: "order-1",
    cartId: "cart-1",
    idempotencyKey: "idem-1",
    items: [
      {
        skuId: "sku-1",
        quantity: 2,
        priceAtPurchase: { amount: 1999, currency: "USD" },
      },
    ],
    status: "pending_payment",
    shippingInfo: {
      name: "Ada Lovelace",
      email: "ada@example.com",
      address: "123 Analytical Engine Way",
    },
    paymentSessionId: null,
    paymentRedirectUrl: null,
    customerId: null,
    discountTotal: { amount: 0, currency: "USD" },
    appliedPromotionCode: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };

  it("saves and retrieves an order by id, round-tripping every field", async () => {
    await orders.save(baseOrder);
    expect(await orders.get("order-1")).toEqual(baseOrder);
  });

  it("returns null for a missing order", async () => {
    expect(await orders.get("missing")).toBeNull();
    expect(await orders.getByIdempotencyKey("missing")).toBeNull();
  });

  it("round-trips a line item's customizationNote when present", async () => {
    const withNote: Order = {
      ...baseOrder,
      id: "order-note",
      idempotencyKey: "idem-note",
      items: [
        {
          skuId: "sku-1",
          quantity: 1,
          priceAtPurchase: { amount: 500, currency: "USD" },
          customizationNote: "Engrave: Happy Birthday",
        },
      ],
    };
    await orders.save(withNote);
    const found = await orders.get("order-note");
    expect(found?.items[0]?.customizationNote).toBe("Engrave: Happy Birthday");
  });

  it("omits customizationNote entirely (no key) when absent, matching the in-memory reference", async () => {
    await orders.save(baseOrder);
    const found = await orders.get("order-1");
    expect(found?.items[0]).not.toHaveProperty("customizationNote");
  });

  it("round-trips customerId, paymentSessionId, and appliedPromotionCode as real values when present", async () => {
    const withValues: Order = {
      ...baseOrder,
      id: "order-2",
      idempotencyKey: "idem-2",
      customerId: "customer-1",
      paymentSessionId: "pay-sess-1",
      paymentRedirectUrl: "https://pay.example.com/redirect/1",
      appliedPromotionCode: "SAVE10",
    };
    await orders.save(withValues);
    const found = await orders.get("order-2");
    expect(found?.customerId).toBe("customer-1");
    expect(found?.paymentSessionId).toBe("pay-sess-1");
    expect(found?.paymentRedirectUrl).toBe("https://pay.example.com/redirect/1");
    expect(found?.appliedPromotionCode).toBe("SAVE10");
  });

  it("round-trips customerId/paymentSessionId/appliedPromotionCode as null, not undefined, when absent", async () => {
    await orders.save(baseOrder);
    const found = await orders.get("order-1");
    expect(found?.customerId).toBeNull();
    expect(found?.paymentSessionId).toBeNull();
    expect(found?.paymentRedirectUrl).toBeNull();
    expect(found?.appliedPromotionCode).toBeNull();
  });

  it("getByIdempotencyKey finds the correct order and only that one", async () => {
    await orders.save(baseOrder);
    await orders.save({ ...baseOrder, id: "order-2", idempotencyKey: "idem-2" });

    const found = await orders.getByIdempotencyKey("idem-2");
    expect(found?.id).toBe("order-2");
  });

  it("listByCustomerId returns only that customer's orders", async () => {
    await orders.save({ ...baseOrder, id: "order-a", idempotencyKey: "idem-a", customerId: "cust-1" });
    await orders.save({ ...baseOrder, id: "order-b", idempotencyKey: "idem-b", customerId: "cust-2" });
    await orders.save({ ...baseOrder, id: "order-c", idempotencyKey: "idem-c", customerId: "cust-1" });

    const found = await orders.listByCustomerId("cust-1");
    expect(found.map((o) => o.id).sort()).toEqual(["order-a", "order-c"]);
  });

  it("listByCustomerId returns an empty array for a customer with no orders", async () => {
    expect(await orders.listByCustomerId("nobody")).toEqual([]);
  });

  it("listAll with no filter returns every order", async () => {
    await orders.save({ ...baseOrder, id: "order-a", idempotencyKey: "idem-a", status: "pending_payment" });
    await orders.save({ ...baseOrder, id: "order-b", idempotencyKey: "idem-b", status: "paid" });

    const found = await orders.listAll();
    expect(found).toHaveLength(2);
  });

  it("listAll with a status filter returns only matching orders", async () => {
    await orders.save({ ...baseOrder, id: "order-a", idempotencyKey: "idem-a", status: "pending_payment" });
    await orders.save({ ...baseOrder, id: "order-b", idempotencyKey: "idem-b", status: "paid" });
    await orders.save({ ...baseOrder, id: "order-c", idempotencyKey: "idem-c", status: "paid" });

    const found = await orders.listAll({ status: "paid" });
    expect(found.map((o) => o.id).sort()).toEqual(["order-b", "order-c"]);
  });

  it("a second save with an updated status transitions the order (pending_payment -> paid)", async () => {
    await orders.save(baseOrder);
    expect((await orders.get("order-1"))?.status).toBe("pending_payment");

    await orders.save({ ...baseOrder, status: "paid", paymentSessionId: "pay-sess-1" });

    const found = await orders.get("order-1");
    expect(found?.status).toBe("paid");
    expect(found?.paymentSessionId).toBe("pay-sess-1");
    expect(await orders.listAll()).toHaveLength(1); // upsert, not a duplicate row
  });
});

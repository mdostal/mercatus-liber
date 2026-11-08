import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { createPostgresOrderRepository } from "../src/orders.js";

const poolFor = (db: PGlite) => ({ query: (sql: string, params?: unknown[]) => (params ? db.query(sql, params) : db.exec(sql).then((r) => r[r.length - 1])) }) as unknown as Pool;

describe("orders.shipping_total on real Postgres", { timeout: 60_000 }, () => {
  it("🔍 adds the column to a table created before it existed, keeping old rows readable", async () => {
    const db = new PGlite();
    await db.exec(`CREATE TABLE orders (id TEXT PRIMARY KEY, cart_id TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, items JSONB NOT NULL, status TEXT NOT NULL, shipping_info JSONB NOT NULL, payment_session_id TEXT, payment_redirect_url TEXT, customer_id TEXT, discount_total JSONB NOT NULL, applied_promotion_code TEXT, created_at TEXT NOT NULL)`);
    await db.query(`INSERT INTO orders VALUES ('old', 'c', 'k-old', '[]', 'paid', '{"name":"A","email":"a@x","address":"x"}', null, null, null, '{"amount":0,"currency":"USD"}', null, '2026-01-01')`);
    const orders = createPostgresOrderRepository(poolFor(db));
    const old = await orders.get("old");
    expect(old?.status).toBe("paid");
    expect(old).not.toHaveProperty("shippingTotal");
    await orders.save({ ...old!, id: "new", idempotencyKey: "k-new", shippingTotal: { amount: 650, currency: "USD" } });
    expect((await orders.get("new"))?.shippingTotal).toEqual({ amount: 650, currency: "USD" });
  });
});

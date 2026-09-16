import type { Pool } from "pg";
import type { Order, OrderLineItem, OrderRepository, OrderStatus, ShippingInfo } from "@mercatus-liber/checkout-orders";
import type { Money } from "@mercatus-liber/core";

/**
 * Self-contained DDL for this file only -- deliberately NOT folded into this
 * package's shared schema.ts (see this file's header context: 12 other
 * agents are adding their own self-contained persistence files to this same
 * package concurrently; a later, sequential story wires everyone's DDL/
 * exports into schema.ts/index.ts together, once).
 *
 * `items`, `shipping_info`, and `discount_total` are nested/array shapes
 * (OrderLineItem[], ShippingInfo, Money) with no natural flat-column mapping
 * -- mirroring this package's own precedent for storing a JS array/object as
 * JSONB (see index.ts's `products` table: identifying_attribute_keys/images,
 * and cart.ts's `carts.items`), they're stored as JSONB columns, serialized
 * with JSON.stringify on the way in and auto-parsed back into a JS value by
 * the driver on the way out. The remaining scalar fields get real flat
 * columns: `status` and `customer_id` are filtered/looked-up by
 * listAll/listByCustomerId and need indexed WHERE clauses, not JSONB-blob
 * scans, and `idempotency_key` needs a real UNIQUE constraint so
 * getByIdempotencyKey is backed by an index rather than a table scan.
 *
 * `save` is a single-row upsert (no child table, no multi-statement
 * transaction) -- unlike a normalized order_items table, a JSONB column
 * upserts atomically as part of the single INSERT ... ON CONFLICT statement
 * below, so there's no BEGIN/COMMIT footgun to get right across pool.query()
 * calls (a bare `pg` Pool does not pin separate query() calls to the same
 * underlying connection/transaction -- that would require pool.connect()).
 */
const ORDERS_DDL = `
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    cart_id TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    items JSONB NOT NULL,
    status TEXT NOT NULL,
    shipping_info JSONB NOT NULL,
    payment_session_id TEXT,
    payment_redirect_url TEXT,
    customer_id TEXT,
    discount_total JSONB NOT NULL,
    applied_promotion_code TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
`;

interface OrderRow {
  id: string;
  cart_id: string;
  idempotency_key: string;
  items: OrderLineItem[]; // JSONB -- already parsed by the pg driver
  status: string;
  shipping_info: ShippingInfo; // JSONB
  payment_session_id: string | null;
  payment_redirect_url: string | null;
  customer_id: string | null;
  discount_total: Money; // JSONB
  applied_promotion_code: string | null;
  created_at: string;
}

function rowToOrder(row: OrderRow): Order {
  return {
    id: row.id,
    cartId: row.cart_id,
    idempotencyKey: row.idempotency_key,
    items: row.items,
    status: row.status as OrderStatus,
    shippingInfo: row.shipping_info,
    paymentSessionId: row.payment_session_id,
    paymentRedirectUrl: row.payment_redirect_url,
    customerId: row.customer_id,
    discountTotal: row.discount_total,
    appliedPromotionCode: row.applied_promotion_code,
    createdAt: row.created_at,
  };
}

/**
 * Real Postgres-backed OrderRepository -- until now
 * @mercatus-liber/checkout-orders' OrderRepository was in-memory-only
 * regardless of backend (see in-memory-repository.ts's header comment), so a
 * real customer order never survived a server restart. This is Tier 1, the
 * top commercial-priority gap of the persistence audit.
 *
 * `save` is a full replace/upsert of the order row (matching the in-memory
 * reference implementation's `orders.set(order.id, ...)` exactly) keyed on
 * `id`, relying on the real UNIQUE constraint on `idempotency_key` for
 * getByIdempotencyKey to be correct and indexed.
 *
 * Runs its own idempotent `CREATE TABLE IF NOT EXISTS` on construction
 * rather than relying on this package's shared schema.ts, per this file's
 * file-isolation requirement. Every method awaits that DDL's completion
 * first, so a repository is safe to use immediately after construction.
 */
export function createPostgresOrderRepository(pool: Pool): OrderRepository {
  const ready = pool.query(ORDERS_DDL);

  return {
    async get(id: string): Promise<Order | null> {
      await ready;
      const result = await pool.query<OrderRow>("SELECT * FROM orders WHERE id = $1", [id]);
      return result.rows[0] ? rowToOrder(result.rows[0]) : null;
    },
    async getByIdempotencyKey(key: string): Promise<Order | null> {
      await ready;
      const result = await pool.query<OrderRow>("SELECT * FROM orders WHERE idempotency_key = $1", [key]);
      return result.rows[0] ? rowToOrder(result.rows[0]) : null;
    },
    async listByCustomerId(customerId: string): Promise<Order[]> {
      await ready;
      const result = await pool.query<OrderRow>("SELECT * FROM orders WHERE customer_id = $1", [customerId]);
      return result.rows.map(rowToOrder);
    },
    async listAll(filter?: { status?: OrderStatus }): Promise<Order[]> {
      await ready;
      if (filter?.status) {
        const result = await pool.query<OrderRow>("SELECT * FROM orders WHERE status = $1", [filter.status]);
        return result.rows.map(rowToOrder);
      }
      const result = await pool.query<OrderRow>("SELECT * FROM orders");
      return result.rows.map(rowToOrder);
    },
    async save(order: Order): Promise<void> {
      await ready;
      await pool.query(
        `INSERT INTO orders (
           id, cart_id, idempotency_key, items, status, shipping_info,
           payment_session_id, payment_redirect_url, customer_id,
           discount_total, applied_promotion_code, created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE SET
           cart_id = EXCLUDED.cart_id,
           idempotency_key = EXCLUDED.idempotency_key,
           items = EXCLUDED.items,
           status = EXCLUDED.status,
           shipping_info = EXCLUDED.shipping_info,
           payment_session_id = EXCLUDED.payment_session_id,
           payment_redirect_url = EXCLUDED.payment_redirect_url,
           customer_id = EXCLUDED.customer_id,
           discount_total = EXCLUDED.discount_total,
           applied_promotion_code = EXCLUDED.applied_promotion_code,
           created_at = EXCLUDED.created_at`,
        [
          order.id,
          order.cartId,
          order.idempotencyKey,
          JSON.stringify(order.items),
          order.status,
          JSON.stringify(order.shippingInfo),
          order.paymentSessionId,
          order.paymentRedirectUrl,
          order.customerId,
          JSON.stringify(order.discountTotal),
          order.appliedPromotionCode,
          order.createdAt,
        ],
      );
    },
  };
}

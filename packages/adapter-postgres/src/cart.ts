import type { Pool, PoolClient } from "pg";
import type { Cart, CartItem, CartRepository } from "@mercatus-liber/cart";

/**
 * Self-contained DDL for this file only -- deliberately NOT folded into this
 * package's shared schema.ts (a later, sequential consolidation pass wires
 * every concurrently-added persistence file's DDL/exports into
 * schema.ts/index.ts together, once, avoiding an 8-way concurrent-edit
 * collision on those two files).
 *
 * A cart has a variable-length list of line items, each with its own Money
 * price snapshot and an optional customization note -- that's genuinely
 * relational (one-to-many), not a single scalar, so it gets two tables
 * rather than one row with a JSONB blob: `carts` (just the id, so `get` can
 * tell "cart exists but is empty" apart from "cart never existed" -- see
 * in-memory-repository.ts, which returns `null` only when the Map has no
 * entry for the id at all) and `cart_items` (one row per line, FK'd to
 * `carts(id)`). Money is stored the same two-column way skus.price_amount/
 * skus.price_currency already are in this package's schema.ts.
 */
const CART_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS carts (
  id TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS cart_items (
  id SERIAL PRIMARY KEY,
  cart_id TEXT NOT NULL REFERENCES carts(id),
  sku_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  price_amount INTEGER NOT NULL,
  price_currency TEXT NOT NULL,
  customization_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON cart_items(cart_id);
`;

interface CartItemRow {
  id: number;
  cart_id: string;
  sku_id: string;
  quantity: number;
  price_amount: number;
  price_currency: string;
  customization_note: string | null;
}

function rowToCartItem(row: CartItemRow): CartItem {
  return {
    skuId: row.sku_id,
    quantity: row.quantity,
    priceSnapshot: { amount: row.price_amount, currency: row.price_currency },
    // Mirrors in-memory-repository.ts's real Cart/CartItem shape: a line
    // with no customization carries no `customizationNote` key at all
    // (not `undefined`, not `null`) -- see types.ts's doc comment on the
    // field. exactOptionalPropertyTypes (tsconfig.base.json) is what makes
    // this spread-or-omit the correct way to satisfy that, same technique
    // index.ts's rowToProduct already uses for `images`.
    ...(row.customization_note !== null ? { customizationNote: row.customization_note } : {}),
  };
}

/**
 * Runs `fn` inside a single real Postgres transaction on ONE dedicated
 * client checked out via `pool.connect()` -- not via repeated `pool.query()`
 * calls. That distinction matters: a `Pool` hands out whichever connection
 * is free for each individual `pool.query()` call, so issuing `BEGIN`,
 * then a `DELETE`, then several `INSERT`s as separate `pool.query()` calls
 * gives no guarantee they land on the same backend connection -- against a
 * real multi-connection pool, the `DELETE`/`INSERT`s can silently run
 * outside the transaction (in their own autocommit), so a later `ROLLBACK`
 * has nothing to undo. Checking out one client up front and running every
 * statement of the transaction through that same client is what makes
 * `BEGIN`/`COMMIT`/`ROLLBACK` actually atomic. `save` below is the first
 * entity in this epic that genuinely needs a multi-statement transaction
 * (cart persistence must never end up partially written); this helper is
 * meant as the reference pattern for later multi-row entities to copy.
 */
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

/**
 * Real Postgres-backed CartRepository -- until now @mercatus-liber/cart's
 * CartRepository was in-memory-only regardless of backend (see
 * in-memory-repository.ts's header comment), so a shopper's cart never
 * survived a server restart.
 *
 * Runs its own idempotent schema-init (`CART_SCHEMA_SQL`) here rather than
 * relying on this package's shared schema.ts, per this file's isolation
 * requirement. `createPostgresCartRepository` stays a synchronous factory
 * (matching this package's other repository factories, e.g. categories.ts)
 * rather than an async one (unlike index.ts's `createPostgresAdapter`), so
 * the DDL query is fired here but not awaited inline -- instead every
 * method below awaits the same `ready` promise before issuing its own
 * queries, which still guarantees the tables exist before any real query
 * runs, without forcing callers to `await` construction itself.
 *
 * `get` returns `null` when no `carts` row exists for `id` -- it never
 * fabricates an empty cart for an unknown id; that's a real, meaningful
 * distinction the in-memory repository already makes (a `Map` either has
 * the key or it doesn't). `save` fully replaces a cart's line items on
 * every call -- delete everything currently stored for that cart id, then
 * insert the full item set just given, inside one transaction (see
 * `withTransaction` above) -- matching the in-memory repository's own
 * `save` semantics of unconditionally overwriting whatever was there
 * (`carts.set(cart.id, structuredClone(cart))`), just expressed relationally
 * instead of as one Map write.
 */
export function createPostgresCartRepository(pool: Pool): CartRepository {
  const ready = pool.query(CART_SCHEMA_SQL);

  return {
    async get(id: string): Promise<Cart | null> {
      await ready;
      const cartResult = await pool.query<{ id: string }>("SELECT id FROM carts WHERE id = $1", [id]);
      if (!cartResult.rows[0]) {
        return null;
      }
      const itemsResult = await pool.query<CartItemRow>(
        "SELECT * FROM cart_items WHERE cart_id = $1 ORDER BY id",
        [id],
      );
      return { id, items: itemsResult.rows.map(rowToCartItem) };
    },
    async save(cart: Cart): Promise<void> {
      await ready;
      await withTransaction(pool, async (client) => {
        await client.query("INSERT INTO carts (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", [cart.id]);
        await client.query("DELETE FROM cart_items WHERE cart_id = $1", [cart.id]);
        for (const item of cart.items) {
          await client.query(
            `INSERT INTO cart_items (cart_id, sku_id, quantity, price_amount, price_currency, customization_note)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              cart.id,
              item.skuId,
              item.quantity,
              item.priceSnapshot.amount,
              item.priceSnapshot.currency,
              item.customizationNote ?? null,
            ],
          );
        }
      });
    },
  };
}

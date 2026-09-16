import type { Pool } from "pg";
import type { Cart, CartItem, CartRepository } from "@mercatus-liber/cart";

/**
 * Self-contained DDL for this file only -- deliberately NOT folded into this
 * package's shared schema.ts (see this file's header context: 12 other
 * agents are adding their own self-contained persistence files to this same
 * package concurrently; a later, sequential story wires everyone's DDL/
 * exports into schema.ts/index.ts together, once). `items` is a nested
 * array (CartItem[]) with no natural flat-column mapping, so -- mirroring
 * this package's own precedent for storing a JS array/object as JSONB via
 * the `pg` driver (see index.ts's `products` table: identifying_attribute_keys
 * and images) -- it's stored as a single JSONB column, serialized with
 * JSON.stringify on the way in and auto-parsed back into a JS value by the
 * driver on the way out.
 */
const CART_DDL = `
  CREATE TABLE IF NOT EXISTS carts (
    id TEXT PRIMARY KEY,
    items JSONB NOT NULL
  )
`;

interface CartRow {
  id: string;
  items: CartItem[]; // JSONB -- already parsed by the pg driver
}

function rowToCart(row: CartRow): Cart {
  return {
    id: row.id,
    items: row.items,
  };
}

/**
 * Real Postgres-backed CartRepository -- until now @mercatus-liber/cart's
 * CartRepository was in-memory-only regardless of backend (see
 * in-memory-repository.ts's header comment), so a cart never survived a
 * server restart. `save` is a full replace of the cart's item list (matching
 * the in-memory reference implementation exactly), not a merge -- the whole
 * `items` array is re-serialized and upserted on every save.
 *
 * Runs its own idempotent `CREATE TABLE IF NOT EXISTS` on construction
 * rather than relying on this package's shared schema.ts, per this file's
 * file-isolation requirement. `get`/`save` each await that DDL's completion
 * first, so a repository is safe to use immediately after construction.
 */
export function createPostgresCartRepository(pool: Pool): CartRepository {
  const ready = pool.query(CART_DDL);

  return {
    async get(id: string): Promise<Cart | null> {
      await ready;
      const result = await pool.query<CartRow>("SELECT * FROM carts WHERE id = $1", [id]);
      return result.rows[0] ? rowToCart(result.rows[0]) : null;
    },
    async save(cart: Cart): Promise<void> {
      await ready;
      await pool.query(
        `INSERT INTO carts (id, items)
         VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET
           items = EXCLUDED.items`,
        [cart.id, JSON.stringify(cart.items)],
      );
    },
  };
}

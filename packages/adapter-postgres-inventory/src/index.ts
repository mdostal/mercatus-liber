import type { Pool } from "pg";
import type { InventoryAdapter, StockLevel } from "@mercatus-liber/inventory";
import { SCHEMA_SQL } from "./schema.js";

interface StockLevelRow {
  sku_id: string;
  on_hand: number;
  reserved: number;
}

function rowToStockLevel(row: StockLevelRow): StockLevel {
  return { skuId: row.sku_id, onHand: row.on_hand, reserved: row.reserved };
}

/**
 * Real second InventoryAdapter implementation, backed by Postgres. Every
 * mutating method below deliberately reproduces the in-memory adapter's own
 * "implicitly create a zeroed {onHand:0, reserved:0} row for an unknown
 * skuId, then apply the delta" semantics via a real `INSERT ... ON CONFLICT
 * DO UPDATE` upsert -- e.g. `reserve` on a never-before-seen SKU inserts
 * `(skuId, 0, quantity)`, exactly matching what the in-memory adapter's
 * `getOrInit` + `reserved += quantity` produces. Like the in-memory
 * adapter, this never clamps at zero or throws on an insufficient-stock
 * reservation -- InventoryAdapter's own contract (see @mercatus-liber/
 * inventory's types.ts) is "never throws, the default adapter allows
 * oversell/backorder," and a real second implementation has to honor that
 * same contract, not silently add stricter behavior a caller can't opt out
 * of.
 */
export async function createPostgresInventoryAdapter(pool: Pool): Promise<InventoryAdapter> {
  await pool.query(SCHEMA_SQL);

  return {
    async getStock(skuId: string): Promise<StockLevel | null> {
      const result = await pool.query<StockLevelRow>("SELECT * FROM stock_levels WHERE sku_id = $1", [skuId]);
      return result.rows[0] ? rowToStockLevel(result.rows[0]) : null;
    },

    async setStock(skuId: string, onHand: number): Promise<void> {
      await pool.query(
        `INSERT INTO stock_levels (sku_id, on_hand, reserved)
         VALUES ($1, $2, 0)
         ON CONFLICT (sku_id) DO UPDATE SET on_hand = $2`,
        [skuId, onHand],
      );
    },

    async reserve(skuId: string, quantity: number): Promise<void> {
      await pool.query(
        `INSERT INTO stock_levels (sku_id, on_hand, reserved)
         VALUES ($1, 0, $2)
         ON CONFLICT (sku_id) DO UPDATE SET reserved = stock_levels.reserved + $2`,
        [skuId, quantity],
      );
    },

    async commit(skuId: string, quantity: number): Promise<void> {
      // $2::integer casts -- a bare unary "-$2" applied straight to an
      // untyped ("unknown"-typed) libpq parameter inside a VALUES list is
      // genuinely ambiguous to Postgres's operator resolver (it can't tell
      // which numeric "-" overload to bind before it knows the operand's
      // type), and fails at query time with "operator is not unique: -
      // unknown" -- confirmed live against real Supabase Postgres
      // (checkout-order-paid-crash investigation). The ON CONFLICT ... SET
      // clause's own "stock_levels.on_hand - $2" is never ambiguous (one
      // operand is already the real, typed `on_hand` column), so only the
      // VALUES-list occurrences below needed the explicit cast.
      await pool.query(
        `INSERT INTO stock_levels (sku_id, on_hand, reserved)
         VALUES ($1, -$2::integer, -$2::integer)
         ON CONFLICT (sku_id) DO UPDATE SET
           on_hand = stock_levels.on_hand - $2,
           reserved = stock_levels.reserved - $2`,
        [skuId, quantity],
      );
    },

    async release(skuId: string, quantity: number): Promise<void> {
      // See commit()'s comment above -- same "-$2::integer" fix for the same
      // "operator is not unique: - unknown" failure mode.
      await pool.query(
        `INSERT INTO stock_levels (sku_id, on_hand, reserved)
         VALUES ($1, 0, -$2::integer)
         ON CONFLICT (sku_id) DO UPDATE SET reserved = stock_levels.reserved - $2`,
        [skuId, quantity],
      );
    },
  };
}

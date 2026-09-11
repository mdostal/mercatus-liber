/**
 * A stateful fake `pg.Pool` double -- NOT a real Postgres connection. No
 * live Postgres server exists in this environment (same disclosed gap as
 * @mercatus-liber/adapter-postgres's own fake-pool.ts). Recognizes exactly
 * the fixed set of SQL statements this adapter issues and serves them from
 * an in-memory Map with real upsert semantics (including the `ON CONFLICT
 * DO UPDATE SET x = table.x + $n` increment/decrement forms), so the
 * adapter's own query-construction logic is genuinely exercised -- it does
 * NOT validate against real Postgres wire protocol or SQL dialect quirks.
 */
interface Row {
  sku_id: string;
  on_hand: number;
  reserved: number;
}

export interface FakePool {
  query<T = Row>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

export function createFakePgPool(): FakePool {
  const rows = new Map<string, Row>();

  return {
    async query<T = Row>(text: string, values: unknown[] = []): Promise<{ rows: T[] }> {
      const sql = text.trim();

      if (sql.includes("CREATE TABLE")) return { rows: [] };

      if (sql === "SELECT * FROM stock_levels WHERE sku_id = $1") {
        const row = rows.get(values[0] as string);
        return { rows: (row ? [row] : []) as T[] };
      }

      if (sql.includes("ON CONFLICT (sku_id) DO UPDATE SET on_hand = $2")) {
        // setStock
        const [skuId, onHand] = values as [string, number];
        const existing = rows.get(skuId);
        rows.set(skuId, { sku_id: skuId, on_hand: onHand, reserved: existing?.reserved ?? 0 });
        return { rows: [] };
      }

      if (sql.includes("ON CONFLICT (sku_id) DO UPDATE SET reserved = stock_levels.reserved + $2")) {
        // reserve
        const [skuId, quantity] = values as [string, number];
        const existing = rows.get(skuId) ?? { sku_id: skuId, on_hand: 0, reserved: 0 };
        rows.set(skuId, { ...existing, reserved: existing.reserved + quantity });
        return { rows: [] };
      }

      if (sql.includes("ON CONFLICT (sku_id) DO UPDATE SET reserved = stock_levels.reserved - $2")) {
        // release
        const [skuId, quantity] = values as [string, number];
        const existing = rows.get(skuId) ?? { sku_id: skuId, on_hand: 0, reserved: 0 };
        rows.set(skuId, { ...existing, reserved: existing.reserved - quantity });
        return { rows: [] };
      }

      if (sql.includes("on_hand = stock_levels.on_hand - $2") && sql.includes("reserved = stock_levels.reserved - $2")) {
        // commit
        const [skuId, quantity] = values as [string, number];
        const existing = rows.get(skuId) ?? { sku_id: skuId, on_hand: 0, reserved: 0 };
        rows.set(skuId, { sku_id: skuId, on_hand: existing.on_hand - quantity, reserved: existing.reserved - quantity });
        return { rows: [] };
      }

      throw new Error(`FakePool: unrecognized query -- ${sql}`);
    },
  };
}

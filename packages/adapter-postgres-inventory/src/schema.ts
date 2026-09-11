/**
 * Table DDL for the inventory persistence surface. A single row per SKU --
 * mirrors @mercatus-liber/inventory's own in-memory adapter's Map<skuId,
 * StockLevel> shape exactly, just durable.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS stock_levels (
  sku_id TEXT PRIMARY KEY,
  on_hand INTEGER NOT NULL,
  reserved INTEGER NOT NULL
);
`;

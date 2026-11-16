import type { Pool } from "pg";
import type { FulfillmentLineRecord, FulfillmentLineStatus, ManualFulfillmentRecordStore } from "@mercatus-liber/fulfillment";

// `seq` keeps an order's lines in the order they were first saved.
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS manual_fulfillment_records (
  order_id TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_order_id TEXT,
  status TEXT NOT NULL,
  tracking_number TEXT,
  tracking_url TEXT,
  seq BIGSERIAL,
  PRIMARY KEY (order_id, sku_id)
);
`;

interface Row {
  order_id: string;
  sku_id: string;
  provider: string;
  external_order_id: string | null;
  status: string;
  tracking_number: string | null;
  tracking_url: string | null;
}

/**
 * Postgres-backed ManualFulfillmentRecordStore: the status and tracking number
 * of lines a store ships itself. The schema runs once, on first use, and is
 * retried if that fails.
 */
export function createPostgresManualFulfillmentRecordStore(pool: Pool): ManualFulfillmentRecordStore {
  let ready: Promise<unknown> | undefined;
  const ensure = (): Promise<unknown> => {
    ready ??= pool.query(SCHEMA_SQL).catch((error: unknown) => {
      ready = undefined;
      throw error;
    });
    return ready;
  };
  return {
    async list(orderId) {
      await ensure();
      const { rows } = await pool.query<Row>("SELECT * FROM manual_fulfillment_records WHERE order_id = $1 ORDER BY seq", [orderId]);
      return rows.map((row): FulfillmentLineRecord => ({
        orderId: row.order_id,
        skuId: row.sku_id,
        provider: row.provider,
        externalOrderId: row.external_order_id,
        status: row.status as FulfillmentLineStatus,
        trackingNumber: row.tracking_number,
        trackingUrl: row.tracking_url,
      }));
    },
    async save(records) {
      await ensure();
      for (const record of records) {
        await pool.query(
          `INSERT INTO manual_fulfillment_records (order_id, sku_id, provider, external_order_id, status, tracking_number, tracking_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (order_id, sku_id) DO UPDATE SET
             provider = EXCLUDED.provider, external_order_id = EXCLUDED.external_order_id, status = EXCLUDED.status,
             tracking_number = EXCLUDED.tracking_number, tracking_url = EXCLUDED.tracking_url`,
          [record.orderId, record.skuId, record.provider, record.externalOrderId, record.status, record.trackingNumber, record.trackingUrl],
        );
      }
    },
  };
}

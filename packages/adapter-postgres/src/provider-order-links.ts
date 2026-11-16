import type { Pool } from "pg";
import type { FulfillmentLineStatus, ProviderOrderLink, ProviderOrderLinkRepository } from "@mercatus-liber/fulfillment";

// `seq` records link order, so "the most recently linked" needs no clock.
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS provider_order_links (
  provider TEXT NOT NULL,
  external_order_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  status TEXT,
  tracking_number TEXT,
  carrier TEXT,
  sku_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  seq BIGSERIAL,
  PRIMARY KEY (provider, external_order_id)
);
ALTER TABLE provider_order_links ADD COLUMN IF NOT EXISTS sku_ids JSONB NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS provider_order_links_order_idx ON provider_order_links (order_id, provider);
`;

interface Row {
  provider: string;
  external_order_id: string;
  order_id: string;
  status: string | null;
  tracking_number: string | null;
  carrier: string | null;
  sku_ids: string[];
}

const toLink = (row: Row): ProviderOrderLink => ({
  orderId: row.order_id,
  provider: row.provider,
  externalOrderId: row.external_order_id,
  skuIds: row.sku_ids ?? [],
  status: row.status as FulfillmentLineStatus | null,
  trackingNumber: row.tracking_number,
  carrier: row.carrier,
});

/** Postgres-backed ProviderOrderLinkRepository. The schema runs once, on first use, and is retried if that fails. */
export function createPostgresProviderOrderLinkRepository(pool: Pool): ProviderOrderLinkRepository {
  let ready: Promise<unknown> | undefined;
  const ensure = (): Promise<unknown> => {
    ready ??= pool.query(SCHEMA_SQL).catch((error: unknown) => {
      ready = undefined;
      throw error;
    });
    return ready;
  };
  return {
    async link({ orderId, provider, externalOrderId, skuIds }) {
      await ensure();
      // $4 is null when no skuIds were given, which leaves an existing row's alone.
      await pool.query(
        `INSERT INTO provider_order_links (provider, external_order_id, order_id, sku_ids) VALUES ($1, $2, $3, COALESCE($4::jsonb, '[]'::jsonb))
         ON CONFLICT (provider, external_order_id) DO UPDATE SET order_id = EXCLUDED.order_id, sku_ids = COALESCE($4::jsonb, provider_order_links.sku_ids)`,
        [provider, externalOrderId, orderId, skuIds ? JSON.stringify(skuIds) : null],
      );
    },
    async listForOrder(orderId, provider) {
      await ensure();
      const { rows } = await pool.query<Row>("SELECT * FROM provider_order_links WHERE order_id = $1 AND provider = $2 ORDER BY seq", [orderId, provider]);
      return rows.map(toLink);
    },
    async listOpen(provider) {
      await ensure();
      const { rows } = await pool.query<Row>("SELECT * FROM provider_order_links WHERE provider = $1 AND (status IS NULL OR status NOT IN ('delivered', 'unfulfilled')) ORDER BY seq", [provider]);
      return rows.map(toLink);
    },
    async latestForOrder(orderId, provider) {
      await ensure();
      const { rows } = await pool.query<Row>("SELECT * FROM provider_order_links WHERE order_id = $1 AND provider = $2 ORDER BY seq DESC LIMIT 1", [orderId, provider]);
      return rows[0] ? toLink(rows[0]) : null;
    },
    async findByExternalOrderId(provider, externalOrderId) {
      await ensure();
      const { rows } = await pool.query<Row>("SELECT * FROM provider_order_links WHERE provider = $1 AND external_order_id = $2", [provider, externalOrderId]);
      return rows[0] ? toLink(rows[0]) : null;
    },
    async saveStatus(provider, externalOrderId, status) {
      await ensure();
      await pool.query("UPDATE provider_order_links SET status = $3, tracking_number = $4, carrier = $5 WHERE provider = $1 AND external_order_id = $2", [
        provider,
        externalOrderId,
        status.status,
        status.trackingNumber,
        status.carrier,
      ]);
    },
  };
}

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
  seq BIGSERIAL,
  PRIMARY KEY (provider, external_order_id)
);
CREATE INDEX IF NOT EXISTS provider_order_links_order_idx ON provider_order_links (order_id, provider);
`;

interface Row {
  provider: string;
  external_order_id: string;
  order_id: string;
  status: string | null;
  tracking_number: string | null;
  carrier: string | null;
}

const toLink = (row: Row): ProviderOrderLink => ({
  orderId: row.order_id,
  provider: row.provider,
  externalOrderId: row.external_order_id,
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
    async link({ orderId, provider, externalOrderId }) {
      await ensure();
      await pool.query(
        `INSERT INTO provider_order_links (provider, external_order_id, order_id) VALUES ($1, $2, $3)
         ON CONFLICT (provider, external_order_id) DO UPDATE SET order_id = EXCLUDED.order_id`,
        [provider, externalOrderId, orderId],
      );
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

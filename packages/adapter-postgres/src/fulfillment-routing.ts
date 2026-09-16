import type { Pool } from "pg";
import {
  MANUAL_FULFILLMENT_PROVIDER,
  type FulfillmentProviderKey,
  type FulfillmentRoutingRepository,
} from "@mercatus-liber/fulfillment";

/**
 * Self-contained DDL for this file's one table -- deliberately NOT added to
 * schema.ts, same "own schema-init, no shared-file edits" pattern this
 * package's bundles.ts/categories.ts already established. Run on
 * construction so the factory alone is enough to make the table exist; the
 * statement is idempotent (IF NOT EXISTS), safe to run more than once.
 * `provider` is TEXT: FulfillmentProviderKey is a plain string (see
 * @mercatus-liber/fulfillment's types.ts -- deliberately not a closed union,
 * so real provider adapters like Printful/Printify can add keys later with
 * no schema change here).
 */
const FULFILLMENT_ROUTING_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS fulfillment_routing (
  sku_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL
);
`;

interface FulfillmentRoutingRow {
  sku_id: string;
  provider: string;
}

/**
 * Real Postgres-backed FulfillmentRoutingRepository -- until now
 * apps/reference-storefront/lib/services.ts always constructed
 * createInMemoryFulfillmentRoutingRepository() regardless of backend, so
 * every skuId -> provider mapping was lost on restart.
 *
 * getProviderForSku matches @mercatus-liber/fulfillment's own in-memory
 * reference (routing-repository.ts's createInMemoryFulfillmentRoutingRepository)
 * exactly: never throws/returns undefined for an unmapped SKU, resolving
 * MANUAL_FULFILLMENT_PROVIDER by default. setProviderForSku is a real
 * upsert (ON CONFLICT DO UPDATE) -- re-routing an already-mapped SKU
 * replaces its provider rather than erroring or duplicating a row.
 * listMappings only ever returns explicit mappings this table holds --
 * unmapped SKUs are never synthesized into the result.
 */
export function createPostgresFulfillmentRoutingRepository(pool: Pool): FulfillmentRoutingRepository {
  const ready = pool.query(FULFILLMENT_ROUTING_SCHEMA_SQL).then(() => undefined);

  return {
    async getProviderForSku(skuId: string): Promise<FulfillmentProviderKey> {
      await ready;
      const result = await pool.query<FulfillmentRoutingRow>(
        "SELECT * FROM fulfillment_routing WHERE sku_id = $1",
        [skuId],
      );
      return result.rows[0] ? result.rows[0].provider : MANUAL_FULFILLMENT_PROVIDER;
    },
    async setProviderForSku(skuId: string, provider: FulfillmentProviderKey): Promise<void> {
      await ready;
      await pool.query(
        `INSERT INTO fulfillment_routing (sku_id, provider)
         VALUES ($1, $2)
         ON CONFLICT (sku_id) DO UPDATE SET
           provider = EXCLUDED.provider`,
        [skuId, provider],
      );
    },
    async listMappings(): Promise<{ skuId: string; provider: FulfillmentProviderKey }[]> {
      await ready;
      const result = await pool.query<FulfillmentRoutingRow>("SELECT * FROM fulfillment_routing");
      return result.rows.map((row) => ({ skuId: row.sku_id, provider: row.provider }));
    },
  };
}

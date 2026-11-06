import type { Pool } from "pg";
import type { ProviderCatalogMapping, ProviderCatalogMappingRepository } from "@mercatus-liber/fulfillment";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS provider_catalog_mappings (
  sku_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  target JSONB NOT NULL,
  PRIMARY KEY (sku_id, provider)
);
`;

interface Row {
  sku_id: string;
  provider: string;
  target: Record<string, unknown>;
}

const toMapping = (row: Row): ProviderCatalogMapping => ({ skuId: row.sku_id, provider: row.provider, target: row.target });

/** Postgres-backed ProviderCatalogMappingRepository. The schema runs once, on first use, and is retried if that fails. */
export function createPostgresProviderCatalogMappingRepository(pool: Pool): ProviderCatalogMappingRepository {
  let ready: Promise<unknown> | undefined;
  const ensure = (): Promise<unknown> => {
    ready ??= pool.query(SCHEMA_SQL).catch((error: unknown) => {
      ready = undefined;
      throw error;
    });
    return ready;
  };
  return {
    async get(skuId, provider) {
      await ensure();
      const { rows } = await pool.query<Row>("SELECT * FROM provider_catalog_mappings WHERE sku_id = $1 AND provider = $2", [skuId, provider]);
      return rows[0] ? toMapping(rows[0]) : null;
    },
    async save(mapping) {
      await ensure();
      await pool.query(
        `INSERT INTO provider_catalog_mappings (sku_id, provider, target) VALUES ($1, $2, $3)
         ON CONFLICT (sku_id, provider) DO UPDATE SET target = EXCLUDED.target`,
        [mapping.skuId, mapping.provider, JSON.stringify(mapping.target)],
      );
    },
    async remove(skuId, provider) {
      await ensure();
      await pool.query("DELETE FROM provider_catalog_mappings WHERE sku_id = $1 AND provider = $2", [skuId, provider]);
    },
    async list(provider) {
      await ensure();
      const { rows } = provider === undefined
        ? await pool.query<Row>("SELECT * FROM provider_catalog_mappings ORDER BY sku_id, provider")
        : await pool.query<Row>("SELECT * FROM provider_catalog_mappings WHERE provider = $1 ORDER BY sku_id", [provider]);
      return rows.map(toMapping);
    },
  };
}

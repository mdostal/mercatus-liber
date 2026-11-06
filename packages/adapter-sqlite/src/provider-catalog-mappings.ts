import type Database from "better-sqlite3";

/**
 * Mirrors @mercatus-liber/fulfillment's ProviderCatalogMapping and repository
 * field for field rather than importing them: fulfillment's tests depend on
 * this package through checkout-orders, so a real dependency here would make a
 * build cycle. Structural typing makes this satisfy fulfillment's interface.
 */
export interface ProviderCatalogMapping {
  skuId: string;
  provider: string;
  target: Record<string, unknown>;
}

export interface ProviderCatalogMappingRepository {
  get(skuId: string, provider: string): Promise<ProviderCatalogMapping | null>;
  save(mapping: ProviderCatalogMapping): Promise<void>;
  remove(skuId: string, provider: string): Promise<void>;
  list(provider?: string): Promise<ProviderCatalogMapping[]>;
}

interface Row {
  sku_id: string;
  provider: string;
  target: string;
}

const toMapping = (row: Row): ProviderCatalogMapping => ({ skuId: row.sku_id, provider: row.provider, target: JSON.parse(row.target) as Record<string, unknown> });

/** SQLite-backed ProviderCatalogMappingRepository. Creates its own table. */
export function createSqliteProviderCatalogMappingRepository(db: Database.Database): ProviderCatalogMappingRepository {
  db.exec("CREATE TABLE IF NOT EXISTS provider_catalog_mappings (sku_id TEXT NOT NULL, provider TEXT NOT NULL, target TEXT NOT NULL, PRIMARY KEY (sku_id, provider))");
  return {
    async get(skuId, provider) {
      const row = db.prepare("SELECT * FROM provider_catalog_mappings WHERE sku_id = ? AND provider = ?").get(skuId, provider) as Row | undefined;
      return row ? toMapping(row) : null;
    },
    async save(mapping) {
      db.prepare("INSERT INTO provider_catalog_mappings (sku_id, provider, target) VALUES (?, ?, ?) ON CONFLICT (sku_id, provider) DO UPDATE SET target = excluded.target").run(mapping.skuId, mapping.provider, JSON.stringify(mapping.target));
    },
    async remove(skuId, provider) {
      db.prepare("DELETE FROM provider_catalog_mappings WHERE sku_id = ? AND provider = ?").run(skuId, provider);
    },
    async list(provider) {
      const rows = (provider === undefined
        ? db.prepare("SELECT * FROM provider_catalog_mappings ORDER BY sku_id, provider").all()
        : db.prepare("SELECT * FROM provider_catalog_mappings WHERE provider = ? ORDER BY sku_id").all(provider)) as Row[];
      return rows.map(toMapping);
    },
  };
}

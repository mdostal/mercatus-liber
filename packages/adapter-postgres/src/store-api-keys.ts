import type { Pool } from "pg";
import type { StoreApiKey, StoreApiKeyRepository } from "@mercatus-liber/store-api";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS store_api_keys (
  id TEXT PRIMARY KEY,
  prefix TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL,
  created_at TEXT NOT NULL
);
`;

/** Postgres-backed StoreApiKeyRepository. Holds only key hashes. */
export function createPostgresStoreApiKeyRepository(pool: Pool): StoreApiKeyRepository {
  let ready: Promise<unknown> | undefined;
  const ensure = (): Promise<unknown> => {
    ready ??= pool.query(SCHEMA_SQL).catch((error: unknown) => {
      ready = undefined;
      throw error;
    });
    return ready;
  };
  const one = async (sql: string, value: string): Promise<StoreApiKey | null> => {
    await ensure();
    const { rows } = await pool.query<{ value: StoreApiKey }>(sql, [value]);
    return rows[0]?.value ?? null;
  };
  return {
    get: (id) => one("SELECT value FROM store_api_keys WHERE id = $1", id),
    getByPrefix: (prefix) => one("SELECT value FROM store_api_keys WHERE prefix = $1", prefix),
    async list() {
      await ensure();
      const { rows } = await pool.query<{ value: StoreApiKey }>("SELECT value FROM store_api_keys ORDER BY created_at, id");
      return rows.map((r) => r.value);
    },
    async save(key) {
      await ensure();
      await pool.query("INSERT INTO store_api_keys (id, prefix, value, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value", [key.id, key.prefix, JSON.stringify(key), key.createdAt]);
    },
  };
}

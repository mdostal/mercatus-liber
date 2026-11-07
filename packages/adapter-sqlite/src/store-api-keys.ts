import type Database from "better-sqlite3";

/**
 * Mirrors @mercatus-liber/store-api's StoreApiKey and repository rather than
 * importing them, matching this package's other mirrored contracts.
 */
export interface StoreApiKey {
  id: string;
  name: string;
  prefix: string;
  hash: string;
  scopes: ("products:read" | "promotions:read" | "promotions:write" | "webhooks:manage")[];
  createdAt: string;
  revokedAt: string | null;
}

export interface StoreApiKeyRepository {
  get(id: string): Promise<StoreApiKey | null>;
  getByPrefix(prefix: string): Promise<StoreApiKey | null>;
  list(): Promise<StoreApiKey[]>;
  save(key: StoreApiKey): Promise<void>;
}

/** SQLite-backed StoreApiKeyRepository. Holds only key hashes. */
export function createSqliteStoreApiKeyRepository(db: Database.Database): StoreApiKeyRepository {
  db.exec("CREATE TABLE IF NOT EXISTS store_api_keys (id TEXT PRIMARY KEY, prefix TEXT NOT NULL UNIQUE, value TEXT NOT NULL, created_at TEXT NOT NULL)");
  const parse = (row: unknown): StoreApiKey | null => (row ? (JSON.parse((row as { value: string }).value) as StoreApiKey) : null);
  return {
    async get(id) {
      return parse(db.prepare("SELECT value FROM store_api_keys WHERE id = ?").get(id));
    },
    async getByPrefix(prefix) {
      return parse(db.prepare("SELECT value FROM store_api_keys WHERE prefix = ?").get(prefix));
    },
    async list() {
      return (db.prepare("SELECT value FROM store_api_keys ORDER BY created_at, id").all() as { value: string }[]).map((r) => JSON.parse(r.value) as StoreApiKey);
    },
    async save(key) {
      db.prepare("INSERT INTO store_api_keys (id, prefix, value, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET value = excluded.value").run(key.id, key.prefix, JSON.stringify(key), key.createdAt);
    },
  };
}

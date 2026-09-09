/**
 * Table DDL for the catalog persistence surface. JSONB columns (not
 * TEXT-encoded JSON like adapter-sqlite) -- a deliberate difference in
 * internal storage strategy between the two reference adapters, proving
 * CatalogPersistenceAdapter's contract is the TypeScript interface, not a
 * particular encoding.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  identifying_attribute_keys JSONB NOT NULL,
  status TEXT NOT NULL
);
-- image-cdn epic: CREATE TABLE IF NOT EXISTS above is a no-op against a
-- database that already existed before this column did, unlike a fresh one
-- -- Postgres (unlike SQLite) supports ADD COLUMN IF NOT EXISTS natively,
-- so this one statement (idempotent, safe to run every startup) covers both
-- cases with no separate migration runner needed.
ALTER TABLE products ADD COLUMN IF NOT EXISTS images JSONB;

CREATE TABLE IF NOT EXISTS skus (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  identifying_attributes JSONB NOT NULL,
  price_amount INTEGER NOT NULL,
  price_currency TEXT NOT NULL,
  status TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_skus_product_id ON skus(product_id);

CREATE TABLE IF NOT EXISTS product_attributes (
  product_id TEXT NOT NULL REFERENCES products(id),
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  facetable BOOLEAN NOT NULL,
  PRIMARY KEY (product_id, key)
);
`;

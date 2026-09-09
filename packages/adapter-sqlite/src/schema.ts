/** Table DDL for the catalog persistence surface. Run once against a fresh DB file. */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  identifying_attribute_keys TEXT NOT NULL, -- JSON string[]
  status TEXT NOT NULL,
  images TEXT -- JSON ProductImage[] | null, image-cdn epic
);

CREATE TABLE IF NOT EXISTS skus (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  identifying_attributes TEXT NOT NULL, -- JSON IdentifyingAttribute[]
  price_amount INTEGER NOT NULL,
  price_currency TEXT NOT NULL,
  status TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_skus_product_id ON skus(product_id);

CREATE TABLE IF NOT EXISTS product_attributes (
  product_id TEXT NOT NULL REFERENCES products(id),
  key TEXT NOT NULL,
  value TEXT NOT NULL, -- JSON AttributeValue | AttributeValue[]
  facetable INTEGER NOT NULL, -- 0 | 1
  PRIMARY KEY (product_id, key)
);
`;

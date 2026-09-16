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

-- @mercatus-liber/marketing-catalog's CategoryRepository/ProductCategoryRepository
-- persistence -- every field is a plain scalar, so unlike products/skus/
-- product_attributes above, no column here needs JSON-encoded TEXT.
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  parent_id TEXT REFERENCES categories(id) -- NULL for a top-level category
);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);

-- Many-to-many product<->category assignment. product_id intentionally has no
-- REFERENCES products(id): marketing-catalog's ProductCategoryRepository is a
-- structural interface only, owned by a package that never imports the
-- product catalog, so this adapter must not encode a hard FK to the products
-- table here either.
CREATE TABLE IF NOT EXISTS product_category_assignments (
  product_id TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id),
  PRIMARY KEY (product_id, category_id)
);
CREATE INDEX IF NOT EXISTS idx_pca_category_id ON product_category_assignments(category_id);
`;

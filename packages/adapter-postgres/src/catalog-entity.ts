import type { Pool } from "pg";
import type { Catalog, CatalogRepository, ProductCatalogRepository } from "@mercatus-liber/catalog";

/**
 * Real Postgres persistence for the Catalog entity (see
 * @mercatus-liber/catalog's catalog-entity.ts) -- a real, named, addressable
 * Catalog<->Product many-to-many, not just "3 demo stores = 3 databases".
 *
 * Deliberately self-contained (unlike categories.ts's "append to the shared
 * SCHEMA_SQL" approach): this file owns its own local DDL and runs it itself
 * on construction, rather than touching this package's shared schema.ts or
 * index.ts. Several other stories are adding their own self-contained files
 * to this same package concurrently; a later, sequential story wires every
 * new file's exports into index.ts together, once, after all of them land.
 */
const CATALOG_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS catalogs (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS product_catalog_assignments (
    product_id TEXT NOT NULL,
    catalog_id TEXT NOT NULL REFERENCES catalogs(id),
    PRIMARY KEY (product_id, catalog_id)
  );
  CREATE INDEX IF NOT EXISTS idx_pcata_catalog_id ON product_catalog_assignments(catalog_id);
`;

interface CatalogRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  created_at: string;
}

interface AssignmentRow {
  product_id: string;
  catalog_id: string;
}

function rowToCatalog(row: CatalogRow): Catalog {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
  };
}

/**
 * Real Postgres-backed CatalogRepository. Runs CATALOG_SCHEMA_SQL itself on
 * construction (idempotent -- CREATE TABLE IF NOT EXISTS makes calling this
 * alongside createPostgresProductCatalogRepository harmless even though both
 * run the same DDL).
 */
export function createPostgresCatalogRepository(pool: Pool): CatalogRepository {
  const ready = pool.query(CATALOG_SCHEMA_SQL);

  return {
    async get(id: string): Promise<Catalog | null> {
      await ready;
      const result = await pool.query<CatalogRow>("SELECT * FROM catalogs WHERE id = $1", [id]);
      return result.rows[0] ? rowToCatalog(result.rows[0]) : null;
    },
    async getBySlug(slug: string): Promise<Catalog | null> {
      await ready;
      const result = await pool.query<CatalogRow>("SELECT * FROM catalogs WHERE slug = $1", [slug]);
      return result.rows[0] ? rowToCatalog(result.rows[0]) : null;
    },
    async list(): Promise<Catalog[]> {
      await ready;
      const result = await pool.query<CatalogRow>("SELECT * FROM catalogs");
      return result.rows.map(rowToCatalog);
    },
    async save(catalog: Catalog): Promise<void> {
      await ready;
      await pool.query(
        `INSERT INTO catalogs (id, slug, name, description, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           slug = EXCLUDED.slug,
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           created_at = EXCLUDED.created_at`,
        [catalog.id, catalog.slug, catalog.name, catalog.description, catalog.createdAt],
      );
    },
  };
}

/**
 * Real Postgres-backed ProductCatalogRepository -- the many-to-many
 * product<->catalog assignment table. Also runs CATALOG_SCHEMA_SQL itself on
 * construction, for the same idempotent-double-init reason as above.
 */
export function createPostgresProductCatalogRepository(pool: Pool): ProductCatalogRepository {
  const ready = pool.query(CATALOG_SCHEMA_SQL);

  return {
    async listCatalogIdsForProduct(productId: string): Promise<string[]> {
      await ready;
      const result = await pool.query<AssignmentRow>(
        "SELECT product_id, catalog_id FROM product_catalog_assignments WHERE product_id = $1",
        [productId],
      );
      return result.rows.map((row) => row.catalog_id);
    },
    async listProductIdsInCatalog(catalogId: string): Promise<string[]> {
      await ready;
      const result = await pool.query<AssignmentRow>(
        "SELECT product_id, catalog_id FROM product_catalog_assignments WHERE catalog_id = $1",
        [catalogId],
      );
      return result.rows.map((row) => row.product_id);
    },
    async assign(productId: string, catalogId: string): Promise<void> {
      await ready;
      await pool.query(
        `INSERT INTO product_catalog_assignments (product_id, catalog_id)
         VALUES ($1, $2)
         ON CONFLICT (product_id, catalog_id) DO NOTHING`,
        [productId, catalogId],
      );
    },
    async unassign(productId: string, catalogId: string): Promise<void> {
      await ready;
      await pool.query(
        "DELETE FROM product_catalog_assignments WHERE product_id = $1 AND catalog_id = $2",
        [productId, catalogId],
      );
    },
  };
}

import type { Pool } from "pg";

/**
 * Local structural copies of @mercatus-liber/service-areas' types.ts
 * (ServiceArea / ServiceAreaRepository / ServiceAreaProductRepository),
 * copied verbatim rather than imported. This package's package.json and
 * tsconfig.json are shared, actively-edited files -- 12 other agents are
 * concurrently wiring their own workspace dependencies into them right now,
 * and those files have already been observed to be clobbered mid-task by
 * another agent's overwrite. Per this story's FILE ISOLATION RULE (exactly
 * one new file, fully self-contained), this file deliberately avoids adding
 * a new cross-package dependency and instead duplicates the (tiny, stable)
 * shape it needs. TypeScript's structural typing makes this interchangeable
 * with the real @mercatus-liber/service-areas types at every call site.
 */
export interface ServiceArea {
  id: string;
  slug: string;
  name: string;
  region: string;
  description: string;
  phone: string | null;
}

export interface ServiceAreaRepository {
  get(id: string): Promise<ServiceArea | null>;
  getBySlug(slug: string): Promise<ServiceArea | null>;
  list(): Promise<ServiceArea[]>;
  save(area: ServiceArea): Promise<void>;
}

export interface ServiceAreaProductRepository {
  listServiceAreaIdsForProduct(productId: string): Promise<string[]>;
  listProductIdsInServiceArea(serviceAreaId: string): Promise<string[]>;
  assign(productId: string, serviceAreaId: string): Promise<void>;
  unassign(productId: string, serviceAreaId: string): Promise<void>;
}

interface ServiceAreaRow {
  id: string;
  slug: string;
  name: string;
  region: string;
  description: string;
  phone: string | null;
}

interface AssignmentRow {
  product_id: string;
  service_area_id: string;
}

/**
 * Self-contained DDL for this file's two tables -- deliberately NOT added to
 * schema.ts (see this package's src/categories.ts for the proven precedent
 * of a real entity repository + a real many-to-many assignment repository
 * living in their own file). Run on construction of either factory below so
 * either one alone is enough to make the tables exist; both statements are
 * idempotent (IF NOT EXISTS), so running it twice from both factories is
 * safe.
 */
const SERVICE_AREAS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS service_areas (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  region TEXT NOT NULL,
  description TEXT NOT NULL,
  phone TEXT
);
CREATE TABLE IF NOT EXISTS service_area_product_assignments (
  product_id TEXT NOT NULL,
  service_area_id TEXT NOT NULL REFERENCES service_areas(id),
  PRIMARY KEY (product_id, service_area_id)
);
CREATE INDEX IF NOT EXISTS idx_sapa_service_area_id ON service_area_product_assignments(service_area_id);
`;

function rowToServiceArea(row: ServiceAreaRow): ServiceArea {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    region: row.region,
    description: row.description,
    phone: row.phone,
  };
}

/**
 * Real Postgres-backed ServiceAreaRepository -- @mercatus-liber/service-areas'
 * ServiceAreaRepository was in-memory-only across every adapter, including
 * Postgres, until now. Mirrors createPostgresCategoryRepository in
 * categories.ts exactly (same get/getBySlug/list/save shape).
 */
export function createPostgresServiceAreaRepository(pool: Pool): ServiceAreaRepository {
  const ready = pool.query(SERVICE_AREAS_SCHEMA_SQL).then(() => undefined);

  return {
    async get(id: string): Promise<ServiceArea | null> {
      await ready;
      const result = await pool.query<ServiceAreaRow>("SELECT * FROM service_areas WHERE id = $1", [id]);
      return result.rows[0] ? rowToServiceArea(result.rows[0]) : null;
    },
    async getBySlug(slug: string): Promise<ServiceArea | null> {
      await ready;
      const result = await pool.query<ServiceAreaRow>("SELECT * FROM service_areas WHERE slug = $1", [slug]);
      return result.rows[0] ? rowToServiceArea(result.rows[0]) : null;
    },
    async list(): Promise<ServiceArea[]> {
      await ready;
      const result = await pool.query<ServiceAreaRow>("SELECT * FROM service_areas");
      return result.rows.map(rowToServiceArea);
    },
    async save(area: ServiceArea): Promise<void> {
      await ready;
      await pool.query(
        `INSERT INTO service_areas (id, slug, name, region, description, phone)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           slug = EXCLUDED.slug,
           name = EXCLUDED.name,
           region = EXCLUDED.region,
           description = EXCLUDED.description,
           phone = EXCLUDED.phone`,
        [area.id, area.slug, area.name, area.region, area.description, area.phone],
      );
    },
  };
}

/**
 * Real Postgres-backed ServiceAreaProductRepository -- the many-to-many
 * product<->service-area assignment table. Mirrors
 * createPostgresProductCategoryRepository in categories.ts exactly.
 */
export function createPostgresServiceAreaProductRepository(pool: Pool): ServiceAreaProductRepository {
  const ready = pool.query(SERVICE_AREAS_SCHEMA_SQL).then(() => undefined);

  return {
    async listServiceAreaIdsForProduct(productId: string): Promise<string[]> {
      await ready;
      const result = await pool.query<AssignmentRow>(
        "SELECT product_id, service_area_id FROM service_area_product_assignments WHERE product_id = $1",
        [productId],
      );
      return result.rows.map((row) => row.service_area_id);
    },
    async listProductIdsInServiceArea(serviceAreaId: string): Promise<string[]> {
      await ready;
      const result = await pool.query<AssignmentRow>(
        "SELECT product_id, service_area_id FROM service_area_product_assignments WHERE service_area_id = $1",
        [serviceAreaId],
      );
      return result.rows.map((row) => row.product_id);
    },
    async assign(productId: string, serviceAreaId: string): Promise<void> {
      await ready;
      await pool.query(
        `INSERT INTO service_area_product_assignments (product_id, service_area_id)
         VALUES ($1, $2)
         ON CONFLICT (product_id, service_area_id) DO NOTHING`,
        [productId, serviceAreaId],
      );
    },
    async unassign(productId: string, serviceAreaId: string): Promise<void> {
      await ready;
      await pool.query(
        "DELETE FROM service_area_product_assignments WHERE product_id = $1 AND service_area_id = $2",
        [productId, serviceAreaId],
      );
    },
  };
}

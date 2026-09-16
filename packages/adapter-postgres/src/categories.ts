import type { Pool } from "pg";
import type { Category, CategoryRepository, ProductCategoryRepository } from "@mercatus-liber/marketing-catalog";

interface CategoryRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  parent_id: string | null;
}

interface AssignmentRow {
  product_id: string;
  category_id: string;
}

function rowToCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    parentId: row.parent_id,
  };
}

/**
 * Real Postgres-backed CategoryRepository -- categories are product data
 * (see @mercatus-liber/marketing-catalog's types.ts), so they live in the
 * same database as products/skus, not in-memory. Callers are expected to
 * have already run SCHEMA_SQL against `pool` (createPostgresAdapter does
 * this) -- these factories stay plain closures over pool.query, matching
 * createPostgresAdapter's products/skus/attributes repositories, rather
 * than each re-running schema DDL on every call.
 */
export function createPostgresCategoryRepository(pool: Pool): CategoryRepository {
  return {
    async get(id: string): Promise<Category | null> {
      const result = await pool.query<CategoryRow>("SELECT * FROM categories WHERE id = $1", [id]);
      return result.rows[0] ? rowToCategory(result.rows[0]) : null;
    },
    async getBySlug(slug: string): Promise<Category | null> {
      const result = await pool.query<CategoryRow>("SELECT * FROM categories WHERE slug = $1", [slug]);
      return result.rows[0] ? rowToCategory(result.rows[0]) : null;
    },
    async list(): Promise<Category[]> {
      const result = await pool.query<CategoryRow>("SELECT * FROM categories");
      return result.rows.map(rowToCategory);
    },
    async save(category: Category): Promise<void> {
      await pool.query(
        `INSERT INTO categories (id, slug, title, description, parent_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           slug = EXCLUDED.slug,
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           parent_id = EXCLUDED.parent_id`,
        [category.id, category.slug, category.title, category.description, category.parentId],
      );
    },
  };
}

/**
 * Real Postgres-backed ProductCategoryRepository -- the many-to-many
 * product<->category assignment table. No FK to `products` (see this
 * package's schema.ts comment): this stays a narrow, catalog-agnostic
 * interface per @mercatus-liber/marketing-catalog's own doc comment.
 */
export function createPostgresProductCategoryRepository(pool: Pool): ProductCategoryRepository {
  return {
    async listCategoryIdsForProduct(productId: string): Promise<string[]> {
      const result = await pool.query<AssignmentRow>(
        "SELECT product_id, category_id FROM product_category_assignments WHERE product_id = $1",
        [productId],
      );
      return result.rows.map((row) => row.category_id);
    },
    async listProductIdsInCategory(categoryId: string): Promise<string[]> {
      const result = await pool.query<AssignmentRow>(
        "SELECT product_id, category_id FROM product_category_assignments WHERE category_id = $1",
        [categoryId],
      );
      return result.rows.map((row) => row.product_id);
    },
    async assign(productId: string, categoryId: string): Promise<void> {
      await pool.query(
        `INSERT INTO product_category_assignments (product_id, category_id)
         VALUES ($1, $2)
         ON CONFLICT (product_id, category_id) DO NOTHING`,
        [productId, categoryId],
      );
    },
    async unassign(productId: string, categoryId: string): Promise<void> {
      await pool.query(
        "DELETE FROM product_category_assignments WHERE product_id = $1 AND category_id = $2",
        [productId, categoryId],
      );
    },
  };
}

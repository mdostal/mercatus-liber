import type Database from "better-sqlite3";
import { SCHEMA_SQL } from "./schema.js";

/**
 * Mirrors @mercatus-liber/marketing-catalog's Category/CategoryRepository/
 * ProductCategoryRepository exactly (field-for-field, method-for-method) --
 * duplicated here rather than imported. marketing-catalog already declares
 * this package as a devDependency (for its own future integration tests
 * against a real SQLite-backed repository), so a real `dependencies` edge
 * the other way, adapter-sqlite -> marketing-catalog, would make the two
 * packages depend on each other and deadlock turbo.json's `"dependsOn":
 * ["^build"]` topological build graph. marketing-catalog's own
 * CatalogAttributeLookup interface (see its types.ts) already uses this same
 * structural-typing-over-a-real-import trick to avoid an analogous cycle with
 * @mercatus-liber/catalog, so this isn't a new pattern for this codebase.
 * TypeScript's structural typing means a plain object built to this shape
 * satisfies marketing-catalog's real interfaces with zero runtime coupling;
 * the sibling story that wires marketingCatalog to these repositories is
 * free to import these functions and assign their result directly to a
 * CategoryRepository/ProductCategoryRepository-typed variable.
 */
export interface Category {
  id: string;
  slug: string;
  title: string;
  description: string;
  /** null for a top-level category. */
  parentId: string | null;
}

export interface CategoryRepository {
  get(id: string): Promise<Category | null>;
  getBySlug(slug: string): Promise<Category | null>;
  list(): Promise<Category[]>;
  save(category: Category): Promise<void>;
}

export interface ProductCategoryRepository {
  listCategoryIdsForProduct(productId: string): Promise<string[]>;
  listProductIdsInCategory(categoryId: string): Promise<string[]>;
  assign(productId: string, categoryId: string): Promise<void>;
  unassign(productId: string, categoryId: string): Promise<void>;
}

interface CategoryRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  parent_id: string | null;
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
 * Real SQLite-backed CategoryRepository. `db` is a `better-sqlite3` handle,
 * already open (as returned by `new Database(path)`) -- this function runs
 * SCHEMA_SQL itself so it's independently usable without first calling
 * createSqliteAdapter; that CREATE TABLE IF NOT EXISTS DDL is idempotent, so
 * running it again against a db createSqliteAdapter already initialized is a
 * no-op.
 */
export function createSqliteCategoryRepository(db: Database.Database): CategoryRepository {
  db.exec(SCHEMA_SQL);

  return {
    async get(id: string): Promise<Category | null> {
      const row = db.prepare("SELECT * FROM categories WHERE id = ?").get(id) as
        | CategoryRow
        | undefined;
      return row ? rowToCategory(row) : null;
    },
    async getBySlug(slug: string): Promise<Category | null> {
      const row = db.prepare("SELECT * FROM categories WHERE slug = ?").get(slug) as
        | CategoryRow
        | undefined;
      return row ? rowToCategory(row) : null;
    },
    async list(): Promise<Category[]> {
      const rows = db.prepare("SELECT * FROM categories").all() as CategoryRow[];
      return rows.map(rowToCategory);
    },
    async save(category: Category): Promise<void> {
      db.prepare(
        `INSERT INTO categories (id, slug, title, description, parent_id)
         VALUES (@id, @slug, @title, @description, @parentId)
         ON CONFLICT(id) DO UPDATE SET
           slug = excluded.slug,
           title = excluded.title,
           description = excluded.description,
           parent_id = excluded.parent_id`,
      ).run({
        id: category.id,
        slug: category.slug,
        title: category.title,
        description: category.description,
        parentId: category.parentId,
      });
    },
  };
}

/**
 * Real SQLite-backed ProductCategoryRepository, the many-to-many product<->
 * category assignment table. Same standalone-usable/idempotent-schema-init
 * shape as createSqliteCategoryRepository above.
 */
export function createSqliteProductCategoryRepository(
  db: Database.Database,
): ProductCategoryRepository {
  db.exec(SCHEMA_SQL);

  return {
    async listCategoryIdsForProduct(productId: string): Promise<string[]> {
      const rows = db
        .prepare("SELECT category_id FROM product_category_assignments WHERE product_id = ?")
        .all(productId) as { category_id: string }[];
      return rows.map((r) => r.category_id);
    },
    async listProductIdsInCategory(categoryId: string): Promise<string[]> {
      const rows = db
        .prepare("SELECT product_id FROM product_category_assignments WHERE category_id = ?")
        .all(categoryId) as { product_id: string }[];
      return rows.map((r) => r.product_id);
    },
    async assign(productId: string, categoryId: string): Promise<void> {
      db.prepare(
        `INSERT OR IGNORE INTO product_category_assignments (product_id, category_id)
         VALUES (?, ?)`,
      ).run(productId, categoryId);
    },
    async unassign(productId: string, categoryId: string): Promise<void> {
      db.prepare(
        "DELETE FROM product_category_assignments WHERE product_id = ? AND category_id = ?",
      ).run(productId, categoryId);
    },
  };
}

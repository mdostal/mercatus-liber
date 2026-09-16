import type { Pool } from "pg";
import type {
  CatalogPersistenceAdapter,
  IdentifyingAttribute,
  Product,
  ProductAttribute,
  ProductAttributeRepository,
  ProductFilter,
  ProductRepository,
  ProductStatus,
  Sku,
  SkuRepository,
} from "@mercatus-liber/core";
import { SCHEMA_SQL } from "./schema.js";

export { createPostgresCategoryRepository, createPostgresProductCategoryRepository } from "./categories.js";

interface ProductRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  identifying_attribute_keys: string[]; // JSONB -- already parsed by the pg driver
  status: string;
  images: Product["images"] | null; // JSONB, image-cdn epic
}

interface SkuRow {
  id: string;
  product_id: string;
  identifying_attributes: IdentifyingAttribute[]; // JSONB
  price_amount: number;
  price_currency: string;
  status: string;
}

interface AttributeRow {
  product_id: string;
  key: string;
  value: ProductAttribute["value"]; // JSONB
  facetable: boolean;
}

function rowToProduct(row: ProductRow): Product {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    identifyingAttributeKeys: row.identifying_attribute_keys,
    status: row.status as ProductStatus,
    ...(row.images ? { images: row.images } : {}),
  };
}

function rowToSku(row: SkuRow): Sku {
  return {
    id: row.id,
    productId: row.product_id,
    identifyingAttributes: row.identifying_attributes,
    price: { amount: row.price_amount, currency: row.price_currency },
    status: row.status as ProductStatus,
  };
}

function rowToAttribute(row: AttributeRow): ProductAttribute {
  return {
    productId: row.product_id,
    key: row.key,
    value: row.value,
    facetable: row.facetable,
  };
}

/**
 * Postgres reference persistence adapter (subsystem 00's second reference
 * implementation, per docs/ARCHITECTURE.md principle 2). Public surface is
 * exactly CatalogPersistenceAdapter -- no pg-specific type is exported.
 * Callers own creating/pooling the pg.Pool; this adapter only runs the
 * schema DDL (idempotent, CREATE ... IF NOT EXISTS) and queries against it.
 */
export async function createPostgresAdapter(pool: Pool): Promise<CatalogPersistenceAdapter> {
  await pool.query(SCHEMA_SQL);

  const products: ProductRepository = {
    async get(id: string): Promise<Product | null> {
      const result = await pool.query<ProductRow>("SELECT * FROM products WHERE id = $1", [id]);
      return result.rows[0] ? rowToProduct(result.rows[0]) : null;
    },
    async getBySlug(slug: string): Promise<Product | null> {
      const result = await pool.query<ProductRow>("SELECT * FROM products WHERE slug = $1", [slug]);
      return result.rows[0] ? rowToProduct(result.rows[0]) : null;
    },
    async list(filter?: ProductFilter): Promise<Product[]> {
      const clauses: string[] = [];
      const params: unknown[] = [];
      if (filter?.status) {
        params.push(filter.status);
        clauses.push(`status = $${params.length}`);
      }
      if (filter?.slug) {
        params.push(filter.slug);
        clauses.push(`slug = $${params.length}`);
      }
      const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
      const result = await pool.query<ProductRow>(`SELECT * FROM products${where}`, params);
      return result.rows.map(rowToProduct);
    },
    async save(product: Product): Promise<void> {
      await pool.query(
        `INSERT INTO products (id, slug, title, description, identifying_attribute_keys, status, images)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           slug = EXCLUDED.slug,
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           identifying_attribute_keys = EXCLUDED.identifying_attribute_keys,
           status = EXCLUDED.status,
           images = EXCLUDED.images`,
        [
          product.id,
          product.slug,
          product.title,
          product.description,
          JSON.stringify(product.identifyingAttributeKeys),
          product.status,
          product.images ? JSON.stringify(product.images) : null,
        ],
      );
    },
  };

  const skus: SkuRepository = {
    async get(id: string): Promise<Sku | null> {
      const result = await pool.query<SkuRow>("SELECT * FROM skus WHERE id = $1", [id]);
      return result.rows[0] ? rowToSku(result.rows[0]) : null;
    },
    async listByProduct(productId: string): Promise<Sku[]> {
      const result = await pool.query<SkuRow>("SELECT * FROM skus WHERE product_id = $1", [productId]);
      return result.rows.map(rowToSku);
    },
    async save(sku: Sku): Promise<void> {
      await pool.query(
        `INSERT INTO skus (id, product_id, identifying_attributes, price_amount, price_currency, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           product_id = EXCLUDED.product_id,
           identifying_attributes = EXCLUDED.identifying_attributes,
           price_amount = EXCLUDED.price_amount,
           price_currency = EXCLUDED.price_currency,
           status = EXCLUDED.status`,
        [
          sku.id,
          sku.productId,
          JSON.stringify(sku.identifyingAttributes),
          sku.price.amount,
          sku.price.currency,
          sku.status,
        ],
      );
    },
  };

  const attributes: ProductAttributeRepository = {
    async listByProduct(productId: string): Promise<ProductAttribute[]> {
      const result = await pool.query<AttributeRow>(
        "SELECT * FROM product_attributes WHERE product_id = $1",
        [productId],
      );
      return result.rows.map(rowToAttribute);
    },
    async save(attribute: ProductAttribute): Promise<void> {
      await pool.query(
        `INSERT INTO product_attributes (product_id, key, value, facetable)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (product_id, key) DO UPDATE SET
           value = EXCLUDED.value,
           facetable = EXCLUDED.facetable`,
        [attribute.productId, attribute.key, JSON.stringify(attribute.value), attribute.facetable],
      );
    },
    async remove(productId: string, key: string): Promise<void> {
      await pool.query("DELETE FROM product_attributes WHERE product_id = $1 AND key = $2", [productId, key]);
    },
  };

  return { products, skus, attributes };
}

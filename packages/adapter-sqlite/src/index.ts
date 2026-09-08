import Database from "better-sqlite3";
import type {
  CatalogPersistenceAdapter,
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

interface ProductRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  identifying_attribute_keys: string;
  status: string;
}

interface SkuRow {
  id: string;
  product_id: string;
  identifying_attributes: string;
  price_amount: number;
  price_currency: string;
  status: string;
}

interface AttributeRow {
  product_id: string;
  key: string;
  value: string;
  facetable: number;
}

function rowToProduct(row: ProductRow): Product {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    identifyingAttributeKeys: JSON.parse(row.identifying_attribute_keys) as string[],
    status: row.status as ProductStatus,
  };
}

function rowToSku(row: SkuRow): Sku {
  return {
    id: row.id,
    productId: row.product_id,
    identifyingAttributes: JSON.parse(row.identifying_attributes) as Sku["identifyingAttributes"],
    price: { amount: row.price_amount, currency: row.price_currency },
    status: row.status as ProductStatus,
  };
}

function rowToAttribute(row: AttributeRow): ProductAttribute {
  return {
    productId: row.product_id,
    key: row.key,
    value: JSON.parse(row.value) as ProductAttribute["value"],
    facetable: row.facetable === 1,
  };
}

/**
 * Reference SQLite persistence adapter. Public surface is exactly the
 * CatalogPersistenceAdapter interface from @mercatus-liber/core -- no SQLite-specific type
 * (Database, statements, row shapes) is exported. Swapping this for
 * @mercatus-liber/adapter-postgres must never require a caller-side change.
 */
export function createSqliteAdapter(path: string): CatalogPersistenceAdapter {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA_SQL);

  const products: ProductRepository = {
    async get(id: string): Promise<Product | null> {
      const row = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as
        | ProductRow
        | undefined;
      return row ? rowToProduct(row) : null;
    },
    async getBySlug(slug: string): Promise<Product | null> {
      const row = db.prepare("SELECT * FROM products WHERE slug = ?").get(slug) as
        | ProductRow
        | undefined;
      return row ? rowToProduct(row) : null;
    },
    async list(filter?: ProductFilter): Promise<Product[]> {
      const clauses: string[] = [];
      const params: unknown[] = [];
      if (filter?.status) {
        clauses.push("status = ?");
        params.push(filter.status);
      }
      if (filter?.slug) {
        clauses.push("slug = ?");
        params.push(filter.slug);
      }
      const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
      const rows = db.prepare(`SELECT * FROM products${where}`).all(...params) as ProductRow[];
      return rows.map(rowToProduct);
    },
    async save(product: Product): Promise<void> {
      db.prepare(
        `INSERT INTO products (id, slug, title, description, identifying_attribute_keys, status)
         VALUES (@id, @slug, @title, @description, @identifyingAttributeKeys, @status)
         ON CONFLICT(id) DO UPDATE SET
           slug = excluded.slug,
           title = excluded.title,
           description = excluded.description,
           identifying_attribute_keys = excluded.identifying_attribute_keys,
           status = excluded.status`,
      ).run({
        id: product.id,
        slug: product.slug,
        title: product.title,
        description: product.description,
        identifyingAttributeKeys: JSON.stringify(product.identifyingAttributeKeys),
        status: product.status,
      });
    },
  };

  const skus: SkuRepository = {
    async get(id: string): Promise<Sku | null> {
      const row = db.prepare("SELECT * FROM skus WHERE id = ?").get(id) as SkuRow | undefined;
      return row ? rowToSku(row) : null;
    },
    async listByProduct(productId: string): Promise<Sku[]> {
      const rows = db
        .prepare("SELECT * FROM skus WHERE product_id = ?")
        .all(productId) as SkuRow[];
      return rows.map(rowToSku);
    },
    async save(sku: Sku): Promise<void> {
      db.prepare(
        `INSERT INTO skus (id, product_id, identifying_attributes, price_amount, price_currency, status)
         VALUES (@id, @productId, @identifyingAttributes, @priceAmount, @priceCurrency, @status)
         ON CONFLICT(id) DO UPDATE SET
           product_id = excluded.product_id,
           identifying_attributes = excluded.identifying_attributes,
           price_amount = excluded.price_amount,
           price_currency = excluded.price_currency,
           status = excluded.status`,
      ).run({
        id: sku.id,
        productId: sku.productId,
        identifyingAttributes: JSON.stringify(sku.identifyingAttributes),
        priceAmount: sku.price.amount,
        priceCurrency: sku.price.currency,
        status: sku.status,
      });
    },
  };

  const attributes: ProductAttributeRepository = {
    async listByProduct(productId: string): Promise<ProductAttribute[]> {
      const rows = db
        .prepare("SELECT * FROM product_attributes WHERE product_id = ?")
        .all(productId) as AttributeRow[];
      return rows.map(rowToAttribute);
    },
    async save(attribute: ProductAttribute): Promise<void> {
      db.prepare(
        `INSERT INTO product_attributes (product_id, key, value, facetable)
         VALUES (@productId, @key, @value, @facetable)
         ON CONFLICT(product_id, key) DO UPDATE SET
           value = excluded.value,
           facetable = excluded.facetable`,
      ).run({
        productId: attribute.productId,
        key: attribute.key,
        value: JSON.stringify(attribute.value),
        facetable: attribute.facetable ? 1 : 0,
      });
    },
    async remove(productId: string, key: string): Promise<void> {
      db.prepare("DELETE FROM product_attributes WHERE product_id = ? AND key = ?").run(
        productId,
        key,
      );
    },
  };

  return { products, skus, attributes };
}

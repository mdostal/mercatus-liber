import type {
  AttributeValue,
  CatalogPersistenceAdapter,
  EventBus,
  IdentifyingAttribute,
  Money,
  Product,
  ProductAttribute,
  ProductFilter,
  Sku,
} from "@mercatus-liber/core";
import { randomUUID } from "node:crypto";
import { attributesKey, cartesianProduct } from "./variant-utils.js";

export interface NewProductInput {
  slug: string;
  title: string;
  description: string;
  identifyingAttributeKeys: string[];
}

export interface UpdateProductInput {
  slug?: string;
  title?: string;
  description?: string;
  identifyingAttributeKeys?: string[];
}

export interface NewSkuInput {
  productId: string;
  identifyingAttributes: IdentifyingAttribute[];
  price: Money;
}

export class ProductNotFoundError extends Error {
  constructor(id: string) {
    super(`Product not found: ${id}`);
    this.name = "ProductNotFoundError";
  }
}

export class InvalidIdentifyingAttributesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidIdentifyingAttributesError";
  }
}

export interface CatalogService {
  createProduct(input: NewProductInput): Promise<Product>;
  updateProduct(id: string, patch: UpdateProductInput): Promise<Product>;
  archiveProduct(id: string): Promise<void>;
  getProduct(id: string): Promise<Product | null>;
  getProductBySlug(slug: string): Promise<Product | null>;
  listProducts(filter?: ProductFilter): Promise<Product[]>;

  createSku(input: NewSkuInput): Promise<Sku>;
  getSku(id: string): Promise<Sku | null>;
  listSkusByProduct(productId: string): Promise<Sku[]>;
  generateSkus(
    productId: string,
    valuesByKey: Record<string, AttributeValue[]>,
    price: Money,
    exclude?: IdentifyingAttribute[][],
  ): Promise<Sku[]>;
  resolveVariant(productId: string, selection: IdentifyingAttribute[]): Promise<Sku | null>;

  setAttribute(attribute: ProductAttribute): Promise<void>;
  listAttributes(productId: string): Promise<ProductAttribute[]>;
  removeAttribute(productId: string, key: string): Promise<void>;
}

function assertIdentifyingKeysMatch(product: Product, attrs: IdentifyingAttribute[]): void {
  const expected = new Set(product.identifyingAttributeKeys);
  const actual = new Set(attrs.map((a) => a.key));
  const missing = [...expected].filter((k) => !actual.has(k));
  const unexpected = [...actual].filter((k) => !expected.has(k));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new InvalidIdentifyingAttributesError(
      `SKU identifying attributes for product "${product.id}" must exactly match ` +
        `[${product.identifyingAttributeKeys.join(", ")}]. Missing: [${missing.join(", ")}], ` +
        `unexpected: [${unexpected.join(", ")}].`,
    );
  }
}

export function createCatalogService(deps: {
  persistence: CatalogPersistenceAdapter;
  events: EventBus;
}): CatalogService {
  const { persistence, events } = deps;

  async function requireProduct(id: string): Promise<Product> {
    const product = await persistence.products.get(id);
    if (!product) throw new ProductNotFoundError(id);
    return product;
  }

  return {
    async createProduct(input) {
      const product: Product = {
        id: randomUUID(),
        slug: input.slug,
        title: input.title,
        description: input.description,
        identifyingAttributeKeys: input.identifyingAttributeKeys,
        status: "draft",
      };
      await persistence.products.save(product);
      await events.publish("catalog.product.created", { id: product.id });
      return product;
    },

    async updateProduct(id, patch) {
      const existing = await requireProduct(id);
      const updated: Product = { ...existing, ...patch };
      await persistence.products.save(updated);
      await events.publish("catalog.product.updated", { id: updated.id });
      return updated;
    },

    async archiveProduct(id) {
      const existing = await requireProduct(id);
      await persistence.products.save({ ...existing, status: "archived" });
      await events.publish("catalog.product.archived", { id });
    },

    async getProduct(id) {
      return persistence.products.get(id);
    },

    async getProductBySlug(slug) {
      return persistence.products.getBySlug(slug);
    },

    async listProducts(filter) {
      return persistence.products.list(filter);
    },

    async createSku(input) {
      const product = await requireProduct(input.productId);
      assertIdentifyingKeysMatch(product, input.identifyingAttributes);
      const sku: Sku = {
        id: randomUUID(),
        productId: input.productId,
        identifyingAttributes: input.identifyingAttributes,
        price: input.price,
        status: "active",
      };
      await persistence.skus.save(sku);
      await events.publish("catalog.sku.created", { id: sku.id, productId: sku.productId });
      return sku;
    },

    async getSku(id) {
      return persistence.skus.get(id);
    },

    async listSkusByProduct(productId) {
      return persistence.skus.listByProduct(productId);
    },

    async generateSkus(productId, valuesByKey, price, exclude = []) {
      const product = await requireProduct(productId);
      const providedKeys = new Set(Object.keys(valuesByKey));
      const expectedKeys = new Set(product.identifyingAttributeKeys);
      const missing = [...expectedKeys].filter((k) => !providedKeys.has(k));
      const unexpected = [...providedKeys].filter((k) => !expectedKeys.has(k));
      if (missing.length > 0 || unexpected.length > 0) {
        throw new InvalidIdentifyingAttributesError(
          `generateSkus valuesByKey for product "${productId}" must exactly cover ` +
            `[${product.identifyingAttributeKeys.join(", ")}]. Missing: [${missing.join(", ")}], ` +
            `unexpected: [${unexpected.join(", ")}].`,
        );
      }

      const combinations = cartesianProduct(valuesByKey, exclude);
      const created: Sku[] = [];
      for (const identifyingAttributes of combinations) {
        const sku: Sku = {
          id: randomUUID(),
          productId,
          identifyingAttributes,
          price,
          status: "active",
        };
        await persistence.skus.save(sku);
        await events.publish("catalog.sku.created", { id: sku.id, productId });
        created.push(sku);
      }
      return created;
    },

    async resolveVariant(productId, selection) {
      const skus = await persistence.skus.listByProduct(productId);
      const targetKey = attributesKey(selection);
      return skus.find((sku) => attributesKey(sku.identifyingAttributes) === targetKey) ?? null;
    },

    async setAttribute(attribute) {
      await persistence.attributes.save(attribute);
    },

    async listAttributes(productId) {
      return persistence.attributes.listByProduct(productId);
    },

    async removeAttribute(productId, key) {
      await persistence.attributes.remove(productId, key);
    },
  };
}

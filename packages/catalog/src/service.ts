import type {
  AttributeValue,
  AvailabilityStatus,
  CatalogPersistenceAdapter,
  EventBus,
  IdentifyingAttribute,
  Money,
  Product,
  ProductAttribute,
  ProductFilter,
  ProductImage,
  ProductStatus,
  ProductVideo,
  Schedule,
  Sku,
} from "@mercatus-liber/core";
import { lifecycle, normalizeSchedule, type Lifecycle } from "@mercatus-liber/core";
import { randomUUID } from "node:crypto";
import { CatalogNotFoundError, DuplicateCatalogSlugError } from "./catalog-entity.js";
import type { Catalog, CatalogHero, CatalogRepository, CatalogSection, ProductCatalogRepository } from "./catalog-entity.js";
import { attributesKey, cartesianProduct } from "./variant-utils.js";

export interface NewCatalogInput {
  slug: string;
  name: string;
  description: string;
  /** "sales" for a line or collection; default "master". */
  kind?: "master" | "sales";
  /** A sales catalog's store (master catalog). */
  masterCatalogId?: string;
  status?: ProductStatus;
  activeFrom?: string | null;
  activeTo?: string | null;
  hero?: CatalogHero;
  /** Ordered sections. Their products are added to the catalog. */
  sections?: CatalogSection[];
}

export type UpdateCatalogInput = Partial<Omit<NewCatalogInput, "slug">>;

/** A line's landing page: the catalog, where it is in its schedule, and its products by section. */
export interface CatalogLanding {
  catalog: Catalog;
  lifecycle: Lifecycle;
  /** In the catalog's own order; only active products. Empty sections are kept, so a line can show its sections before products exist. */
  sections: (CatalogSection & { products: Product[] })[];
  /** Active products in the catalog that no section names, in no particular order. */
  otherProducts: Product[];
}

export interface NewProductInput {
  slug: string;
  title: string;
  description: string;
  identifyingAttributeKeys: string[];
  /** image-cdn epic: optional/additive, see Product.images's own doc comment (@mercatus-liber/core). Omitted entirely by every pre-existing caller -- zero regression. */
  images?: ProductImage[];
  /** product-media-attribution epic: optional/additive, see Product.videos/viewerUrl/license's own doc comments (@mercatus-liber/core). */
  videos?: ProductVideo[];
  viewerUrl?: string;
  license?: string;
  /** When it's on sale (ISO 8601 instants; absent or null for no limit). See Schedule and lifecycle in @mercatus-liber/core. */
  activeFrom?: string | null;
  activeTo?: string | null;
}

export interface UpdateProductInput {
  slug?: string;
  title?: string;
  description?: string;
  identifyingAttributeKeys?: string[];
  images?: ProductImage[];
  videos?: ProductVideo[];
  viewerUrl?: string;
  license?: string;
  /** When it's on sale (ISO 8601 instants; absent or null for no limit). See Schedule and lifecycle in @mercatus-liber/core. */
  activeFrom?: string | null;
  activeTo?: string | null;
}

export interface NewSkuInput {
  productId: string;
  identifyingAttributes: IdentifyingAttribute[];
  price: Money;
  /** sku-images epic: optional/additive, see Sku.images's own doc comment (@mercatus-liber/core). */
  images?: ProductImage[];
  /** sku-availability-status epic: optional/additive, see Sku.availabilityStatus's own doc comment (@mercatus-liber/core). */
  availabilityStatus?: AvailabilityStatus;
  availabilityNote?: string;
  /** Default "active". A "draft" SKU can't be added to a cart until it is made active. */
  status?: ProductStatus;
  /** When it's on sale (ISO 8601 instants; absent or null for no limit). See Schedule and lifecycle in @mercatus-liber/core. */
  activeFrom?: string | null;
  activeTo?: string | null;
}

/** Patchable fields on an existing Sku -- deliberately excludes productId/identifyingAttributes, which never change after creation (same "id is immutable" discipline as updateProduct). */
export interface UpdateSkuInput {
  price?: Money;
  status?: ProductStatus;
  images?: ProductImage[];
  availabilityStatus?: AvailabilityStatus;
  availabilityNote?: string;
  /** When it's on sale (ISO 8601 instants; absent or null for no limit). See Schedule and lifecycle in @mercatus-liber/core. */
  activeFrom?: string | null;
  activeTo?: string | null;
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
  /** draft -> active. See docs/subsystems/01-catalog.md open question 1 -- no separate "active but hidden" state yet. */
  publishProduct(id: string): Promise<Product>;
  /** active -> draft: takes a product off sale without archiving it, for example to hold it until a scheduled drop. Publishes catalog.product.updated, like publishProduct. */
  unpublishProduct(id: string): Promise<Product>;
  archiveProduct(id: string): Promise<void>;
  getProduct(id: string): Promise<Product | null>;
  getProductBySlug(slug: string): Promise<Product | null>;
  listProducts(filter?: ProductFilter): Promise<Product[]>;

  createSku(input: NewSkuInput): Promise<Sku>;
  /** Merges patch into an existing SKU; null if no SKU has this id. Id/productId/identifyingAttributes are never overwritten. The realistic sku-images workflow: generateSkus() to create the grid, then updateSku() per SKU to set its own photo. */
  updateSku(id: string, patch: UpdateSkuInput): Promise<Sku | null>;
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

  /**
   * Real, named, addressable Catalog entity -- many-to-many with Product
   * (see catalog-entity.ts's doc comment). A product could belong to more
   * than one catalog.
   */
  createCatalog(input: NewCatalogInput): Promise<Catalog>;
  getCatalog(id: string): Promise<Catalog | null>;
  getCatalogBySlug(slug: string): Promise<Catalog | null>;
  /** Optionally only one kind, and/or only one store's sales catalogs. */
  listCatalogs(filter?: { kind?: "master" | "sales"; masterCatalogId?: string }): Promise<Catalog[]>;
  updateCatalog(id: string, patch: UpdateCatalogInput): Promise<Catalog>;
  /** A catalog's landing page data by id or slug, or null. Works with no products. */
  getCatalogLanding(idOrSlug: string, now?: Date): Promise<CatalogLanding | null>;
  /**
   * Gives every product in a sales catalog a window covering all the
   * scheduled sales catalogs it belongs to (earliest start to latest end; an
   * open end anywhere leaves that end open), so a product shared by
   * overlapping lines stays on sale through each. A product can then be
   * brought back on its own by clearing its activeTo.
   */
  applyCatalogWindowToProducts(catalogId: string): Promise<{ updated: string[] }>;

  assignProductToCatalog(productId: string, catalogId: string): Promise<void>;
  unassignProductFromCatalog(productId: string, catalogId: string): Promise<void>;
  listCatalogIdsForProduct(productId: string): Promise<string[]>;
  listProductIdsInCatalog(catalogId: string): Promise<string[]>;
  /** Resolves catalog-assignment ids through this same service's getProduct, filtering out nulls -- the same compose-lookups idiom used throughout this repo (e.g. the reference storefront's listProductIdsInCategory -> Promise.all(ids.map(getProduct)) -> filter-null). */
  listProductsInCatalog(catalogId: string): Promise<Product[]>;
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
  catalogs: CatalogRepository;
  productCatalogs: ProductCatalogRepository;
}): CatalogService {
  const { persistence, events, catalogs, productCatalogs } = deps;

  /** A catalog with the optional fields from `input` applied: schedule checked and normalised, absent fields left out. */
  function withCatalogFields(base: Catalog, input: Omit<UpdateCatalogInput, "name" | "description">): Catalog {
    const { kind: _k, masterCatalogId: _m, status: _s, hero: _h, sections: _sec, activeFrom: _f, activeTo: _t, ...core } = base;
    for (const section of input.sections ?? []) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(section.slug)) throw new Error(`Section slug "${section.slug}" may use only lowercase letters, digits and "-".`);
    }
    if (input.sections && new Set(input.sections.map((x) => x.slug)).size !== input.sections.length) throw new Error("Section slugs must be unique within a catalog.");
    return {
      ...core,
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.masterCatalogId ? { masterCatalogId: input.masterCatalogId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.hero ? { hero: input.hero } : {}),
      ...(input.sections ? { sections: input.sections.map((x) => ({ slug: x.slug, title: x.title, productIds: [...new Set(x.productIds)] })) } : {}),
      ...scheduleOf(input),
    };
  }

  /** Refuses sections naming a product that doesn't exist, before anything is saved. */
  async function checkSectionProducts(catalog: Catalog): Promise<void> {
    for (const section of catalog.sections ?? []) {
      for (const productId of section.productIds) {
        if (!(await persistence.products.get(productId))) throw new ProductNotFoundError(productId);
      }
    }
  }

  /** Every product a catalog's sections name is in the catalog. */
  async function assignSectionProducts(catalog: Catalog): Promise<void> {
    for (const section of catalog.sections ?? []) {
      for (const productId of section.productIds) await productCatalogs.assign(productId, catalog.id);
    }
  }

  async function requireCatalog(id: string): Promise<Catalog> {
    const catalog = await catalogs.get(id);
    if (!catalog) throw new CatalogNotFoundError(id);
    return catalog;
  }

  /** The schedule fields to store: checked and normalised, and left out entirely when there's no window. */
  function scheduleOf(input: Schedule): Schedule {
    const { activeFrom, activeTo } = normalizeSchedule(input);
    return { ...(activeFrom ? { activeFrom } : {}), ...(activeTo ? { activeTo } : {}) };
  }

  /** `entity` with its schedule replaced by `schedule`'s (an open end drops the field). */
  function withSchedule<T extends Schedule>(entity: T, schedule: Schedule): T {
    const { activeFrom: _f, activeTo: _t, ...rest } = entity;
    return { ...rest, ...scheduleOf(schedule) } as T;
  }

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
        ...(input.images ? { images: input.images } : {}),
        ...(input.videos ? { videos: input.videos } : {}),
        ...(input.viewerUrl ? { viewerUrl: input.viewerUrl } : {}),
        ...(input.license ? { license: input.license } : {}),
        ...scheduleOf(input),
      };
      await persistence.products.save(product);
      await events.publish("catalog.product.created", { id: product.id });
      return product;
    },

    async updateProduct(id, patch) {
      const existing = await requireProduct(id);
      const updated: Product = withSchedule({ ...existing, ...patch }, { ...existing, ...patch });
      await persistence.products.save(updated);
      await events.publish("catalog.product.updated", { id: updated.id });
      return updated;
    },

    async publishProduct(id) {
      const existing = await requireProduct(id);
      const updated: Product = { ...existing, status: "active" };
      await persistence.products.save(updated);
      await events.publish("catalog.product.updated", { id });
      return updated;
    },

    async unpublishProduct(id) {
      const existing = await requireProduct(id);
      const updated: Product = { ...existing, status: "draft" };
      await persistence.products.save(updated);
      await events.publish("catalog.product.updated", { id });
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
        status: input.status ?? "active",
        ...(input.images ? { images: input.images } : {}),
        ...(input.availabilityStatus ? { availabilityStatus: input.availabilityStatus } : {}),
        ...(input.availabilityNote ? { availabilityNote: input.availabilityNote } : {}),
        ...scheduleOf(input),
      };
      await persistence.skus.save(sku);
      await events.publish("catalog.sku.created", { id: sku.id, productId: sku.productId });
      return sku;
    },

    async updateSku(id, patch) {
      const existing = await persistence.skus.get(id);
      if (!existing) return null;
      const updated: Sku = withSchedule({ ...existing, ...patch, id: existing.id, productId: existing.productId, identifyingAttributes: existing.identifyingAttributes }, { ...existing, ...patch });
      await persistence.skus.save(updated);
      return updated;
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
      await events.publish("catalog.attribute.updated", { productId: attribute.productId, key: attribute.key });
    },

    async listAttributes(productId) {
      return persistence.attributes.listByProduct(productId);
    },

    async removeAttribute(productId, key) {
      await persistence.attributes.remove(productId, key);
      await events.publish("catalog.attribute.removed", { productId, key });
    },

    async createCatalog(input) {
      const existing = await catalogs.getBySlug(input.slug);
      if (existing) throw new DuplicateCatalogSlugError(input.slug);
      const catalog: Catalog = withCatalogFields(
        { id: randomUUID(), slug: input.slug, name: input.name, description: input.description, createdAt: new Date().toISOString() },
        input,
      );
      await checkSectionProducts(catalog);
      await catalogs.save(catalog);
      await assignSectionProducts(catalog);
      return catalog;
    },

    async getCatalog(id) {
      return catalogs.get(id);
    },

    async getCatalogBySlug(slug) {
      return catalogs.getBySlug(slug);
    },

    async listCatalogs(filter) {
      return (await catalogs.list()).filter(
        (c) => (!filter?.kind || (c.kind ?? "master") === filter.kind) && (!filter?.masterCatalogId || c.masterCatalogId === filter.masterCatalogId),
      );
    },

    async updateCatalog(id, patch) {
      const existing = await requireCatalog(id);
      const updated = withCatalogFields({ ...existing, ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.description !== undefined ? { description: patch.description } : {}) }, { ...existing, ...patch });
      await checkSectionProducts(updated);
      await catalogs.save(updated);
      await assignSectionProducts(updated);
      return updated;
    },

    async getCatalogLanding(idOrSlug, now = new Date()) {
      const catalog = (await catalogs.get(idOrSlug)) ?? (await catalogs.getBySlug(idOrSlug));
      if (!catalog) return null;
      const ids = await productCatalogs.listProductIdsInCatalog(catalog.id);
      const products = new Map<string, Product>();
      for (const id of ids) {
        const p = await persistence.products.get(id);
        if (p && p.status === "active") products.set(id, p);
      }
      const named = new Set<string>();
      const sections = (catalog.sections ?? []).map((section) => {
        section.productIds.forEach((id) => named.add(id));
        return { ...section, products: section.productIds.map((id) => products.get(id)).filter((p): p is Product => Boolean(p)) };
      });
      return {
        catalog,
        lifecycle: lifecycle({ status: catalog.status ?? "active", activeFrom: catalog.activeFrom ?? null, activeTo: catalog.activeTo ?? null }, now),
        sections,
        otherProducts: [...products.values()].filter((p) => !named.has(p.id)),
      };
    },

    async applyCatalogWindowToProducts(catalogId) {
      await requireCatalog(catalogId);
      const scheduled = (await catalogs.list()).filter((c) => c.kind === "sales");
      const updated: string[] = [];
      for (const productId of await productCatalogs.listProductIdsInCatalog(catalogId)) {
        const product = await persistence.products.get(productId);
        if (!product) continue;
        const memberOf = new Set(await productCatalogs.listCatalogIdsForProduct(productId));
        const lines = scheduled.filter((c) => memberOf.has(c.id));
        if (lines.length === 0) continue;
        const froms = lines.map((c) => c.activeFrom ?? null);
        const tos = lines.map((c) => c.activeTo ?? null);
        const activeFrom = froms.includes(null) ? null : froms.reduce((a, b) => (Date.parse(a!) <= Date.parse(b!) ? a : b));
        const activeTo = tos.includes(null) ? null : tos.reduce((a, b) => (Date.parse(a!) >= Date.parse(b!) ? a : b));
        if ((product.activeFrom ?? null) === activeFrom && (product.activeTo ?? null) === activeTo) continue;
        const next = withSchedule(product, { activeFrom, activeTo });
        await persistence.products.save(next);
        await events.publish("catalog.product.updated", { id: productId });
        updated.push(productId);
      }
      return { updated };
    },

    async assignProductToCatalog(productId, catalogId) {
      await requireCatalog(catalogId);
      await productCatalogs.assign(productId, catalogId);
    },

    async unassignProductFromCatalog(productId, catalogId) {
      await productCatalogs.unassign(productId, catalogId);
    },

    async listCatalogIdsForProduct(productId) {
      return productCatalogs.listCatalogIdsForProduct(productId);
    },

    async listProductIdsInCatalog(catalogId) {
      return productCatalogs.listProductIdsInCatalog(catalogId);
    },

    async listProductsInCatalog(catalogId) {
      const productIds = await productCatalogs.listProductIdsInCatalog(catalogId);
      const found = await Promise.all(productIds.map((id) => persistence.products.get(id)));
      return found.filter((p): p is Product => p !== null);
    },
  };
}

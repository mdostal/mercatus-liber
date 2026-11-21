import type { ProductStatus, Schedule } from "@mercatus-liber/core";
/**
 * Real, named, addressable Catalog entity -- distinct from the 3 demo
 * stores being "3 catalogs" only in the sense of 3 separate databases.
 * A Catalog<->Product assignment is many-to-many (a product COULD belong
 * to more than one catalog), structurally identical to
 * @mercatus-liber/marketing-catalog's Category/ProductCategoryRepository
 * pair -- see that package's types.ts and in-memory-repository.ts, which
 * this file mirrors.
 */
/** A line's landing-page header. */
export interface CatalogHero {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  imageAlt?: string;
  cta?: { label: string; href: string };
}

/** One group of products on a line's page, in display order, e.g. "Desk", "Shirts", "Hats". */
export interface CatalogSection {
  slug: string;
  title: string;
  productIds: string[];
}

/**
 * A named set of products. A store's main catalog is a "master" catalog (the
 * default when `kind` is absent). A "sales" catalog (a line or collection)
 * reuses master products in its own order and sections, with its own
 * schedule and landing-page hero, like HCL Commerce's sales catalogs. Every
 * field after `createdAt` is optional, so catalogs saved before they existed
 * read the same.
 */
export interface Catalog extends Schedule {
  id: string;
  slug: string;
  name: string;
  description: string;
  createdAt: string;
  kind?: "master" | "sales";
  /** For a sales catalog: the master catalog (store) it belongs to. */
  masterCatalogId?: string;
  /** Default "active". A draft line isn't shown. */
  status?: ProductStatus;
  hero?: CatalogHero;
  sections?: CatalogSection[];
}

export interface CatalogRepository {
  get(id: string): Promise<Catalog | null>;
  getBySlug(slug: string): Promise<Catalog | null>;
  list(): Promise<Catalog[]>;
  save(catalog: Catalog): Promise<void>;
}

/**
 * Many-to-many -- a product COULD belong to more than one catalog. Mirrors
 * marketing-catalog's ProductCategoryRepository exactly.
 */
export interface ProductCatalogRepository {
  listCatalogIdsForProduct(productId: string): Promise<string[]>;
  listProductIdsInCatalog(catalogId: string): Promise<string[]>;
  assign(productId: string, catalogId: string): Promise<void>;
  unassign(productId: string, catalogId: string): Promise<void>;
}

export class CatalogNotFoundError extends Error {
  constructor(id: string) {
    super(`Catalog not found: ${id}`);
    this.name = "CatalogNotFoundError";
  }
}

export class DuplicateCatalogSlugError extends Error {
  constructor(slug: string) {
    super(`A catalog with slug "${slug}" already exists`);
    this.name = "DuplicateCatalogSlugError";
  }
}

export function createInMemoryCatalogRepository(): CatalogRepository {
  const catalogs = new Map<string, Catalog>();
  return {
    async get(id) {
      const c = catalogs.get(id);
      return c ? structuredClone(c) : null;
    },
    async getBySlug(slug) {
      for (const c of catalogs.values()) {
        if (c.slug === slug) return structuredClone(c);
      }
      return null;
    },
    async list() {
      return [...catalogs.values()].map((c) => structuredClone(c));
    },
    async save(catalog) {
      catalogs.set(catalog.id, structuredClone(catalog));
    },
  };
}

export function createInMemoryProductCatalogRepository(): ProductCatalogRepository {
  // Set of "productId::catalogId" pairs.
  const assignments = new Set<string>();
  const key = (productId: string, catalogId: string) => `${productId}::${catalogId}`;

  return {
    async listCatalogIdsForProduct(productId) {
      return [...assignments]
        .filter((k) => k.startsWith(`${productId}::`))
        .map((k) => k.slice(productId.length + 2));
    },
    async listProductIdsInCatalog(catalogId) {
      const suffix = `::${catalogId}`;
      return [...assignments].filter((k) => k.endsWith(suffix)).map((k) => k.slice(0, -suffix.length));
    },
    async assign(productId, catalogId) {
      assignments.add(key(productId, catalogId));
    },
    async unassign(productId, catalogId) {
      assignments.delete(key(productId, catalogId));
    },
  };
}

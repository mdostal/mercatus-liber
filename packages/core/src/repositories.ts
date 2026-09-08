/**
 * Persistence adapter contracts. Core defines these; it implements none of them.
 * Concrete packages (e.g. @mercatus-liber/adapter-sqlite, @mercatus-liber/adapter-postgres) implement
 * these interfaces -- swapping one for the other must never require a change to
 * any subsystem that depends on them. See docs/subsystems/00-core-schema.md and
 * docs/ARCHITECTURE.md's "DB adapters are a contract" principle.
 */

import type { Product, ProductAttribute, ProductFilter, Sku } from "./schema.js";

export interface ProductRepository {
  get(id: string): Promise<Product | null>;
  getBySlug(slug: string): Promise<Product | null>;
  list(filter?: ProductFilter): Promise<Product[]>;
  save(product: Product): Promise<void>;
}

export interface SkuRepository {
  get(id: string): Promise<Sku | null>;
  listByProduct(productId: string): Promise<Sku[]>;
  save(sku: Sku): Promise<void>;
}

export interface ProductAttributeRepository {
  listByProduct(productId: string): Promise<ProductAttribute[]>;
  save(attribute: ProductAttribute): Promise<void>;
  remove(productId: string, key: string): Promise<void>;
}

/**
 * The bundle of repositories a persistence adapter must provide to back the
 * catalog subsystem. Every other subsystem's own repository interfaces live in
 * that subsystem's own package (e.g. CartRepository in @mercatus-liber/cart), following this
 * same shape -- core does not enumerate them all here, which would recreate the
 * tight coupling this project exists to avoid.
 */
export interface CatalogPersistenceAdapter {
  products: ProductRepository;
  skus: SkuRepository;
  attributes: ProductAttributeRepository;
}

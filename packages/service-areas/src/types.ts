/**
 * The multi-location marketing pattern a service-area business needs
 * (subsystem 15). Mirrors marketing-catalog's Category/
 * ProductCategoryRepository shape exactly -- see
 * docs/subsystems/15-service-areas.md for why this is a distinct concept
 * from a product category ("where" vs. "what kind").
 */
export interface ServiceArea {
  id: string;
  slug: string;
  /** e.g. "Royse City, TX". */
  name: string;
  /** e.g. "Texas" -- a broader marketing region label, free text. */
  region: string;
  description: string;
  /** null if this area has no dedicated contact number. */
  phone: string | null;
}

export interface ServiceAreaRepository {
  get(id: string): Promise<ServiceArea | null>;
  getBySlug(slug: string): Promise<ServiceArea | null>;
  list(): Promise<ServiceArea[]>;
  save(area: ServiceArea): Promise<void>;
}

/**
 * Many-to-many product<->service-area assignment, owned entirely by this
 * package -- never a field on @mercatus-liber/core's Product. Mirrors
 * marketing-catalog's ProductCategoryRepository exactly.
 */
export interface ServiceAreaProductRepository {
  listServiceAreaIdsForProduct(productId: string): Promise<string[]>;
  listProductIdsInServiceArea(serviceAreaId: string): Promise<string[]>;
  assign(productId: string, serviceAreaId: string): Promise<void>;
  unassign(productId: string, serviceAreaId: string): Promise<void>;
}

export class ServiceAreaNotFoundError extends Error {
  constructor(id: string) {
    super(`Service area not found: ${id}`);
    this.name = "ServiceAreaNotFoundError";
  }
}

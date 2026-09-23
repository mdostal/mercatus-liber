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
  /**
   * Which demo store this service area belongs to. Optional/additive, same
   * shape and reason as `Page.demoSlug` (epic 60) and `Category.demoSlug`
   * (epic 61) -- a real, live gap found by `commerce-gap-audit-3`:
   * `ServiceAreaRepository.list()` had no demo-scoping concept at all, so
   * under the shared Postgres backend print-shop and Northline Home Tech
   * both resolve to, print-shop's own local-pickup service areas (Portland
   * OR / Austin TX / Chicago IL) and Northline's 8 installer service areas
   * were returned combined to whichever demo asked -- confirmed live
   * against commerce.mdostal.com before this fix: print-shop's own
   * `/locations` page listed all 11 cities from both businesses, and its
   * nav showed a "Service Areas" link purely because Northline's areas
   * made `areas.length > 0` true. `undefined`/missing behaves exactly as
   * before this fix (an unscoped call still sees every area).
   */
  demoSlug?: string;
}

export interface ServiceAreaRepository {
  get(id: string): Promise<ServiceArea | null>;
  getBySlug(slug: string): Promise<ServiceArea | null>;
  list(filter?: { demoSlug?: string }): Promise<ServiceArea[]>;
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

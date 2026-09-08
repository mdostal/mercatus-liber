export type PageType = "home" | "category" | "marketing" | "search" | "pdp" | "location";
export type PageStatus = "draft" | "published";

/** A content-authored block a page references by type + config -- the composable building block every page type's content is made of. */
export interface ComponentInstance {
  componentType: string;
  config: Record<string, unknown>;
}

export interface Page {
  id: string;
  pageType: PageType;
  /** For "home", a fixed slug; for marketing pages, campaign-specific; category/search/pdp pages are typically keyed by their own domain id instead of a CMS slug. */
  slug: string;
  title: string;
  status: PageStatus;
  sections: ComponentInstance[];
}

export interface PageRepository {
  get(id: string): Promise<Page | null>;
  getBySlug(slug: string): Promise<Page | null>;
  list(filter?: { pageType?: PageType; status?: PageStatus }): Promise<Page[]>;
  save(page: Page): Promise<void>;
}

/**
 * A marketing page's own mini-catalog -- a curated, ORDERED product list
 * scoped to that page/campaign, owned by this package. Distinct from
 * marketing-catalog's category-based curation: a Halloween special isn't a
 * standing category, it's campaign content that happens to reference
 * products. See docs/subsystems/05-cms-pages.md.
 */
export interface MarketingPageMeta {
  pageId: string;
  campaignName: string;
  /** ISO date string. */
  startDate: string;
  /** ISO date string, or null for an open-ended campaign. */
  endDate: string | null;
  /** Ordered, curated -- NOT a set. Display order is authoring intent. */
  productIds: string[];
}

export interface MarketingPageMetaRepository {
  getByPageId(pageId: string): Promise<MarketingPageMeta | null>;
  save(meta: MarketingPageMeta): Promise<void>;
}

export interface ComponentDefinition {
  type: string;
  label: string;
  description: string;
}

export interface ComponentRegistry {
  register(definition: ComponentDefinition): void;
  list(): ComponentDefinition[];
  get(type: string): ComponentDefinition | null;
}

/**
 * The bundle of repositories a CMS persistence adapter must provide --
 * same bundled-interface pattern as @mercatus-liber/core's
 * CatalogPersistenceAdapter. Swapping one implementation for another
 * (in-memory, a DB-backed one, @mercatus-liber/adapter-sanity) must never
 * require a change to createCmsService or anything that depends on it.
 */
export interface CmsPersistenceAdapter {
  pages: PageRepository;
  marketingMeta: MarketingPageMetaRepository;
}

export class PageNotFoundError extends Error {
  constructor(id: string) {
    super(`Page not found: ${id}`);
    this.name = "PageNotFoundError";
  }
}

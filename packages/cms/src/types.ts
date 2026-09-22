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
  /**
   * Optional, additive: which demo store this page belongs to (e.g.
   * "print-shop", "northline", "broadleaf"). Real, confirmed live bug
   * (2026-09-22): under a SHARED persistent CMS backend (e.g. one Sanity
   * project/dataset used by all 3 demo stores, see
   * apps/reference-storefront/lib/services.ts), `PageRepository.list()` had
   * no way to scope a query to just one demo's own pages -- every demo's
   * nav (app/demo/[demoSlug]/layout.tsx's buildNavLinks) called
   * `listPages({ pageType: "marketing", status: "published" })` with zero
   * demo scoping, so print-shop's "Fall Sale" campaign page showed up in
   * Broadleaf's and Northline's nav too, even though it isn't their
   * campaign. Slug-prefixing (the "home-${demoSlug}" convention `getPage
   * BySlug` already used) only helps a single targeted lookup by exact
   * slug -- it does nothing for a *list* query, which still returns every
   * demo's matching pages regardless of slug shape. This field is the real,
   * structural fix: optional and additive everywhere (every existing
   * caller that never sets/filters by it keeps working byte-for-byte,
   * including the in-memory default and any admin surface that
   * legitimately wants every demo's pages at once).
   */
  demoSlug?: string;
}

export interface PageRepository {
  get(id: string): Promise<Page | null>;
  getBySlug(slug: string): Promise<Page | null>;
  list(filter?: { pageType?: PageType; status?: PageStatus; demoSlug?: string }): Promise<Page[]>;
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

/**
 * Describes one key a component type's opaque `config` object is expected
 * to carry -- metadata for an authoring UI (or a future validator) to build
 * against, NOT a runtime contract: ComponentInstance.config stays a plain
 * `Record<string, unknown>` regardless of what's declared here. `kind` is a
 * closed set of primitive/reference shapes; a field whose real data is a
 * list (e.g. an array of product ids) still uses the singular ref kind for
 * "what each item is" -- there's no separate list flag, by design, to keep
 * this shape simple and predictable for downstream consumers (see
 * component-registry.ts's fields[] for the grounded examples).
 */
export interface ComponentFieldSchema {
  key: string;
  label: string;
  kind: "text" | "richtext" | "image" | "productRef" | "categoryRef" | "number" | "boolean";
  required?: boolean;
  helpText?: string;
}

export interface ComponentDefinition {
  type: string;
  label: string;
  description: string;
  /**
   * Optional per-type field schema, additive metadata only -- omitted
   * entirely, an empty array, and a populated array are all valid (ad-slot
   * below is legitimately empty: its config is never read by the render
   * layer, see components/cms-sections.tsx's AdSlot, which resolves its
   * content from the advertising service instead).
   */
  fields?: ComponentFieldSchema[];
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

import type { AttributeValue, CategoryRef } from "@mercatus-liber/core";

export interface Category extends CategoryRef {
  title: string;
  description: string;
  /** null for a top-level category. */
  parentId: string | null;
  /**
   * Optional, additive: which demo store this category belongs to (e.g.
   * "print-shop", "northline", "broadleaf"). Real, confirmed live bug
   * (2026-09-22, found while closing out the sibling CMS demo-scoping fix,
   * see epic-backlog.md row 61): print-shop and Northline Home Tech
   * genuinely share ONE Postgres `categories`/`product_category_assignments`
   * pair of tables (both demos resolve the same global `DATABASE_URL`-backed
   * pool when neither has a per-demo persistence override configured -- see
   * apps/reference-storefront/lib/services.ts's resolveDemoPersistenceEnv),
   * and `CategoryRepository.list()`/`MarketingCatalogService
   * .listChildCategories()` had no demo-scoping concept at all -- every
   * demo's nav (`buildNavLinks()` in
   * app/demo/[demoSlug]/layout.tsx) called `listChildCategories(null)` with
   * zero demo filter, so print-shop's nav showed Northline's top-level
   * categories mixed in (and vice versa), each linking to a
   * `/demo/<wrong-demo>/category/<slug>` href that doesn't belong to that
   * store. This is the exact same bug class @mercatus-liber/cms's
   * `Page.demoSlug` already fixed (epic 60) -- same shape here: optional and
   * additive everywhere (every existing caller that never sets/filters by
   * it keeps working byte-for-byte, including the in-memory default and any
   * admin surface that legitimately wants every demo's categories at once).
   */
  demoSlug?: string;
}

export interface CategoryRepository {
  get(id: string): Promise<Category | null>;
  getBySlug(slug: string): Promise<Category | null>;
  list(filter?: { demoSlug?: string }): Promise<Category[]>;
  save(category: Category): Promise<void>;
}

/**
 * Many-to-many product<->category assignment, owned entirely by this package --
 * never a field on @mercatus-liber/core's Product. Catalog never knows
 * categories exist; deleting this whole package still leaves product data
 * intact, only browsing/curation is lost. See docs/subsystems/02-marketing-catalog.md.
 */
export interface ProductCategoryRepository {
  listCategoryIdsForProduct(productId: string): Promise<string[]>;
  listProductIdsInCategory(categoryId: string): Promise<string[]>;
  assign(productId: string, categoryId: string): Promise<void>;
  unassign(productId: string, categoryId: string): Promise<void>;
}

/**
 * The narrowest read dependency this package has on catalog data -- a
 * structural interface, not an import of @mercatus-liber/catalog.
 * @mercatus-liber/catalog's CatalogService satisfies this shape already.
 */
export interface CatalogAttributeLookup {
  listAttributes(productId: string): Promise<{ key: string; value: AttributeValue | AttributeValue[]; facetable: boolean }[]>;
}

/**
 * Assistive, rule-based category suggestion -- never auto-applied. A human (or
 * calling code) decides whether to act on a suggestion via assignProductToCategory.
 */
export interface SuggestionRule {
  attributeKey: string;
  /** If omitted, any value for attributeKey matches. */
  attributeValue?: AttributeValue;
  categorySlug: string;
}

export interface CategorySuggestion {
  categorySlug: string;
  reason: string;
}

export class CategoryNotFoundError extends Error {
  constructor(id: string) {
    super(`Category not found: ${id}`);
    this.name = "CategoryNotFoundError";
  }
}

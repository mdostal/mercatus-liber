import type { AttributeValue, CategoryRef } from "@mercatus-liber/core";

export interface Category extends CategoryRef {
  title: string;
  description: string;
  /** null for a top-level category. */
  parentId: string | null;
}

export interface CategoryRepository {
  get(id: string): Promise<Category | null>;
  getBySlug(slug: string): Promise<Category | null>;
  list(): Promise<Category[]>;
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

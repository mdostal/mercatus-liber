import { randomUUID } from "node:crypto";
import { CategoryNotFoundError } from "./types.js";
import type {
  CatalogAttributeLookup,
  Category,
  CategoryRepository,
  CategorySuggestion,
  ProductCategoryRepository,
  SuggestionRule,
} from "./types.js";

export interface NewCategoryInput {
  slug: string;
  title: string;
  description: string;
  parentId: string | null;
}

export interface MarketingCatalogService {
  createCategory(input: NewCategoryInput): Promise<Category>;
  getCategory(id: string): Promise<Category | null>;
  getCategoryBySlug(slug: string): Promise<Category | null>;
  listCategories(): Promise<Category[]>;
  /** Pass null for top-level categories. */
  listChildCategories(parentId: string | null): Promise<Category[]>;

  assignProductToCategory(productId: string, categoryId: string): Promise<void>;
  unassignProductFromCategory(productId: string, categoryId: string): Promise<void>;
  listCategoriesForProduct(productId: string): Promise<Category[]>;
  listProductIdsInCategory(categoryId: string): Promise<string[]>;

  suggestCategories(productId: string): Promise<CategorySuggestion[]>;
}

export function createMarketingCatalogService(deps: {
  categories: CategoryRepository;
  assignments: ProductCategoryRepository;
  attributes: CatalogAttributeLookup;
  rules?: SuggestionRule[];
}): MarketingCatalogService {
  const { categories, assignments, attributes } = deps;
  const rules = deps.rules ?? [];

  async function requireCategory(id: string): Promise<Category> {
    const category = await categories.get(id);
    if (!category) throw new CategoryNotFoundError(id);
    return category;
  }

  return {
    async createCategory(input) {
      const category: Category = {
        id: randomUUID(),
        slug: input.slug,
        title: input.title,
        description: input.description,
        parentId: input.parentId,
      };
      await categories.save(category);
      return category;
    },

    async getCategory(id) {
      return categories.get(id);
    },

    async getCategoryBySlug(slug) {
      return categories.getBySlug(slug);
    },

    async listCategories() {
      return categories.list();
    },

    async listChildCategories(parentId) {
      const all = await categories.list();
      return all.filter((c) => c.parentId === parentId);
    },

    async assignProductToCategory(productId, categoryId) {
      await requireCategory(categoryId);
      await assignments.assign(productId, categoryId);
    },

    async unassignProductFromCategory(productId, categoryId) {
      await assignments.unassign(productId, categoryId);
    },

    async listCategoriesForProduct(productId) {
      const categoryIds = await assignments.listCategoryIdsForProduct(productId);
      const found = await Promise.all(categoryIds.map((id) => categories.get(id)));
      return found.filter((c): c is Category => c !== null);
    },

    async listProductIdsInCategory(categoryId) {
      return assignments.listProductIdsInCategory(categoryId);
    },

    async suggestCategories(productId) {
      const productAttributes = await attributes.listAttributes(productId);
      const suggestions: CategorySuggestion[] = [];
      for (const rule of rules) {
        const match = productAttributes.find((attr) => {
          if (attr.key !== rule.attributeKey) return false;
          if (rule.attributeValue === undefined) return true;
          return attr.value === rule.attributeValue;
        });
        if (match) {
          suggestions.push({
            categorySlug: rule.categorySlug,
            reason: `Product has attribute "${rule.attributeKey}"${
              rule.attributeValue !== undefined ? ` = ${String(rule.attributeValue)}` : ""
            }`,
          });
        }
      }
      return suggestions;
    },
  };
}

import type { Category, CategoryRepository, ProductCategoryRepository } from "./types.js";

export function createInMemoryCategoryRepository(): CategoryRepository {
  const categories = new Map<string, Category>();
  return {
    async get(id) {
      const c = categories.get(id);
      return c ? structuredClone(c) : null;
    },
    async getBySlug(slug) {
      for (const c of categories.values()) {
        if (c.slug === slug) return structuredClone(c);
      }
      return null;
    },
    async list() {
      return [...categories.values()].map((c) => structuredClone(c));
    },
    async save(category) {
      categories.set(category.id, structuredClone(category));
    },
  };
}

export function createInMemoryProductCategoryRepository(): ProductCategoryRepository {
  // Set of "productId::categoryId" pairs.
  const assignments = new Set<string>();
  const key = (productId: string, categoryId: string) => `${productId}::${categoryId}`;

  return {
    async listCategoryIdsForProduct(productId) {
      return [...assignments]
        .filter((k) => k.startsWith(`${productId}::`))
        .map((k) => k.slice(productId.length + 2));
    },
    async listProductIdsInCategory(categoryId) {
      const suffix = `::${categoryId}`;
      return [...assignments].filter((k) => k.endsWith(suffix)).map((k) => k.slice(0, -suffix.length));
    },
    async assign(productId, categoryId) {
      assignments.add(key(productId, categoryId));
    },
    async unassign(productId, categoryId) {
      assignments.delete(key(productId, categoryId));
    },
  };
}

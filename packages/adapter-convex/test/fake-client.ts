import type { ConvexClientLike } from "../src/index.js";

/**
 * A stateful fake `ConvexClientLike` double -- NOT a real Convex
 * deployment. No live Convex project exists in this environment (same
 * disclosed gap as adapter-mongodb/adapter-postgres's own fake doubles).
 * Reproduces exactly what the real functions in ../convex-functions/*.ts
 * do (see that directory) against plain in-memory arrays, keyed by
 * `externalId`/`(productId,key)` the same way those real functions query
 * by their own real Convex indexes -- so this genuinely exercises the
 * adapter's own function-name/argument-shape contract, not just "some
 * double returns some data."
 */
export function createFakeConvexClient(): ConvexClientLike {
  const products: Record<string, unknown>[] = [];
  const skus: Record<string, unknown>[] = [];
  const attributes: Record<string, unknown>[] = [];
  const categories: Record<string, unknown>[] = [];
  const productCategoryAssignments: Record<string, unknown>[] = [];

  function upsert(list: Record<string, unknown>[], match: (row: Record<string, unknown>) => boolean, doc: Record<string, unknown>) {
    const index = list.findIndex(match);
    if (index >= 0) list[index] = { ...list[index], ...doc };
    else list.push(doc);
  }

  return {
    async query(functionName: string, args: Record<string, unknown>): Promise<unknown> {
      switch (functionName) {
        case "products:get":
          return products.find((p) => p.externalId === args.externalId) ?? null;
        case "products:getBySlug":
          return products.find((p) => p.slug === args.slug) ?? null;
        case "products:list": {
          let results = products;
          if (args.status) results = results.filter((p) => p.status === args.status);
          if (args.slug) results = results.filter((p) => p.slug === args.slug);
          return results;
        }
        case "skus:get":
          return skus.find((s) => s.externalId === args.externalId) ?? null;
        case "skus:listByProduct":
          return skus.filter((s) => s.productId === args.productId);
        case "attributes:listByProduct":
          return attributes.filter((a) => a.productId === args.productId);
        case "categories:get":
          return categories.find((c) => c.externalId === args.externalId) ?? null;
        case "categories:getBySlug":
          return categories.find((c) => c.slug === args.slug) ?? null;
        case "categories:list":
          return categories;
        case "productCategories:listCategoryIdsForProduct":
          return productCategoryAssignments
            .filter((a) => a.productId === args.productId)
            .map((a) => a.categoryId);
        case "productCategories:listProductIdsInCategory":
          return productCategoryAssignments
            .filter((a) => a.categoryId === args.categoryId)
            .map((a) => a.productId);
        default:
          throw new Error(`FakeConvexClient: unrecognized query -- ${functionName}`);
      }
    },

    async mutation(functionName: string, args: Record<string, unknown>): Promise<unknown> {
      switch (functionName) {
        case "products:save":
          upsert(products, (p) => p.externalId === args.externalId, args);
          return null;
        case "skus:save":
          upsert(skus, (s) => s.externalId === args.externalId, args);
          return null;
        case "attributes:save":
          upsert(attributes, (a) => a.productId === args.productId && a.key === args.key, args);
          return null;
        case "attributes:remove": {
          const index = attributes.findIndex((a) => a.productId === args.productId && a.key === args.key);
          if (index >= 0) attributes.splice(index, 1);
          return null;
        }
        case "categories:save":
          upsert(categories, (c) => c.externalId === args.externalId, args);
          return null;
        case "productCategories:assign": {
          const exists = productCategoryAssignments.some(
            (a) => a.productId === args.productId && a.categoryId === args.categoryId,
          );
          if (!exists) productCategoryAssignments.push(args);
          return null;
        }
        case "productCategories:unassign": {
          const index = productCategoryAssignments.findIndex(
            (a) => a.productId === args.productId && a.categoryId === args.categoryId,
          );
          if (index >= 0) productCategoryAssignments.splice(index, 1);
          return null;
        }
        default:
          throw new Error(`FakeConvexClient: unrecognized mutation -- ${functionName}`);
      }
    },
  };
}

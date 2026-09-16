// Copy this file into your own Convex project's convex/ directory -- see
// this directory's README.md. Function names below are called by
// @mercatus-liber/adapter-convex's client as the string references
// "productCategories:assign", "productCategories:listCategoryIdsForProduct",
// etc. -- Convex's own real <file>:<export> naming convention.
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listCategoryIdsForProduct = query({
  args: { productId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("productCategoryAssignments")
      .withIndex("by_product_and_category", (q) => q.eq("productId", args.productId))
      .collect();
    return rows.map((row) => row.categoryId);
  },
});

export const listProductIdsInCategory = query({
  args: { categoryId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("productCategoryAssignments")
      .withIndex("by_category_id", (q) => q.eq("categoryId", args.categoryId))
      .collect();
    return rows.map((row) => row.productId);
  },
});

export const assign = mutation({
  args: { productId: v.string(), categoryId: v.string() },
  handler: async (ctx, args) => {
    // Idempotent, matching @mercatus-liber/marketing-catalog's in-memory
    // reference implementation -- a second assign of the same pair is a
    // no-op, never a duplicate row.
    const existing = await ctx.db
      .query("productCategoryAssignments")
      .withIndex("by_product_and_category", (q) =>
        q.eq("productId", args.productId).eq("categoryId", args.categoryId),
      )
      .unique();
    if (!existing) {
      await ctx.db.insert("productCategoryAssignments", args);
    }
  },
});

export const unassign = mutation({
  args: { productId: v.string(), categoryId: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("productCategoryAssignments")
      .withIndex("by_product_and_category", (q) =>
        q.eq("productId", args.productId).eq("categoryId", args.categoryId),
      )
      .collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
  },
});

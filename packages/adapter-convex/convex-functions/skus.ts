// Copy this file into your own Convex project's convex/ directory -- see
// this directory's README.md.
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: { externalId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("skus")
      .withIndex("by_external_id", (q) => q.eq("externalId", args.externalId))
      .unique();
  },
});

export const listByProduct = query({
  args: { productId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("skus")
      .withIndex("by_product_id", (q) => q.eq("productId", args.productId))
      .collect();
  },
});

export const save = mutation({
  args: {
    externalId: v.string(),
    productId: v.string(),
    identifyingAttributes: v.array(
      v.object({ key: v.string(), value: v.union(v.string(), v.number(), v.boolean()) }),
    ),
    priceAmount: v.number(),
    priceCurrency: v.string(),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("skus")
      .withIndex("by_external_id", (q) => q.eq("externalId", args.externalId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("skus", args);
    }
  },
});

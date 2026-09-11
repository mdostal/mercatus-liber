// Copy this file into your own Convex project's convex/ directory -- see
// this directory's README.md.
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const listByProduct = query({
  args: { productId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("productAttributes")
      .withIndex("by_product_and_key", (q) => q.eq("productId", args.productId))
      .collect();
  },
});

export const save = mutation({
  args: { productId: v.string(), key: v.string(), value: v.any(), facetable: v.boolean() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("productAttributes")
      .withIndex("by_product_and_key", (q) => q.eq("productId", args.productId).eq("key", args.key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value, facetable: args.facetable });
    } else {
      await ctx.db.insert("productAttributes", args);
    }
  },
});

export const remove = mutation({
  args: { productId: v.string(), key: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("productAttributes")
      .withIndex("by_product_and_key", (q) => q.eq("productId", args.productId).eq("key", args.key))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

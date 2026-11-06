// Copy this file into your own Convex project's convex/ directory -- see this
// directory's README.md. Called by @mercatus-liber/adapter-convex as
// "providerCatalogMappings:get" and so on. `target` is a JSON string because
// provider product ids can't be guaranteed to be valid Convex field names.
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: { skuId: v.string(), provider: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("providerCatalogMappings")
      .withIndex("by_sku_and_provider", (q) => q.eq("skuId", args.skuId).eq("provider", args.provider))
      .unique();
  },
});

export const list = query({
  args: { provider: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("providerCatalogMappings").withIndex("by_sku_and_provider").collect();
    return args.provider === undefined ? all : all.filter((m) => m.provider === args.provider);
  },
});

export const save = mutation({
  args: { skuId: v.string(), provider: v.string(), target: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("providerCatalogMappings")
      .withIndex("by_sku_and_provider", (q) => q.eq("skuId", args.skuId).eq("provider", args.provider))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { target: args.target });
    else await ctx.db.insert("providerCatalogMappings", args);
  },
});

export const remove = mutation({
  args: { skuId: v.string(), provider: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("providerCatalogMappings")
      .withIndex("by_sku_and_provider", (q) => q.eq("skuId", args.skuId).eq("provider", args.provider))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

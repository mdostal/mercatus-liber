// Copy this file into your own Convex project's convex/ directory -- see this
// directory's README.md. Called by @mercatus-liber/adapter-convex as
// "customization:list", "customization:get", and so on.
//
// `value` is a JSON string rather than v.any(), because customization records
// are keyed by admin-chosen ids and Convex restricts object field names.
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const kind = v.union(v.literal("palette"), v.literal("finishTier"), v.literal("artStyle"), v.literal("productCustomization"), v.literal("pricingRules"));

// The by_kind index orders by _creationTime, and save() patches, so a record keeps its position.
export const list = query({
  args: { kind },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("customizationRecords")
      .withIndex("by_kind", (q) => q.eq("kind", args.kind))
      .collect();
  },
});

export const get = query({
  args: { kind, externalId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("customizationRecords")
      .withIndex("by_kind_and_external_id", (q) => q.eq("kind", args.kind).eq("externalId", args.externalId))
      .unique();
  },
});

export const getByProductId = query({
  args: { kind, productId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("customizationRecords")
      .withIndex("by_kind_and_product_id", (q) => q.eq("kind", args.kind).eq("productId", args.productId))
      .first();
  },
});

export const save = mutation({
  args: { kind, externalId: v.string(), productId: v.optional(v.string()), value: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("customizationRecords")
      .withIndex("by_kind_and_external_id", (q) => q.eq("kind", args.kind).eq("externalId", args.externalId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { productId: args.productId, value: args.value });
    } else {
      await ctx.db.insert("customizationRecords", args);
    }
  },
});

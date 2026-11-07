// Copy this file into your own Convex project's convex/ directory -- see this
// directory's README.md. Called by @mercatus-liber/adapter-convex as
// "storeApiKeys:get" and so on. Holds only key hashes.
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: { externalId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("storeApiKeys")
      .withIndex("by_external_id", (q) => q.eq("externalId", args.externalId))
      .unique();
  },
});

export const getByPrefix = query({
  args: { prefix: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("storeApiKeys")
      .withIndex("by_prefix", (q) => q.eq("prefix", args.prefix))
      .unique();
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("storeApiKeys").withIndex("by_created_at").collect();
  },
});

export const save = mutation({
  args: { externalId: v.string(), prefix: v.string(), createdAt: v.string(), value: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("storeApiKeys")
      .withIndex("by_external_id", (q) => q.eq("externalId", args.externalId))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { value: args.value });
    else await ctx.db.insert("storeApiKeys", args);
  },
});

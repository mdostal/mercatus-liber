// Copy this file into your own Convex project's convex/ directory -- see
// this directory's README.md. Function names below (get/getBySlug/list/save)
// are called by @mercatus-liber/adapter-convex's client as the string
// references "products:get", "products:getBySlug", etc. -- Convex's own
// real <file>:<export> naming convention.
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: { externalId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("products")
      .withIndex("by_external_id", (q) => q.eq("externalId", args.externalId))
      .unique();
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("products")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

export const list = query({
  args: { status: v.optional(v.string()), slug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // Real, small reference catalog sizes -- .collect() + in-memory filter
    // here mirrors adapter-postgres/adapter-sqlite's own simple `list`
    // implementation, not a production-scale pagination strategy.
    let results = args.status
      ? await ctx.db.query("products").withIndex("by_status", (q) => q.eq("status", args.status!)).collect()
      : await ctx.db.query("products").collect();
    if (args.slug) results = results.filter((p) => p.slug === args.slug);
    return results;
  },
});

export const save = mutation({
  args: {
    externalId: v.string(),
    slug: v.string(),
    title: v.string(),
    description: v.string(),
    identifyingAttributeKeys: v.array(v.string()),
    status: v.string(),
    images: v.optional(v.array(v.object({ url: v.string(), alt: v.string() }))),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("products")
      .withIndex("by_external_id", (q) => q.eq("externalId", args.externalId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("products", args);
    }
  },
});

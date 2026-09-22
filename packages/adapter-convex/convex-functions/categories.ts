// Copy this file into your own Convex project's convex/ directory -- see
// this directory's README.md. Function names below (get/getBySlug/list/save)
// are called by @mercatus-liber/adapter-convex's client as the string
// references "categories:get", "categories:getBySlug", etc. -- Convex's own
// real <file>:<export> naming convention.
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: { externalId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("categories")
      .withIndex("by_external_id", (q) => q.eq("externalId", args.externalId))
      .unique();
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("categories")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

// Optional demoSlug filter (demo-scoping epic, row 61) -- when omitted,
// returns every category exactly as before (fully backward compatible),
// mirroring CategoryRepository.list()'s own optional filter shape.
export const list = query({
  args: { demoSlug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.demoSlug) {
      return await ctx.db
        .query("categories")
        .withIndex("by_demo_slug", (q) => q.eq("demoSlug", args.demoSlug))
        .collect();
    }
    return await ctx.db.query("categories").collect();
  },
});

export const save = mutation({
  args: {
    externalId: v.string(),
    slug: v.string(),
    title: v.string(),
    description: v.string(),
    parentId: v.union(v.string(), v.null()),
    demoSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("categories")
      .withIndex("by_external_id", (q) => q.eq("externalId", args.externalId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("categories", args);
    }
  },
});

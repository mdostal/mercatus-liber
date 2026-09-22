// Copy this file into your own Convex project's convex/ directory -- see
// this directory's README.md. Will not typecheck in THIS repo (it imports
// from Convex's own generated codegen output, which only exists after a
// real `npx convex dev`/`deploy` against a real project), by design.
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  products: defineTable({
    // This framework's own Product.id (a UUID it generates itself) --
    // Convex's own internal _id is a different, branded per-table type we
    // don't control, so we index our own id explicitly instead. See this
    // directory's README.md, "Why externalId, not Convex's own _id".
    externalId: v.string(),
    slug: v.string(),
    title: v.string(),
    description: v.string(),
    identifyingAttributeKeys: v.array(v.string()),
    status: v.string(),
    images: v.optional(v.array(v.object({ url: v.string(), alt: v.string() }))),
  })
    .index("by_external_id", ["externalId"])
    .index("by_slug", ["slug"])
    .index("by_status", ["status"]),

  skus: defineTable({
    externalId: v.string(),
    productId: v.string(),
    identifyingAttributes: v.array(
      v.object({ key: v.string(), value: v.union(v.string(), v.number(), v.boolean()) }),
    ),
    priceAmount: v.number(),
    priceCurrency: v.string(),
    status: v.string(),
  })
    .index("by_external_id", ["externalId"])
    .index("by_product_id", ["productId"]),

  productAttributes: defineTable({
    productId: v.string(),
    key: v.string(),
    value: v.any(),
    facetable: v.boolean(),
  }).index("by_product_and_key", ["productId", "key"]),

  categories: defineTable({
    // This framework's own Category.id (a UUID it generates itself) -- same
    // externalId pattern as products/skus above, see this directory's
    // README.md, "Why externalId, not Convex's own _id".
    externalId: v.string(),
    slug: v.string(),
    title: v.string(),
    description: v.string(),
    // null for a top-level category (mirrors Category.parentId in
    // @mercatus-liber/marketing-catalog's types.ts).
    parentId: v.union(v.string(), v.null()),
    // Optional, additive -- demo-scoping epic (row 61), mirrors
    // @mercatus-liber/marketing-catalog's Category.demoSlug doc comment.
    // Broadleaf isn't part of the confirmed live bug (it already runs on
    // its own dedicated Convex deployment, never shared with another
    // demo), but this field is added here too for full consistency across
    // all 4 real adapters, same shape as every other backend.
    demoSlug: v.optional(v.string()),
  })
    .index("by_external_id", ["externalId"])
    .index("by_slug", ["slug"])
    .index("by_demo_slug", ["demoSlug"]),

  // Many-to-many product<->category assignment. productId/categoryId are
  // this framework's own real Product.id/Category.id strings, never
  // Convex's internal _id.
  productCategoryAssignments: defineTable({
    productId: v.string(),
    categoryId: v.string(),
  })
    .index("by_product_and_category", ["productId", "categoryId"])
    .index("by_category_id", ["categoryId"]),
});

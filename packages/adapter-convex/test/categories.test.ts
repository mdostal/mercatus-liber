import type { Category } from "@mercatus-liber/marketing-catalog";
import { beforeEach, describe, expect, it } from "vitest";
import { createConvexCategoryRepository, createConvexProductCategoryRepository } from "../src/index.js";
import { createFakeConvexClient } from "./fake-client.js";

describe("createConvexCategoryRepository", () => {
  let categories: ReturnType<typeof createConvexCategoryRepository>;

  beforeEach(() => {
    categories = createConvexCategoryRepository(createFakeConvexClient());
  });

  const cables: Category = {
    id: "c1",
    slug: "cables",
    title: "Cables",
    description: "Cable organizers and accessories.",
    parentId: null,
  };

  it("saves and retrieves a category by id", async () => {
    await categories.save(cables);
    expect(await categories.get("c1")).toEqual(cables);
  });

  it("retrieves a category by slug", async () => {
    await categories.save(cables);
    const found = await categories.getBySlug("cables");
    expect(found?.id).toBe("c1");
  });

  it("returns null for a missing category, by id or slug", async () => {
    expect(await categories.get("missing")).toBeNull();
    expect(await categories.getBySlug("missing")).toBeNull();
  });

  it("lists all saved categories", async () => {
    await categories.save(cables);
    await categories.save({ ...cables, id: "c2", slug: "organizers", title: "Organizers" });
    const found = await categories.list();
    expect(found).toHaveLength(2);
    expect(found.map((c) => c.id).sort()).toEqual(["c1", "c2"]);
  });

  it("upserts on save with the same id -- a second save updates in place, never creates a duplicate", async () => {
    await categories.save(cables);
    await categories.save({ ...cables, title: "Updated Title" });
    const found = await categories.get("c1");
    expect(found?.title).toBe("Updated Title");
    expect(await categories.list()).toHaveLength(1);
  });

  it("saves and round-trips a real parent/child relationship via parentId", async () => {
    await categories.save(cables);
    const braided: Category = {
      id: "c2",
      slug: "braided-cables",
      title: "Braided Cables",
      description: "Braided cable organizers, a subcategory of Cables.",
      parentId: "c1",
    };
    await categories.save(braided);

    const parent = await categories.get("c1");
    const child = await categories.get("c2");
    expect(parent?.parentId).toBeNull();
    expect(child?.parentId).toBe("c1");
  });

  /**
   * demo-scoping epic (row 61): added to all 4 real adapters for full
   * consistency, even though Broadleaf (this adapter's only live consumer)
   * isn't part of the confirmed live bug -- it already runs on its own
   * dedicated Convex deployment, never shared with another demo. Proves
   * list(filter) scopes by demoSlug, and an unscoped list() still returns
   * everything.
   */
  it("list(filter) scopes by demoSlug -- two demos' categories never bleed into each other's results", async () => {
    const broadleaf: Category = { ...cables, id: "bl1", slug: "plants", title: "Plants", demoSlug: "broadleaf" };
    const otherDemo: Category = { ...cables, id: "od1", slug: "widgets", title: "Widgets", demoSlug: "other-demo" };
    await categories.save(broadleaf);
    await categories.save(otherDemo);

    expect(await categories.list({ demoSlug: "broadleaf" })).toEqual([broadleaf]);
    expect(await categories.list({ demoSlug: "other-demo" })).toEqual([otherDemo]);

    const everything = await categories.list();
    expect(everything.map((c) => c.id).sort()).toEqual(["bl1", "od1"]);
  });

  it("round-trips demoSlug through save/get, and omits it entirely when never set (backward compatible)", async () => {
    await categories.save(cables);
    const found = await categories.get("c1");
    expect(found?.demoSlug).toBeUndefined();
    expect(found).not.toHaveProperty("demoSlug");
  });
});

describe("createConvexProductCategoryRepository", () => {
  let productCategories: ReturnType<typeof createConvexProductCategoryRepository>;

  beforeEach(() => {
    productCategories = createConvexProductCategoryRepository(createFakeConvexClient());
  });

  it("returns no categories/products for an unassigned product/category", async () => {
    expect(await productCategories.listCategoryIdsForProduct("p1")).toEqual([]);
    expect(await productCategories.listProductIdsInCategory("c1")).toEqual([]);
  });

  it("assigns a product to a category, visible from both directions", async () => {
    await productCategories.assign("p1", "c1");
    expect(await productCategories.listCategoryIdsForProduct("p1")).toEqual(["c1"]);
    expect(await productCategories.listProductIdsInCategory("c1")).toEqual(["p1"]);
  });

  it("assign is idempotent -- assigning the same pair twice does not duplicate it", async () => {
    await productCategories.assign("p1", "c1");
    await productCategories.assign("p1", "c1");
    expect(await productCategories.listCategoryIdsForProduct("p1")).toEqual(["c1"]);
    expect(await productCategories.listProductIdsInCategory("c1")).toEqual(["p1"]);
  });

  it("supports a many-to-many product<->category graph without cross-contamination", async () => {
    await productCategories.assign("p1", "c1");
    await productCategories.assign("p1", "c2");
    await productCategories.assign("p2", "c1");

    expect(await productCategories.listCategoryIdsForProduct("p1").then((ids) => ids.sort())).toEqual(["c1", "c2"]);
    expect(await productCategories.listCategoryIdsForProduct("p2")).toEqual(["c1"]);
    expect(await productCategories.listProductIdsInCategory("c1").then((ids) => ids.sort())).toEqual(["p1", "p2"]);
    expect(await productCategories.listProductIdsInCategory("c2")).toEqual(["p1"]);
  });

  it("unassign removes exactly the one (productId, categoryId) pair", async () => {
    await productCategories.assign("p1", "c1");
    await productCategories.assign("p1", "c2");
    await productCategories.unassign("p1", "c1");

    expect(await productCategories.listCategoryIdsForProduct("p1")).toEqual(["c2"]);
    expect(await productCategories.listProductIdsInCategory("c1")).toEqual([]);
  });

  it("unassign of a pair that was never assigned is a no-op, not an error", async () => {
    await expect(productCategories.unassign("p1", "c1")).resolves.toBeUndefined();
    expect(await productCategories.listCategoryIdsForProduct("p1")).toEqual([]);
  });
});

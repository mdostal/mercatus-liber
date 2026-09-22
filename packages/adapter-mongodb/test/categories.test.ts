import type { Category, CategoryRepository, ProductCategoryRepository } from "@mercatus-liber/marketing-catalog";
import { beforeEach, describe, expect, it } from "vitest";
import { createMongoCategoryRepository, createMongoProductCategoryRepository } from "../src/categories.js";
import type { DbLike } from "../src/index.js";
import { createFakeDb } from "./fake-db.js";

describe("createMongoCategoryRepository", () => {
  let db: DbLike;
  let categories: CategoryRepository;

  const cables: Category = {
    id: "c1",
    slug: "cables",
    title: "Cables",
    description: "Cable organizers and accessories.",
    parentId: null,
  };

  beforeEach(async () => {
    db = createFakeDb();
    categories = await createMongoCategoryRepository(db);
  });

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

  it("lists all categories", async () => {
    await categories.save(cables);
    await categories.save({ id: "c2", slug: "organizers", title: "Organizers", description: "General organizers.", parentId: null });
    const found = await categories.list();
    expect(found).toHaveLength(2);
    expect(found.map((c) => c.id).sort()).toEqual(["c1", "c2"]);
  });

  it("upserts on save with the same id -- a second save updates in place, never creates a duplicate", async () => {
    await categories.save(cables);
    await categories.save({ ...cables, title: "Updated Cables" });
    const found = await categories.get("c1");
    expect(found?.title).toBe("Updated Cables");
    expect(await categories.list()).toHaveLength(1);
  });

  it("saves and retrieves a real parent/child category relationship via parentId", async () => {
    await categories.save(cables);
    const child: Category = {
      id: "c1a",
      slug: "cable-ties",
      title: "Cable Ties",
      description: "Ties for bundling cables.",
      parentId: "c1",
    };
    await categories.save(child);

    const foundParent = await categories.get("c1");
    const foundChild = await categories.get("c1a");
    expect(foundParent?.parentId).toBeNull();
    expect(foundChild?.parentId).toBe("c1");
  });

  /**
   * Real, confirmed live bug (2026-09-22, epic-backlog.md row 61) -- same
   * demo-scoping gap the Postgres/SQLite adapters have, mirrored here so a
   * demo running MONGODB_URL gets the same real fix. Proves list(filter)
   * scopes by demoSlug, and an unscoped list() still returns everything.
   */
  it("list(filter) scopes by demoSlug -- two demos' categories never bleed into each other's results", async () => {
    const printShop: Category = { ...cables, id: "ps1", slug: "embroidery", title: "Embroidery", demoSlug: "print-shop" };
    const northline: Category = { ...cables, id: "nl1", slug: "tv-home-theater", title: "TV & Home Theater", demoSlug: "northline" };
    await categories.save(printShop);
    await categories.save(northline);

    expect(await categories.list({ demoSlug: "print-shop" })).toEqual([printShop]);
    expect(await categories.list({ demoSlug: "northline" })).toEqual([northline]);

    const everything = await categories.list();
    expect(everything.map((c) => c.id).sort()).toEqual(["nl1", "ps1"]);
  });

  it("round-trips demoSlug through save/get, and omits it entirely when never set (backward compatible)", async () => {
    await categories.save(cables);
    const found = await categories.get("c1");
    expect(found?.demoSlug).toBeUndefined();
    expect(found).not.toHaveProperty("demoSlug");
  });
});

describe("createMongoProductCategoryRepository", () => {
  let productCategories: ProductCategoryRepository;

  beforeEach(() => {
    productCategories = createMongoProductCategoryRepository(createFakeDb());
  });

  it("assigns a product to a category and lists it both ways", async () => {
    await productCategories.assign("p1", "c1");
    expect(await productCategories.listCategoryIdsForProduct("p1")).toEqual(["c1"]);
    expect(await productCategories.listProductIdsInCategory("c1")).toEqual(["p1"]);
  });

  it("supports a product assigned to multiple categories, and a category with multiple products", async () => {
    await productCategories.assign("p1", "c1");
    await productCategories.assign("p1", "c2");
    await productCategories.assign("p2", "c1");

    expect((await productCategories.listCategoryIdsForProduct("p1")).sort()).toEqual(["c1", "c2"]);
    expect((await productCategories.listProductIdsInCategory("c1")).sort()).toEqual(["p1", "p2"]);
  });

  it("never leaks another product's or category's assignments", async () => {
    await productCategories.assign("p1", "c1");
    await productCategories.assign("p2", "c2");

    expect(await productCategories.listCategoryIdsForProduct("p1")).toEqual(["c1"]);
    expect(await productCategories.listProductIdsInCategory("c2")).toEqual(["p2"]);
  });

  it("assign is idempotent -- assigning the same pair twice does not duplicate it", async () => {
    await productCategories.assign("p1", "c1");
    await productCategories.assign("p1", "c1");

    expect(await productCategories.listCategoryIdsForProduct("p1")).toEqual(["c1"]);
    expect(await productCategories.listProductIdsInCategory("c1")).toEqual(["p1"]);
  });

  it("unassign removes exactly the one (productId, categoryId) pair", async () => {
    await productCategories.assign("p1", "c1");
    await productCategories.assign("p1", "c2");

    await productCategories.unassign("p1", "c1");

    expect(await productCategories.listCategoryIdsForProduct("p1")).toEqual(["c2"]);
  });

  it("unassign of a pair that was never assigned is a harmless no-op", async () => {
    await productCategories.unassign("p1", "c1");
    expect(await productCategories.listCategoryIdsForProduct("p1")).toEqual([]);
  });

  it("returns an empty array for a product or category with no assignments", async () => {
    expect(await productCategories.listCategoryIdsForProduct("missing")).toEqual([]);
    expect(await productCategories.listProductIdsInCategory("missing")).toEqual([]);
  });
});

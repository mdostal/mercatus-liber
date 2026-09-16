import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createSqliteCategoryRepository,
  createSqliteProductCategoryRepository,
  type Category,
  type CategoryRepository,
  type ProductCategoryRepository,
} from "../src/index.js";

describe("createSqliteCategoryRepository", () => {
  let db: Database.Database;
  let categories: CategoryRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    categories = createSqliteCategoryRepository(db);
  });

  const gifts: Category = {
    id: "c1",
    slug: "gifts",
    title: "Gifts",
    description: "Gift-worthy items.",
    parentId: null,
  };

  it("saves and retrieves a category by id", async () => {
    await categories.save(gifts);
    const found = await categories.get("c1");
    expect(found).toEqual(gifts);
  });

  it("retrieves a category by slug", async () => {
    await categories.save(gifts);
    const found = await categories.getBySlug("gifts");
    expect(found).toEqual(gifts);
  });

  it("returns null for a missing category", async () => {
    expect(await categories.get("missing")).toBeNull();
    expect(await categories.getBySlug("missing")).toBeNull();
  });

  it("lists every category", async () => {
    await categories.save(gifts);
    await categories.save({ ...gifts, id: "c2", slug: "toys", title: "Toys" });
    const found = await categories.list();
    expect(found).toHaveLength(2);
    expect(found.map((c) => c.id).sort()).toEqual(["c1", "c2"]);
  });

  it("upserts on save with the same id (ON CONFLICT DO UPDATE)", async () => {
    await categories.save(gifts);
    await categories.save({ ...gifts, title: "Updated Gifts" });
    const found = await categories.get("c1");
    expect(found?.title).toBe("Updated Gifts");
    expect(await categories.list()).toHaveLength(1);
  });

  it("round-trips a real parent/child category relationship via parentId", async () => {
    await categories.save(gifts);
    const birthday: Category = {
      id: "c2",
      slug: "birthday-gifts",
      title: "Birthday Gifts",
      description: "Gifts for birthdays.",
      parentId: "c1",
    };
    await categories.save(birthday);
    const found = await categories.get("c2");
    expect(found?.parentId).toBe("c1");
    const top = await categories.get("c1");
    expect(top?.parentId).toBeNull();
  });

  it("re-running schema init against the same db file twice does not crash", () => {
    expect(() => createSqliteCategoryRepository(db)).not.toThrow();
  });

  it("constructing the repository against a fresh db twice (schema init idempotency) does not crash", () => {
    const fresh = new Database(":memory:");
    expect(() => createSqliteCategoryRepository(fresh)).not.toThrow();
    expect(() => createSqliteCategoryRepository(fresh)).not.toThrow();
  });
});

describe("createSqliteProductCategoryRepository", () => {
  let db: Database.Database;
  let categories: CategoryRepository;
  let productCategories: ProductCategoryRepository;

  const gifts: Category = {
    id: "c1",
    slug: "gifts",
    title: "Gifts",
    description: "Gift-worthy items.",
    parentId: null,
  };
  const toys: Category = {
    id: "c2",
    slug: "toys",
    title: "Toys",
    description: "Toys.",
    parentId: null,
  };

  beforeEach(async () => {
    db = new Database(":memory:");
    categories = createSqliteCategoryRepository(db);
    productCategories = createSqliteProductCategoryRepository(db);
    await categories.save(gifts);
    await categories.save(toys);
  });

  it("assigns a product to a category and lists it back both directions", async () => {
    await productCategories.assign("p1", "c1");
    expect(await productCategories.listCategoryIdsForProduct("p1")).toEqual(["c1"]);
    expect(await productCategories.listProductIdsInCategory("c1")).toEqual(["p1"]);
  });

  it("supports a product assigned to multiple categories", async () => {
    await productCategories.assign("p1", "c1");
    await productCategories.assign("p1", "c2");
    expect(await productCategories.listCategoryIdsForProduct("p1")).toHaveLength(2);
    expect((await productCategories.listCategoryIdsForProduct("p1")).sort()).toEqual([
      "c1",
      "c2",
    ]);
  });

  it("supports a category with multiple assigned products", async () => {
    await productCategories.assign("p1", "c1");
    await productCategories.assign("p2", "c1");
    expect((await productCategories.listProductIdsInCategory("c1")).sort()).toEqual([
      "p1",
      "p2",
    ]);
  });

  it("assign is idempotent -- re-assigning the same pair does not duplicate it", async () => {
    await productCategories.assign("p1", "c1");
    await productCategories.assign("p1", "c1");
    await productCategories.assign("p1", "c1");
    expect(await productCategories.listCategoryIdsForProduct("p1")).toEqual(["c1"]);
    expect(await productCategories.listProductIdsInCategory("c1")).toEqual(["p1"]);
  });

  it("unassigns a product from a category", async () => {
    await productCategories.assign("p1", "c1");
    await productCategories.unassign("p1", "c1");
    expect(await productCategories.listCategoryIdsForProduct("p1")).toEqual([]);
    expect(await productCategories.listProductIdsInCategory("c1")).toEqual([]);
  });

  it("unassign is a no-op (does not throw) when the pair was never assigned", async () => {
    await expect(productCategories.unassign("p1", "c1")).resolves.toBeUndefined();
  });

  it("unassigning one pair leaves other assignments for the same product/category intact", async () => {
    await productCategories.assign("p1", "c1");
    await productCategories.assign("p1", "c2");
    await productCategories.unassign("p1", "c1");
    expect(await productCategories.listCategoryIdsForProduct("p1")).toEqual(["c2"]);
  });

  it("returns an empty array for a product/category with no assignments", async () => {
    expect(await productCategories.listCategoryIdsForProduct("nobody")).toEqual([]);
    expect(await productCategories.listProductIdsInCategory("nowhere")).toEqual([]);
  });

  it("constructing the repository against the same db twice (schema init idempotency) does not crash", () => {
    expect(() => createSqliteProductCategoryRepository(db)).not.toThrow();
  });
});

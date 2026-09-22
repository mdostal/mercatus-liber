/**
 * Real, table-backed CategoryRepository/ProductCategoryRepository coverage
 * (see this package's src/categories.ts) -- these were in-memory-only across
 * every adapter, including Postgres, until now. Uses the same fake Postgres
 * Pool double as adapter.test.ts (see fake-pool.ts's header comment for why).
 */
import type { Category } from "@mercatus-liber/marketing-catalog";
import { beforeEach, describe, expect, it } from "vitest";
import { createPostgresCategoryRepository, createPostgresProductCategoryRepository } from "../src/index.js";
import { createFakePgPool, type FakePool } from "./fake-pool.js";

describe("createPostgresCategoryRepository", () => {
  let pool: FakePool;
  let categories: ReturnType<typeof createPostgresCategoryRepository>;

  beforeEach(() => {
    pool = createFakePgPool();
    categories = createPostgresCategoryRepository(pool as never);
  });

  const apparel: Category = {
    id: "c1",
    slug: "apparel",
    title: "Apparel",
    description: "Clothing and accessories.",
    parentId: null,
  };

  it("saves and retrieves a category by id", async () => {
    await categories.save(apparel);
    expect(await categories.get("c1")).toEqual(apparel);
  });

  it("retrieves a category by slug", async () => {
    await categories.save(apparel);
    const found = await categories.getBySlug("apparel");
    expect(found?.id).toBe("c1");
  });

  it("returns null for a missing category", async () => {
    expect(await categories.get("missing")).toBeNull();
    expect(await categories.getBySlug("missing")).toBeNull();
  });

  it("lists every category", async () => {
    await categories.save(apparel);
    await categories.save({ ...apparel, id: "c2", slug: "electronics", title: "Electronics" });
    const found = await categories.list();
    expect(found).toHaveLength(2);
  });

  it("upserts on save with the same id (ON CONFLICT DO UPDATE)", async () => {
    await categories.save(apparel);
    await categories.save({ ...apparel, title: "Apparel & Accessories" });
    const found = await categories.get("c1");
    expect(found?.title).toBe("Apparel & Accessories");
    expect(await categories.list()).toHaveLength(1);
  });

  it("saves and round-trips a child category's parentId", async () => {
    const shirts: Category = {
      id: "c2",
      slug: "shirts",
      title: "Shirts",
      description: "Shirts and tops.",
      parentId: "c1",
    };
    await categories.save(apparel);
    await categories.save(shirts);
    const found = await categories.get("c2");
    expect(found?.parentId).toBe("c1");
  });

  it("round-trips a top-level category's parentId as null, not undefined", async () => {
    await categories.save(apparel);
    const found = await categories.get("c1");
    expect(found?.parentId).toBeNull();
  });

  /**
   * Real, confirmed live bug (2026-09-22, epic-backlog.md row 61): print-shop
   * and Northline Home Tech genuinely share this one Postgres categories
   * table (both demos resolve the same global DATABASE_URL pool with no
   * per-demo persistence override configured). An unscoped list() returned
   * both demos' categories combined. Proves the fix: list(filter) scopes by
   * demo_slug, and an unscoped list() (no filter) still returns everything.
   */
  it("list(filter) scopes by demoSlug -- two demos' categories never bleed into each other's results", async () => {
    const printShop: Category = { ...apparel, id: "ps1", slug: "embroidery", title: "Embroidery", demoSlug: "print-shop" };
    const northline: Category = { ...apparel, id: "nl1", slug: "tv-home-theater", title: "TV & Home Theater", demoSlug: "northline" };
    await categories.save(printShop);
    await categories.save(northline);

    const printShopOnly = await categories.list({ demoSlug: "print-shop" });
    expect(printShopOnly).toEqual([printShop]);

    const northlineOnly = await categories.list({ demoSlug: "northline" });
    expect(northlineOnly).toEqual([northline]);

    const everything = await categories.list();
    expect(everything.map((c) => c.id).sort()).toEqual(["nl1", "ps1"]);
  });

  it("round-trips demoSlug through save/get, and omits it entirely when never set (backward compatible)", async () => {
    await categories.save(apparel);
    const found = await categories.get("c1");
    expect(found?.demoSlug).toBeUndefined();
    expect(found).not.toHaveProperty("demoSlug");
  });
});

describe("createPostgresProductCategoryRepository", () => {
  let pool: FakePool;
  let assignments: ReturnType<typeof createPostgresProductCategoryRepository>;

  beforeEach(() => {
    pool = createFakePgPool();
    assignments = createPostgresProductCategoryRepository(pool as never);
  });

  it("assigns a product to a category and lists both directions", async () => {
    await assignments.assign("p1", "c1");
    expect(await assignments.listCategoryIdsForProduct("p1")).toEqual(["c1"]);
    expect(await assignments.listProductIdsInCategory("c1")).toEqual(["p1"]);
  });

  it("supports a product in multiple categories, and a category with multiple products", async () => {
    await assignments.assign("p1", "c1");
    await assignments.assign("p1", "c2");
    await assignments.assign("p2", "c1");

    expect(await assignments.listCategoryIdsForProduct("p1")).toEqual(expect.arrayContaining(["c1", "c2"]));
    expect(await assignments.listProductIdsInCategory("c1")).toEqual(expect.arrayContaining(["p1", "p2"]));
  });

  it("assign is idempotent -- assigning the same pair twice doesn't duplicate", async () => {
    await assignments.assign("p1", "c1");
    await assignments.assign("p1", "c1");
    expect(await assignments.listCategoryIdsForProduct("p1")).toEqual(["c1"]);
  });

  it("unassign removes exactly the given pair", async () => {
    await assignments.assign("p1", "c1");
    await assignments.assign("p1", "c2");
    await assignments.unassign("p1", "c1");
    expect(await assignments.listCategoryIdsForProduct("p1")).toEqual(["c2"]);
  });

  it("unassigning a pair that was never assigned is a safe no-op", async () => {
    await expect(assignments.unassign("p1", "c1")).resolves.toBeUndefined();
    expect(await assignments.listCategoryIdsForProduct("p1")).toEqual([]);
  });

  it("returns an empty array for a product/category with no assignments", async () => {
    expect(await assignments.listCategoryIdsForProduct("missing")).toEqual([]);
    expect(await assignments.listProductIdsInCategory("missing")).toEqual([]);
  });
});

import { createSqliteAdapter } from "@mercatus-liber/adapter-sqlite";
import { createCatalogService, type CatalogService } from "@mercatus-liber/catalog";
import { createInMemoryEventBus } from "@mercatus-liber/core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createInMemoryCategoryRepository,
  createInMemoryProductCategoryRepository,
} from "../src/in-memory-repository.js";
import { createMarketingCatalogService, type MarketingCatalogService } from "../src/service.js";
import { CategoryNotFoundError } from "../src/types.js";

describe("marketing catalog service", () => {
  let catalog: CatalogService;
  let marketingCatalog: MarketingCatalogService;

  beforeEach(() => {
    const persistence = createSqliteAdapter(":memory:");
    catalog = createCatalogService({ persistence, events: createInMemoryEventBus() });
    marketingCatalog = createMarketingCatalogService({
      categories: createInMemoryCategoryRepository(),
      assignments: createInMemoryProductCategoryRepository(),
      attributes: catalog, // structural typing -- catalog is never imported by src/, only by this test
      rules: [{ attributeKey: "printer_compatible", attributeValue: true, categorySlug: "3d-printing" }],
    });
  });

  it("reconstructs a category hierarchy from flat data via listChildCategories", async () => {
    const toys = await marketingCatalog.createCategory({ slug: "toys", title: "Toys", description: "", parentId: null });
    const kids = await marketingCatalog.createCategory({ slug: "kids", title: "Kids", description: "", parentId: toys.id });
    const legos = await marketingCatalog.createCategory({ slug: "legos", title: "Legos", description: "", parentId: kids.id });

    expect(await marketingCatalog.listChildCategories(null)).toEqual([toys]);
    expect(await marketingCatalog.listChildCategories(toys.id)).toEqual([kids]);
    expect(await marketingCatalog.listChildCategories(kids.id)).toEqual([legos]);
  });

  it("assigns a product to multiple categories independently (many-to-many, not overwrite)", async () => {
    const product = await catalog.createProduct({
      slug: "p1",
      title: "P1",
      description: "d",
      identifyingAttributeKeys: [],
    });
    const catA = await marketingCatalog.createCategory({ slug: "a", title: "A", description: "", parentId: null });
    const catB = await marketingCatalog.createCategory({ slug: "b", title: "B", description: "", parentId: null });

    await marketingCatalog.assignProductToCategory(product.id, catA.id);
    await marketingCatalog.assignProductToCategory(product.id, catB.id);

    const forProduct = await marketingCatalog.listCategoriesForProduct(product.id);
    expect(forProduct.map((c) => c.slug).sort()).toEqual(["a", "b"]);
    expect(await marketingCatalog.listProductIdsInCategory(catA.id)).toEqual([product.id]);
    expect(await marketingCatalog.listProductIdsInCategory(catB.id)).toEqual([product.id]);
  });

  it("unassign removes only that specific product-category pairing", async () => {
    const product = await catalog.createProduct({ slug: "p2", title: "P2", description: "d", identifyingAttributeKeys: [] });
    const catA = await marketingCatalog.createCategory({ slug: "a2", title: "A2", description: "", parentId: null });
    const catB = await marketingCatalog.createCategory({ slug: "b2", title: "B2", description: "", parentId: null });
    await marketingCatalog.assignProductToCategory(product.id, catA.id);
    await marketingCatalog.assignProductToCategory(product.id, catB.id);

    await marketingCatalog.unassignProductFromCategory(product.id, catA.id);

    const forProduct = await marketingCatalog.listCategoriesForProduct(product.id);
    expect(forProduct.map((c) => c.slug)).toEqual(["b2"]);
  });

  it("throws CategoryNotFoundError when assigning to a nonexistent category", async () => {
    const product = await catalog.createProduct({ slug: "p3", title: "P3", description: "d", identifyingAttributeKeys: [] });
    await expect(marketingCatalog.assignProductToCategory(product.id, "missing")).rejects.toThrow(CategoryNotFoundError);
  });

  it("suggestCategories returns assistive, rule-based matches without auto-applying them", async () => {
    const product = await catalog.createProduct({ slug: "p4", title: "P4", description: "d", identifyingAttributeKeys: [] });
    await catalog.setAttribute({ productId: product.id, key: "printer_compatible", value: true, facetable: true });

    const suggestions = await marketingCatalog.suggestCategories(product.id);
    expect(suggestions).toEqual([
      { categorySlug: "3d-printing", reason: 'Product has attribute "printer_compatible" = true' },
    ]);
    // Assistive only -- no assignment happened as a side effect of suggesting.
    expect(await marketingCatalog.listCategoriesForProduct(product.id)).toEqual([]);
  });

  it("suggestCategories returns nothing when no rule matches the product's attributes", async () => {
    const product = await catalog.createProduct({ slug: "p5", title: "P5", description: "d", identifyingAttributeKeys: [] });
    expect(await marketingCatalog.suggestCategories(product.id)).toEqual([]);
  });

  /**
   * Real, confirmed live bug (2026-09-22, epic-backlog.md row 61): print-shop
   * and Northline Home Tech genuinely share one Postgres categories table
   * (both resolve the same global DATABASE_URL-backed pool with no per-demo
   * persistence override configured -- see
   * apps/reference-storefront/lib/services.ts's resolveDemoPersistenceEnv).
   * listChildCategories(null) (the exact call buildNavLinks() in
   * app/demo/[demoSlug]/layout.tsx uses to build a demo's shop-category nav)
   * had no demo-scoping concept at all, so print-shop's nav showed
   * Northline's top-level categories mixed in, and vice versa. This proves
   * the fix: two different demos' top-level categories never bleed into
   * each other's demoSlug-scoped listChildCategories/listCategories
   * results, and an unscoped call (e.g. a legitimate cross-demo admin view)
   * still returns everything, fully backward compatible -- same shape as
   * @mercatus-liber/cms's analogous Page.demoSlug test (epic 60).
   */
  it("listChildCategories/listCategories scope by demoSlug -- two different demos' categories never bleed into each other's results", async () => {
    const printShopEmbroidery = await marketingCatalog.createCategory({
      slug: "embroidery",
      title: "Embroidery",
      description: "",
      parentId: null,
      demoSlug: "print-shop",
    });
    const printShopApparel = await marketingCatalog.createCategory({
      slug: "apparel",
      title: "Apparel",
      description: "",
      parentId: null,
      demoSlug: "print-shop",
    });

    const northlineTv = await marketingCatalog.createCategory({
      slug: "tv-home-theater",
      title: "TV & Home Theater",
      description: "",
      parentId: null,
      demoSlug: "northline",
    });

    const printShopTopLevel = await marketingCatalog.listChildCategories(null, { demoSlug: "print-shop" });
    expect(printShopTopLevel.map((c) => c.slug).sort()).toEqual(["apparel", "embroidery"]);
    expect(printShopTopLevel.some((c) => c.slug === "tv-home-theater")).toBe(false);

    const northlineTopLevel = await marketingCatalog.listChildCategories(null, { demoSlug: "northline" });
    expect(northlineTopLevel.map((c) => c.slug)).toEqual(["tv-home-theater"]);

    const northlineAll = await marketingCatalog.listCategories({ demoSlug: "northline" });
    expect(northlineAll.map((c) => c.id)).toEqual([northlineTv.id]);

    // Unscoped listCategories()/listChildCategories() (no demoSlug filter)
    // legitimately still return every demo's categories -- backward
    // compatible, for admin surfaces that genuinely want the whole
    // cross-demo picture.
    const everything = await marketingCatalog.listCategories();
    expect(everything.map((c) => c.id).sort()).toEqual(
      [printShopEmbroidery.id, printShopApparel.id, northlineTv.id].sort(),
    );
    const everyTopLevel = await marketingCatalog.listChildCategories(null);
    expect(everyTopLevel.map((c) => c.id).sort()).toEqual(
      [printShopEmbroidery.id, printShopApparel.id, northlineTv.id].sort(),
    );
  });
});

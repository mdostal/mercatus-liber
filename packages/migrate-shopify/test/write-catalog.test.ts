import { beforeEach, describe, expect, it } from "vitest";
import type { ImportedCollection, ImportedProduct, ShopifyCatalogSnapshot } from "../src/types.js";
import { importShopifyCatalog } from "../src/write-catalog.js";
import { createTestPersistence, snapshotPersistence, type TestPersistence } from "./test-persistence.js";

function product(overrides: Partial<ImportedProduct["product"]> = {}, variants: ImportedProduct["variants"] = []): ImportedProduct {
  const base = {
    id: "shopify-raw-id-should-be-ignored",
    slug: "dragon-cable-organizer",
    title: "Dragon Cable Organizer",
    description: "A cable organizer shaped like a dragon.",
    identifyingAttributeKeys: ["color"],
    status: "active" as const,
    ...overrides,
  };
  return { shopifyProductId: "gid://shopify/Product/1", product: base, variants };
}

function variant(color: string, priceCents: number, onHand: number): ImportedProduct["variants"][number] {
  return {
    shopifyVariantId: `gid://shopify/ProductVariant/${color}`,
    sku: {
      id: `shopify-variant-${color}`,
      productId: "irrelevant-shopify-side-id",
      identifyingAttributes: [{ key: "color", value: color }],
      price: { amount: priceCents, currency: "USD" },
      status: "active",
    },
    inventory: { onHand, locations: [{ locationId: "loc-1", locationName: "Main", onHand, available: onHand }] },
  };
}

function collection(overrides: Partial<ImportedCollection> = {}): ImportedCollection {
  return {
    shopifyCollectionId: "gid://shopify/Collection/1",
    title: "Organizers",
    handle: "organizers",
    description: "Cable organizers.",
    descriptionHtml: "<p>Cable organizers.</p>",
    productHandles: ["dragon-cable-organizer"],
    ...overrides,
  };
}

function buildSnapshot(): ShopifyCatalogSnapshot {
  return {
    products: [
      product({}, [variant("red", 1999, 4), variant("blue", 1999, 2)]),
      product(
        { slug: "phoenix-mug", title: "Phoenix Mug", description: "A mug.", identifyingAttributeKeys: [] },
        [variant("", 1299, 10)].map((v) => ({ ...v, sku: { ...v.sku, identifyingAttributes: [] } })),
      ),
    ],
    collections: [collection()],
  };
}

describe("importShopifyCatalog", () => {
  let target: TestPersistence;

  beforeEach(() => {
    target = createTestPersistence();
  });

  it("defaults to dry-run and writes nothing", async () => {
    const snapshot = buildSnapshot();
    const report = await importShopifyCatalog(snapshot, target);
    expect(report.dryRun).toBe(true);
    expect(report.products.created).toBe(2);
    expect(report.skus.created).toBe(3);
    expect(report.categories.created).toBe(1);

    const products = await target.catalog.listProducts();
    expect(products).toHaveLength(0);
  });

  it("dry run reports counts, a real sample of titles, and leaves the target genuinely unchanged", async () => {
    const snapshot = buildSnapshot();
    const before = await snapshotPersistence(target);

    const report = await importShopifyCatalog(snapshot, target, { dryRun: true });

    const after = await snapshotPersistence(target);
    expect(after).toEqual(before);
    expect(after.products).toHaveLength(0);
    expect(after.skus).toHaveLength(0);
    expect(after.categories).toHaveLength(0);

    expect(report.dryRun).toBe(true);
    expect(report.products).toEqual({ total: 2, created: 2, skipped: 0, failed: 0 });
    expect(report.skus).toEqual({ total: 3, created: 3, skipped: 0, failed: 0 });
    expect(report.categories).toEqual({ total: 1, created: 1, skipped: 0, failed: 0 });
    expect(report.sampleProductTitles).toEqual(["Dragon Cable Organizer", "Phoenix Mug"]);
    expect(report.attention).toEqual([]);
  });

  it("a real (non-dry-run) import creates real products, SKUs, stock levels, categories, and assignments through the real service layer", async () => {
    const snapshot = buildSnapshot();
    const report = await importShopifyCatalog(snapshot, target, { dryRun: false });

    expect(report.dryRun).toBe(false);
    expect(report.products).toEqual({ total: 2, created: 2, skipped: 0, failed: 0 });
    expect(report.skus).toEqual({ total: 3, created: 3, skipped: 0, failed: 0 });
    expect(report.categories).toEqual({ total: 1, created: 1, skipped: 0, failed: 0 });
    expect(report.attention).toEqual([]);

    const dragon = await target.catalog.getProductBySlug("dragon-cable-organizer");
    expect(dragon).not.toBeNull();
    expect(dragon?.title).toBe("Dragon Cable Organizer");
    expect(dragon?.status).toBe("draft"); // CatalogService.createProduct always starts a product as draft -- real validation, not bypassed.

    const skus = await target.catalog.listSkusByProduct(dragon!.id);
    expect(skus).toHaveLength(2);
    const red = skus.find((s) => s.identifyingAttributes.some((a) => a.value === "red"));
    expect(red?.price).toEqual({ amount: 1999, currency: "USD" });
    const redStock = await target.inventory.getStock(red!.id);
    expect(redStock?.onHand).toBe(4);

    const category = await target.marketingCatalog.getCategoryBySlug("organizers");
    expect(category).not.toBeNull();
    const categoriesForProduct = await target.marketingCatalog.listCategoriesForProduct(dragon!.id);
    expect(categoriesForProduct.map((c) => c.slug)).toEqual(["organizers"]);
  });

  it("running the import twice against identical input and the same target creates zero duplicate products, categories, or SKUs", async () => {
    const snapshot = buildSnapshot();

    const firstReport = await importShopifyCatalog(snapshot, target, { dryRun: false });
    expect(firstReport.products.created).toBe(2);
    expect(firstReport.skus.created).toBe(3);
    expect(firstReport.categories.created).toBe(1);

    const afterFirst = await snapshotPersistence(target);

    const secondReport = await importShopifyCatalog(snapshot, target, { dryRun: false });

    expect(secondReport.products).toEqual({ total: 2, created: 0, skipped: 2, failed: 0 });
    expect(secondReport.skus).toEqual({ total: 3, created: 0, skipped: 3, failed: 0 });
    expect(secondReport.categories).toEqual({ total: 1, created: 0, skipped: 1, failed: 0 });
    expect(secondReport.attention).toEqual([]);

    const afterSecond = await snapshotPersistence(target);
    expect(afterSecond.products).toHaveLength(afterFirst.products.length);
    expect(afterSecond.skus).toHaveLength(afterFirst.skus.length);
    expect(afterSecond.categories).toHaveLength(afterFirst.categories.length);

    const allProducts = await target.catalog.listProducts();
    expect(allProducts).toHaveLength(2);
    const allSlugs = allProducts.map((p) => p.slug).sort();
    expect(allSlugs).toEqual(["dragon-cable-organizer", "phoenix-mug"]);

    const allCategories = await target.marketingCatalog.listCategories();
    expect(allCategories).toHaveLength(1);
  });

  it("is safe to re-run after a partial failure -- a second run only redoes what actually failed, without duplicating what already succeeded", async () => {
    const snapshot = buildSnapshot();
    // Simulate a partial first run: one product already landed in the
    // target (e.g. a previous process crashed after creating it), the rest
    // of the snapshot was never imported.
    await target.catalog.createProduct({
      slug: "dragon-cable-organizer",
      title: "Dragon Cable Organizer",
      description: "A cable organizer shaped like a dragon.",
      identifyingAttributeKeys: ["color"],
    });

    const report = await importShopifyCatalog(snapshot, target, { dryRun: false });

    expect(report.products).toEqual({ total: 2, created: 1, skipped: 1, failed: 0 });
    // Both variants of the pre-existing product still get created fresh
    // (the pre-existing product had none yet), plus the second product's.
    expect(report.skus).toEqual({ total: 3, created: 3, skipped: 0, failed: 0 });

    const allProducts = await target.catalog.listProducts();
    expect(allProducts).toHaveLength(2);
  });

  it("flags a variant whose identifying attributes don't match its product's identifyingAttributeKeys, in a dry run, without writing anything", async () => {
    const mismatched = product({ identifyingAttributeKeys: ["color"] }, [
      {
        shopifyVariantId: "gid://shopify/ProductVariant/bad",
        sku: {
          id: "shopify-variant-bad",
          productId: "irrelevant",
          identifyingAttributes: [{ key: "size", value: "large" }],
          price: { amount: 500, currency: "USD" },
          status: "active",
        },
        inventory: { onHand: 1, locations: [] },
      },
    ]);
    const snapshot: ShopifyCatalogSnapshot = { products: [mismatched], collections: [] };

    const report = await importShopifyCatalog(snapshot, target, { dryRun: true });

    expect(report.skus.failed).toBe(1);
    expect(report.attention).toHaveLength(1);
    expect(report.attention[0]).toMatchObject({ kind: "sku" });
    expect(report.attention[0]?.reason).toContain("do not match");

    const products = await target.catalog.listProducts();
    expect(products).toHaveLength(0);
  });

  it("flags the same identifying-attribute mismatch on a real (non-dry-run) run too, via the real CatalogService.createSku validation, without aborting the rest of the import", async () => {
    const good = product({ slug: "good-product" }, [variant("red", 1000, 1)]);
    const bad = product({ slug: "bad-product", identifyingAttributeKeys: ["color"] }, [
      {
        shopifyVariantId: "gid://shopify/ProductVariant/bad",
        sku: {
          id: "shopify-variant-bad",
          productId: "irrelevant",
          identifyingAttributes: [{ key: "size", value: "large" }],
          price: { amount: 500, currency: "USD" },
          status: "active",
        },
        inventory: { onHand: 1, locations: [] },
      },
    ]);
    const snapshot: ShopifyCatalogSnapshot = { products: [good, bad], collections: [] };

    const report = await importShopifyCatalog(snapshot, target, { dryRun: false });

    expect(report.products.created).toBe(2); // both products are created -- only the bad SKU is rejected.
    expect(report.skus.created).toBe(1);
    expect(report.skus.failed).toBe(1);
    expect(report.attention.some((a) => a.kind === "sku" && a.reason.includes("identifying"))).toBe(true);

    const goodProduct = await target.catalog.getProductBySlug("good-product");
    const goodSkus = await target.catalog.listSkusByProduct(goodProduct!.id);
    expect(goodSkus).toHaveLength(1);

    const badProduct = await target.catalog.getProductBySlug("bad-product");
    const badSkus = await target.catalog.listSkusByProduct(badProduct!.id);
    expect(badSkus).toHaveLength(0);
  });

  it("flags a collection's product-handle reference that is not present anywhere in the snapshot", async () => {
    const snapshot: ShopifyCatalogSnapshot = {
      products: [],
      collections: [collection({ productHandles: ["ghost-product"] })],
    };

    const report = await importShopifyCatalog(snapshot, target, { dryRun: true });

    expect(report.attention).toHaveLength(1);
    expect(report.attention[0]).toMatchObject({ kind: "assignment" });
    expect(report.attention[0]?.reason).toContain("not present anywhere in this Shopify snapshot");
  });
});

/**
 * demo15b-02: proves the Northline seed path (epic 15b's public demo)
 * works end to end -- including that the admin UI's read path and the
 * AI/MCP interface's tool handlers require ZERO seed-specific code to
 * work with it, the same wiring apps/reference-storefront already uses
 * for the default dragon-merch seed.
 *
 * demo-store-northline-depth / northline-depth-01: verifies the 4 real
 * categories (not 1 catch-all), tiered SKU variants for 2 services (not one
 * flat SKU each), and a real, distinct, published CMS location page for all
 * 8 DEMO_SERVICE_AREAS entries (not 1 of 8) -- including that no location
 * page's content claims a service is available in an area it isn't
 * actually assigned to.
 */
import { createCommerceToolHandlers } from "@mercatus-liber/ai-interface";
import { createCartService, createInMemoryCartRepository } from "@mercatus-liber/cart";
import { createCheckoutOrdersService, createInMemoryOrderRepository } from "@mercatus-liber/checkout-orders";
import { createInMemoryIndex, registerCatalogSearchSync } from "@mercatus-liber/search";
import { describe, expect, it } from "vitest";
import { seedCatalog } from "../lib/seed.js";
import { seedNorthlineDemo } from "../lib/seed-northline.js";
import { buildTestCatalogServices } from "./helpers.js";

const ALL_SERVICE_AREA_SLUGS = [
  "cedarbrook-oh",
  "maple-ridge-mn",
  "silver-creek-co",
  "brightwater-wa",
  "ashford-ga",
  "millbrook-nc",
  "fox-hollow-in",
  "harborview-me",
];

describe("Northline demo seed (epic 15b public demo)", () => {
  it("seeds 7 active services, 8 service areas, and per-area subset assignment (not every service everywhere)", async () => {
    const { catalog, marketingCatalog, cms, serviceAreas } = buildTestCatalogServices();
    await seedNorthlineDemo(catalog, marketingCatalog, cms, serviceAreas);

    const products = await catalog.listProducts({ status: "active" });
    expect(products.map((p) => p.slug).sort()).toEqual([
      "fiber-internet-install",
      "home-theater-setup",
      "security-camera-install",
      "smart-lock-install",
      "smart-thermostat-install",
      "tv-wall-mounting",
      "video-doorbell-install",
    ]);

    const areas = await serviceAreas.listServiceAreas();
    expect(areas).toHaveLength(8);

    const homeTheater = products.find((p) => p.slug === "home-theater-setup")!;
    const tvMounting = products.find((p) => p.slug === "tv-wall-mounting")!;
    const theaterAreas = await serviceAreas.listServiceAreasForProduct(homeTheater.id);
    const mountingAreas = await serviceAreas.listServiceAreasForProduct(tvMounting.id);

    // Home theater setup is a premium service, available in only 3 of 8 areas.
    expect(theaterAreas).toHaveLength(3);
    // TV mounting is available everywhere.
    expect(mountingAreas).toHaveLength(8);
  });

  it("has exactly 4 real categories, each with at least 1 real product assigned, none empty", async () => {
    const { catalog, marketingCatalog, cms, serviceAreas } = buildTestCatalogServices();
    await seedNorthlineDemo(catalog, marketingCatalog, cms, serviceAreas);

    const categories = await marketingCatalog.listCategories();
    expect(categories.map((c) => c.slug).sort()).toEqual(["networking-fiber", "security-cameras", "smart-home-automation", "tv-home-theater"]);

    for (const category of categories) {
      const productIds = await marketingCatalog.listProductIdsInCategory(category.id);
      expect(productIds.length).toBeGreaterThanOrEqual(1);
    }

    // Every product lands in exactly one of the 4 categories -- nothing left
    // uncategorized, nothing double-booked.
    const products = await catalog.listProducts({ status: "active" });
    for (const product of products) {
      const productCategories = await marketingCatalog.listCategoriesForProduct(product.id);
      expect(productCategories).toHaveLength(1);
    }
  });

  it("gives security-camera-install 3 real SKUs at 3 distinct prices, and home-theater-setup >=2 real SKUs at distinct prices", async () => {
    const { catalog, marketingCatalog, cms, serviceAreas } = buildTestCatalogServices();
    await seedNorthlineDemo(catalog, marketingCatalog, cms, serviceAreas);

    const cameraProduct = (await catalog.listProducts({ status: "active" })).find((p) => p.slug === "security-camera-install")!;
    const cameraSkus = await catalog.listSkusByProduct(cameraProduct.id);
    expect(cameraSkus).toHaveLength(3);
    const cameraPrices = cameraSkus.map((s) => s.price.amount).sort((a, b) => a - b);
    expect(new Set(cameraPrices).size).toBe(3);
    expect(cameraPrices).toEqual([29900, 89900, 159900]);

    const theaterProduct = (await catalog.listProducts({ status: "active" })).find((p) => p.slug === "home-theater-setup")!;
    const theaterSkus = await catalog.listSkusByProduct(theaterProduct.id);
    expect(theaterSkus.length).toBeGreaterThanOrEqual(2);
    const theaterPrices = theaterSkus.map((s) => s.price.amount);
    expect(new Set(theaterPrices).size).toBe(theaterPrices.length);
  });

  it("publishes a real, distinct, published CMS location page for all 8 service areas", async () => {
    const { catalog, marketingCatalog, cms, serviceAreas } = buildTestCatalogServices();
    await seedNorthlineDemo(catalog, marketingCatalog, cms, serviceAreas);

    const home = await cms.getPageBySlug("home");
    expect(home?.status).toBe("published");
    expect(home?.sections[0]).toMatchObject({ componentType: "hero-banner", config: { headline: "Northline Home Tech" } });

    const pages = await Promise.all(ALL_SERVICE_AREA_SLUGS.map((slug) => cms.getPageBySlug(slug)));
    for (const [i, page] of pages.entries()) {
      expect(page, `expected a published location page for ${ALL_SERVICE_AREA_SLUGS[i]}`).not.toBeNull();
      expect(page?.pageType).toBe("location");
      expect(page?.status).toBe("published");
    }

    // Not byte-identical copy across areas: every blurb and every hours
    // string is genuinely distinct.
    const blurbs = pages.map((p) => (p!.sections[0]!.config as { blurb: string }).blurb);
    expect(new Set(blurbs).size).toBe(blurbs.length);
    const hours = pages.map((p) => (p!.sections[0]!.config as { hours: string }).hours);
    expect(new Set(hours).size).toBe(hours.length);
  });

  it("never claims a service is available in an area it isn't actually assigned to (cross-checked against real areaIndices membership)", async () => {
    const { catalog, marketingCatalog, cms, serviceAreas } = buildTestCatalogServices();
    await seedNorthlineDemo(catalog, marketingCatalog, cms, serviceAreas);

    const areas = await serviceAreas.listServiceAreas();
    const products = await catalog.listProducts({ status: "active" });

    for (const slug of ALL_SERVICE_AREA_SLUGS) {
      const page = await cms.getPageBySlug(slug);
      expect(page).not.toBeNull();
      const config = page!.sections[0]!.config as { servicesOffered: string[] };
      const area = areas.find((a) => a.slug === slug)!;

      // Ground truth: which products (by title) are really assigned to this
      // area, per service-areas' own product-to-area assignment data --
      // not a second hand-typed copy of the mapping.
      const realTitlesForArea = new Set<string>();
      for (const product of products) {
        const productAreas = await serviceAreas.listServiceAreasForProduct(product.id);
        if (productAreas.some((a) => a.id === area.id)) realTitlesForArea.add(product.title);
      }

      // Everything the page claims is offered must really be assigned here...
      for (const claimedTitle of config.servicesOffered) {
        expect(realTitlesForArea.has(claimedTitle), `${slug} page falsely claims "${claimedTitle}" is available there`).toBe(true);
      }
      // ...and nothing that's really assigned here is missing from the page.
      expect(new Set(config.servicesOffered)).toEqual(realTitlesForArea);
    }

    // The specific example called out in the design discussion: fiber and
    // home theater are NOT offered in Harborview, ME -- its page must not
    // claim either.
    const harborview = await cms.getPageBySlug("harborview-me");
    const harborviewOffered = (harborview!.sections[0]!.config as { servicesOffered: string[] }).servicesOffered;
    expect(harborviewOffered).not.toContain("Fiber Internet Installation");
    expect(harborviewOffered).not.toContain("Home Theater Setup");
  });

  it("admin/catalog read path (catalog.listProducts) works against the Northline seed with zero admin-specific code", async () => {
    const { catalog, marketingCatalog, cms, serviceAreas } = buildTestCatalogServices();
    await seedNorthlineDemo(catalog, marketingCatalog, cms, serviceAreas);

    const products = await catalog.listProducts();
    expect(products.length).toBeGreaterThan(0);
    for (const product of products) {
      expect(product.id).toBeTruthy();
      expect(product.title).toBeTruthy();
      expect(product.status).toBe("active");
    }
  });

  it("the AI/MCP interface's search_products and get_product tools work against the Northline seed with zero seed-specific code", async () => {
    const { events, catalog, marketingCatalog, cms, serviceAreas } = buildTestCatalogServices();
    await seedNorthlineDemo(catalog, marketingCatalog, cms, serviceAreas);

    const search = createInMemoryIndex();
    registerCatalogSearchSync({ events, index: search, products: catalog });
    // Re-index -- the sync subscriber only reacts to events published AFTER
    // registration, and seeding already happened above.
    const seeded = await catalog.listProducts();
    for (const product of seeded) {
      const attributes = await catalog.listAttributes(product.id);
      await search.index({ id: product.id, title: product.title, description: product.description, facets: Object.fromEntries(attributes.map((a) => [a.key, a.value])) });
    }

    const cart = createCartService({ repository: createInMemoryCartRepository(), skus: catalog, events });
    const checkout = createCheckoutOrdersService({
      repository: createInMemoryOrderRepository(),
      cart,
      payments: { createPaymentSession: async () => ({ sessionId: "s", redirectUrl: "https://example.com" }) },
      events,
    });

    const handlers = createCommerceToolHandlers({
      catalog,
      search,
      cart,
      checkout,
      catalogAdmin: catalog,
      cms,
      inventory: { getStock: async () => null, setStock: async () => {} },
    });

    const searchResult = (await handlers.search_products!({ text: "TV" })) as { title: string }[];
    expect(searchResult.some((r) => r.title === "TV Wall Mounting")).toBe(true);

    const productResult = (await handlers.get_product!({ slug: "fiber-internet-install" })) as { product: { title: string } };
    expect(productResult.product.title).toBe("Fiber Internet Installation");
  });

  it("DEMO_BRAND unset (default) still seeds the original dragon-merch catalog -- zero regression", async () => {
    const { catalog, marketingCatalog, cms, inventory, serviceAreas } = buildTestCatalogServices();
    await seedCatalog(catalog, marketingCatalog, cms, inventory, serviceAreas);

    const products = await catalog.listProducts();
    expect(products.map((p) => p.slug).sort()).toEqual(["dragon-cable-organizer", "dragon-desk-mat"]);
  });
});

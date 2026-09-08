/**
 * demo15b-02: proves the Northline seed path (epic 15b's public demo)
 * works end to end -- including that the admin UI's read path and the
 * AI/MCP interface's tool handlers require ZERO seed-specific code to
 * work with it, the same wiring apps/reference-storefront already uses
 * for the default dragon-merch seed.
 */
import { createCommerceToolHandlers } from "@mercatus-liber/ai-interface";
import { createCartService, createInMemoryCartRepository } from "@mercatus-liber/cart";
import { createCheckoutOrdersService, createInMemoryOrderRepository } from "@mercatus-liber/checkout-orders";
import { createInMemoryIndex, registerCatalogSearchSync } from "@mercatus-liber/search";
import { describe, expect, it } from "vitest";
import { seedCatalog } from "../lib/seed.js";
import { seedNorthlineDemo } from "../lib/seed-northline.js";
import { buildTestCatalogServices } from "./helpers.js";

describe("Northline demo seed (epic 15b public demo)", () => {
  it("seeds 5 active services, 8 service areas, and per-area subset assignment (not every service everywhere)", async () => {
    const { catalog, marketingCatalog, cms, serviceAreas } = buildTestCatalogServices();
    await seedNorthlineDemo(catalog, marketingCatalog, cms, serviceAreas);

    const products = await catalog.listProducts({ status: "active" });
    expect(products.map((p) => p.slug).sort()).toEqual([
      "fiber-internet-install",
      "home-theater-setup",
      "security-camera-install",
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

  it("publishes a CMS home page and a location page for the Northline brand", async () => {
    const { catalog, marketingCatalog, cms, serviceAreas } = buildTestCatalogServices();
    await seedNorthlineDemo(catalog, marketingCatalog, cms, serviceAreas);

    const home = await cms.getPageBySlug("home");
    expect(home?.status).toBe("published");
    expect(home?.sections[0]).toMatchObject({ componentType: "hero-banner", config: { headline: "Northline Home Tech" } });

    const location = await cms.getPageBySlug("cedarbrook-oh");
    expect(location?.pageType).toBe("location");
    expect(location?.status).toBe("published");
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

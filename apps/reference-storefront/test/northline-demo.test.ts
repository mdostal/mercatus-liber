/**
 * demo15b-02: proves the Northline seed path (epic 15b's public demo)
 * works end to end -- including that the admin UI's read path and the
 * AI/MCP interface's tool handlers require ZERO seed-specific code to
 * work with it, the same wiring apps/reference-storefront already uses
 * for the default print-shop seed.
 *
 * demo-store-northline-depth / northline-depth-01: verifies the 4 real
 * categories (not 1 catch-all), tiered SKU variants for 2 services (not one
 * flat SKU each), and a real, distinct, published CMS location page for all
 * 8 DEMO_SERVICE_AREAS entries (not 1 of 8) -- including that no location
 * page's content claims a service is available in an area it isn't
 * actually assigned to.
 */
import { createCommerceToolHandlers } from "@mercatus-liber/ai-interface";
import { createAdvertisingService, createInMemoryCampaignRepository } from "@mercatus-liber/advertising";
import { createBundlesService, createInMemoryBundleRepository } from "@mercatus-liber/bundles";
import { createCartService, createInMemoryCartRepository } from "@mercatus-liber/cart";
import { createCheckoutOrdersService, createInMemoryOrderRepository } from "@mercatus-liber/checkout-orders";
import { createInMemoryPromotionRepository, createPromotionsService } from "@mercatus-liber/promotions";
import { createInMemoryRecommendationRepository, createRecommendationsService } from "@mercatus-liber/recommendations";
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
  it("seeds 31 active services (demo-store-northline-depth, northline-depth-02's ~4x catalog-depth pass), 8 service areas, and per-area subset assignment (not every service everywhere)", async () => {
    const { catalog, marketingCatalog, cms, inventory, serviceAreas } = buildTestCatalogServices();
    await seedNorthlineDemo(catalog, marketingCatalog, cms, serviceAreas, inventory);

    const products = await catalog.listProducts({ status: "active" });
    expect(products.map((p) => p.slug).sort()).toEqual(
      [
        // Original 7 (northline-depth-01) -- unchanged.
        "fiber-internet-install",
        "home-theater-setup",
        "security-camera-install",
        "smart-lock-install",
        "smart-thermostat-install",
        "tv-wall-mounting",
        "video-doorbell-install",
        // TV & Home Theater additions.
        "av-rack-equipment-setup",
        "in-wall-speaker-installation",
        "outdoor-tv-installation",
        "projector-screen-installation",
        "soundbar-subwoofer-installation",
        "tv-cable-concealment",
        "tv-mount-relocation",
        "universal-remote-control-programming",
        // Security & Cameras additions.
        "floodlight-camera-install",
        "long-range-perimeter-camera-install",
        "nvr-dvr-setup",
        "security-system-monitoring-install",
        "smart-access-control-keypad-install",
        // Networking & Fiber additions.
        "ethernet-over-powerline-setup",
        "network-rack-cabinet-setup",
        "structured-ethernet-wiring-install",
        "whole-home-wifi-mesh-install",
        "wifi-signal-site-survey-optimization",
        // Smart Home & Automation additions.
        "smart-blinds-shades-install",
        "smart-garage-door-opener-install",
        "smart-hub-automation-setup",
        "smart-lighting-install",
        "smart-smoke-co-detector-install",
        "whole-home-audio-install",
      ].sort(),
    );

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

  it("has 4 real top-level categories and 4 real subcategories under 2 of them (\"make the store feel real\" pass), each with at least 1 real product assigned, none empty", async () => {
    const { catalog, marketingCatalog, cms, inventory, serviceAreas } = buildTestCatalogServices();
    await seedNorthlineDemo(catalog, marketingCatalog, cms, serviceAreas, inventory);

    const categories = await marketingCatalog.listCategories();
    expect(categories.map((c) => c.slug).sort()).toEqual(
      [
        "networking-fiber",
        "security-cameras",
        "smart-home-automation",
        "tv-home-theater",
        // "make the store feel real" pass's 4 real subcategories -- 2 under
        // tv-home-theater, 2 under smart-home-automation. Security & Cameras
        // and Networking & Fiber are left with no subcategories, proving a
        // category can legitimately have zero children.
        "home-theater-audio",
        "smart-lighting-access",
        "tv-mounting",
        "whole-home-automation",
      ].sort(),
    );

    for (const category of categories) {
      const productIds = await marketingCatalog.listProductIdsInCategory(category.id);
      expect(productIds.length, `expected ${category.slug} to have at least 1 real product`).toBeGreaterThanOrEqual(1);
    }

    // Every product lands in its real top-level category, plus its real
    // subcategory when its top-level category has one ("make the store feel
    // real" pass's many-to-many parent+child assignment) -- nothing left
    // uncategorized, and nothing lands in a subcategory without also still
    // carrying its original top-level parent assignment.
    const products = await catalog.listProducts({ status: "active" });
    for (const product of products) {
      const productCategories = await marketingCatalog.listCategoriesForProduct(product.id);
      const hasRealSubcategory = productCategories.some((c) => c.parentId !== null);
      expect(productCategories).toHaveLength(hasRealSubcategory ? 2 : 1);
    }
  });

  it("gives security-camera-install 3 real SKUs at 3 distinct prices, and home-theater-setup >=2 real SKUs at distinct prices", async () => {
    const { catalog, marketingCatalog, cms, inventory, serviceAreas } = buildTestCatalogServices();
    await seedNorthlineDemo(catalog, marketingCatalog, cms, serviceAreas, inventory);

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
    const { catalog, marketingCatalog, cms, inventory, serviceAreas } = buildTestCatalogServices();
    await seedNorthlineDemo(catalog, marketingCatalog, cms, serviceAreas, inventory);

    const home = await cms.getPageBySlug("home-northline");
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
    const { catalog, marketingCatalog, cms, inventory, serviceAreas } = buildTestCatalogServices();
    await seedNorthlineDemo(catalog, marketingCatalog, cms, serviceAreas, inventory);

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
    const { catalog, marketingCatalog, cms, inventory, serviceAreas } = buildTestCatalogServices();
    await seedNorthlineDemo(catalog, marketingCatalog, cms, serviceAreas, inventory);

    const products = await catalog.listProducts();
    expect(products.length).toBeGreaterThan(0);
    for (const product of products) {
      expect(product.id).toBeTruthy();
      expect(product.title).toBeTruthy();
      expect(product.status).toBe("active");
    }
  });

  it("the AI/MCP interface's search_products and get_product tools work against the Northline seed with zero seed-specific code", async () => {
    const { events, catalog, marketingCatalog, cms, inventory, serviceAreas } = buildTestCatalogServices();
    await seedNorthlineDemo(catalog, marketingCatalog, cms, serviceAreas, inventory);

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

  it("\"make the store feel real\" pass: real subcategories, a real promotion, a real cumulative-tier bundle, real recommendation rules, and a real campaign", async () => {
    const { events, catalog, marketingCatalog, cms, inventory, serviceAreas } = buildTestCatalogServices();
    // promotions subscribes to the real EventBus at construction time (its
    // checkout.order.paid -> redemption-count listener), so it needs the
    // same real, already-constructed bus the other services share -- same
    // wiring shape as admin-mutation-guard.test.ts and
    // bundle-promotion-integration.test.ts.
    const promotions = createPromotionsService({ repository: createInMemoryPromotionRepository(), events });
    const bundles = createBundlesService({ repository: createInMemoryBundleRepository(), skuLookup: catalog });
    const recommendations = createRecommendationsService({ repository: createInMemoryRecommendationRepository() });
    const advertising = createAdvertisingService({ repository: createInMemoryCampaignRepository() });

    await seedNorthlineDemo(catalog, marketingCatalog, cms, serviceAreas, inventory, promotions, bundles, recommendations, advertising);

    // Subcategories: TV & Home Theater and Smart Home & Automation each
    // real split into 2 real subcategories, each with real products, and
    // the demo's "Shop by" rendering (app/demo/[demoSlug]/category/[slug]/
    // page.tsx) depends on listChildCategories(parentId) returning them.
    const tvHomeTheater = await marketingCatalog.getCategoryBySlug("tv-home-theater");
    expect(tvHomeTheater).not.toBeNull();
    const tvHomeTheaterChildren = await marketingCatalog.listChildCategories(tvHomeTheater!.id);
    expect(tvHomeTheaterChildren.map((c) => c.slug).sort()).toEqual(["home-theater-audio", "tv-mounting"]);

    const smartHome = await marketingCatalog.getCategoryBySlug("smart-home-automation");
    expect(smartHome).not.toBeNull();
    const smartHomeChildren = await marketingCatalog.listChildCategories(smartHome!.id);
    expect(smartHomeChildren.map((c) => c.slug).sort()).toEqual(["smart-lighting-access", "whole-home-automation"]);

    // Categories with no subcategories (this pass's design: not every
    // category needs one) keep zero children.
    const securityCameras = await marketingCatalog.getCategoryBySlug("security-cameras");
    expect(await marketingCatalog.listChildCategories(securityCameras!.id)).toHaveLength(0);

    // Promotion: a real, redeemable, unconditional 15%-off cart code.
    const allPromotions = await promotions.listPromotions();
    expect(allPromotions).toHaveLength(1);
    expect(allPromotions[0]).toMatchObject({ code: "NORTHLINE15", kind: "percentage", scope: "cart", value: 15, status: "active" });

    // Bundle: a real 3-tier cumulative bundle attached to TV Wall Mounting,
    // reusing TV Wall Mounting / TV Cable Concealment / Soundbar & Wireless
    // Subwoofer Setup's real, already-seeded SKUs -- never a second,
    // duplicate SKU set.
    const mountProduct = (await catalog.listProducts({ status: "active" })).find((p) => p.slug === "tv-wall-mounting")!;
    const concealmentProduct = (await catalog.listProducts({ status: "active" })).find((p) => p.slug === "tv-cable-concealment")!;
    const soundbarProduct = (await catalog.listProducts({ status: "active" })).find((p) => p.slug === "soundbar-subwoofer-installation")!;
    const mountSku = (await catalog.listSkusByProduct(mountProduct.id))[0]!;
    const concealmentSku = (await catalog.listSkusByProduct(concealmentProduct.id))[0]!;
    const soundbarSku = (await catalog.listSkusByProduct(soundbarProduct.id))[0]!;

    const allBundles = await bundles.listBundles();
    expect(allBundles).toHaveLength(1);
    const bundle = allBundles[0]!;
    expect(bundle.productId).toBe(mountProduct.id);
    expect(bundle.tiers).toHaveLength(3);
    expect(bundle.tiers[0]!.skuIds).toEqual([mountSku.id]);
    expect(bundle.tiers[1]!.skuIds).toEqual([mountSku.id, concealmentSku.id]);
    expect(bundle.tiers[2]!.skuIds).toEqual([mountSku.id, concealmentSku.id, soundbarSku.id]);

    // Recommendations: 2 real curated cross-sell rules between real,
    // already-seeded services.
    const meshProduct = (await catalog.listProducts({ status: "active" })).find((p) => p.slug === "whole-home-wifi-mesh-install")!;
    const hubProduct = (await catalog.listProducts({ status: "active" })).find((p) => p.slug === "smart-hub-automation-setup")!;

    const mountRules = await recommendations.getRecommendationsForProduct(mountProduct.id);
    expect(mountRules).toHaveLength(1);
    expect(mountRules[0]!.targetProductIds).toEqual([concealmentProduct.id]);

    const meshRules = await recommendations.getRecommendationsForProduct(meshProduct.id);
    expect(meshRules).toHaveLength(1);
    expect(meshRules[0]!.targetProductIds).toEqual([hubProduct.id]);

    // Advertising: one real campaign whose creative copy references the
    // exact same real, redeemable NORTHLINE15 code seeded above -- never an
    // advertised discount without a backing code.
    const allCampaigns = await advertising.listCampaigns();
    expect(allCampaigns).toHaveLength(1);
    expect(allCampaigns[0]!.creatives.length).toBeGreaterThanOrEqual(1);
    for (const creative of allCampaigns[0]!.creatives) {
      expect(creative.body).toContain("NORTHLINE15");
    }
  });

  it("DEMO_BRAND unset (default) still seeds the print-shop catalog -- zero regression", async () => {
    const { catalog, marketingCatalog, cms, inventory, serviceAreas } = buildTestCatalogServices();
    await seedCatalog(catalog, marketingCatalog, cms, inventory, serviceAreas);

    const products = await catalog.listProducts();
    // demo-store-catalog-depth grew this catalog from 8 to 26 real products
    // (14 new single-SKU + 4 new tiered products across the original 4
    // categories plus a new 5th "Stickers & Patches" category) -- see
    // lib/seed.ts's DEMO_PRODUCTS/DEMO_VARIANT_PRODUCTS doc comments.
    // product-configurator (pc-02) added a 27th: "embroidered-performance-polo",
    // a real 2-axis (color AND size) variant product -- see
    // lib/seed.ts's DEMO_MULTI_AXIS_VARIANT_PRODUCTS doc comment.
    expect(products.map((p) => p.slug).sort()).toEqual(
      [
        // Original 8 (print-shop-02) -- unchanged.
        "cork-back-print-coaster-set",
        "custom-printed-ceramic-mug",
        "custom-printed-travel-tumbler",
        "embroidered-canvas-tote",
        "embroidered-cotton-tee",
        "embroidered-dad-cap",
        "embroidered-fleece-hoodie",
        "monogram-stoneware-coaster-set",
        // demo-store-catalog-depth additions -- single-SKU.
        "birch-wood-slice-coaster-set",
        "custom-etched-pint-glass-set",
        "custom-printed-can-cooler-set",
        "custom-printed-enamel-camp-mug",
        "custom-vinyl-sticker-sheet",
        "die-cut-vinyl-sticker-pack",
        "embroidered-canvas-apron",
        "embroidered-iron-on-patch-set",
        "embroidered-luggage-tag",
        "embroidered-zip-pouch",
        "kids-embroidered-tee",
        "leather-coaster-set",
        "marbled-resin-coaster-set",
        "woven-name-patch-set",
        // demo-store-catalog-depth additions -- real multi-SKU tiered
        // products (DEMO_VARIANT_PRODUCTS).
        "custom-printed-insulated-water-bottle",
        "embroidered-baby-onesie",
        "embroidered-quarter-zip-pullover",
        "screen-printed-crewneck-sweatshirt",
        // product-configurator (pc-02) addition -- real 2-axis variant
        // product (DEMO_MULTI_AXIS_VARIANT_PRODUCTS).
        "embroidered-performance-polo",
      ].sort(),
    );
  });
});

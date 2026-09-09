import { randomUUID } from "node:crypto";
import type { AdvertisingService } from "@mercatus-liber/advertising";
import type { BundlesService } from "@mercatus-liber/bundles";
import type { CatalogService } from "@mercatus-liber/catalog";
import type { CmsService } from "@mercatus-liber/cms";
import type { InventoryAdapter } from "@mercatus-liber/inventory";
import type { MarketingCatalogService } from "@mercatus-liber/marketing-catalog";
import type { RecommendationsService } from "@mercatus-liber/recommendations";
import type { ServiceAreaService } from "@mercatus-liber/service-areas";

interface DemoProduct {
  slug: string;
  title: string;
  description: string;
  color: string;
  size: string;
  priceCents: number;
  categorySlugs: string[];
  stockUnits: number;
  /**
   * Whether this product's PDP shows a real personalization text input
   * ("Personalize this item (e.g. embroidery text, thread color)") that
   * flows into the cart line's optional customizationNote field (see
   * @mercatus-liber/cart's CartItem doc comment and design-discussion.md
   * §1b). The single source of truth for this flag -- isCustomizableProduct
   * below reads it straight off this array, so seed data and PDP behavior
   * can never drift out of sync.
   */
  customizable: boolean;
}

/**
 * print-shop-02: a real embroidery/custom-print catalog (design-
 * discussion.md §0/§1b) across 4 real categories -- Embroidery, Custom
 * Coasters, Apparel, Drinkware -- replacing the old dragon-themed
 * desk-accessory catalog wholesale (see print-shop-01's commit for the pure
 * slug/identifier rename that preceded this). "Embroidered Fleece Hoodie" is
 * deliberately assigned to BOTH "embroidery" and "apparel" (a real
 * embroidered garment genuinely belongs in both), proving many-to-many
 * category assignment the same way the old organizer/mat pair proved it via
 * "desk-accessories". Real names/descriptions/prices in cents, zero lorem
 * ipsum, per this story's acceptance criteria.
 */
const DEMO_PRODUCTS: DemoProduct[] = [
  {
    slug: "embroidered-canvas-tote",
    title: "Embroidered Canvas Tote Bag",
    description:
      "A heavyweight 12oz natural canvas tote with reinforced stitched handles, embroidered to order with your text, initials, or a small custom design.",
    color: "natural-canvas",
    size: "one-size",
    priceCents: 2800,
    categorySlugs: ["embroidery"],
    stockUnits: 12,
    customizable: true,
  },
  {
    slug: "embroidered-dad-cap",
    title: "Embroidered Dad Cap",
    description:
      "An unstructured low-profile cotton twill cap with an adjustable brass buckle strap, embroidered front-and-center with your own text or monogram.",
    color: "khaki",
    size: "one-size",
    priceCents: 2400,
    categorySlugs: ["embroidery"],
    stockUnits: 5,
    customizable: true,
  },
  {
    slug: "monogram-stoneware-coaster-set",
    title: "Monogram Stoneware Coaster Set (Set of 4)",
    description:
      "Four absorbent stoneware coasters with a cork backing, laser-etched with a monogram or short custom text of your choosing. Packaged in a kraft gift box.",
    color: "slate-gray",
    size: "4-pack",
    priceCents: 3200,
    categorySlugs: ["custom-coasters"],
    stockUnits: 35,
    customizable: true,
  },
  {
    slug: "cork-back-print-coaster-set",
    title: "Cork-Backed Print Coaster Set (Set of 6)",
    description:
      "Six round hardboard coasters with a natural cork backing and a full-color printed top -- our standard in-house pattern, ready to ship as-is.",
    color: "natural-cork",
    size: "6-pack",
    priceCents: 2600,
    categorySlugs: ["custom-coasters"],
    stockUnits: 50,
    customizable: false,
  },
  {
    slug: "embroidered-fleece-hoodie",
    title: "Embroidered Fleece Hoodie",
    description:
      "A midweight 8.5oz cotton-poly fleece pullover hoodie with a kangaroo pocket, embroidered on the left chest with your text or a small custom design.",
    color: "heather-gray",
    size: "medium",
    priceCents: 5400,
    // Shared category (an embroidered garment genuinely belongs in both) --
    // proves many-to-many category assignment.
    categorySlugs: ["embroidery", "apparel"],
    stockUnits: 25,
    customizable: true,
  },
  {
    slug: "embroidered-cotton-tee",
    title: "Embroidered Cotton T-Shirt",
    description:
      "A 100% ringspun cotton crewneck tee, embroidered (not printed) on the left chest with your own text, initials, or small design.",
    color: "navy",
    size: "medium",
    priceCents: 2200,
    categorySlugs: ["apparel"],
    stockUnits: 45,
    customizable: true,
  },
  {
    slug: "custom-printed-ceramic-mug",
    title: "Custom-Printed Ceramic Mug",
    description:
      "An 11oz glossy white ceramic mug, dishwasher- and microwave-safe, full-color printed edge-to-edge with your own text, photo, or design.",
    color: "white",
    size: "11oz",
    priceCents: 1800,
    categorySlugs: ["drinkware"],
    stockUnits: 55,
    customizable: true,
  },
  {
    slug: "custom-printed-travel-tumbler",
    title: "Custom-Printed Travel Tumbler",
    description:
      "A 20oz double-wall insulated stainless steel tumbler with a spill-resistant lid -- our standard in-house wrap design, ready to ship as-is.",
    color: "matte-black",
    size: "20oz",
    priceCents: 2600,
    categorySlugs: ["drinkware"],
    stockUnits: 40,
    customizable: false,
  },
];

/**
 * Reads the "is this product customizable" flag straight off DEMO_PRODUCTS
 * above (the single source of truth for the seed data's customizable tag --
 * see DemoProduct's doc comment) so the PDP (app/demo/[demoSlug]/products/
 * [slug]/page.tsx) can decide whether to show the personalization input
 * without re-declaring the flag anywhere else. Returns false for any slug
 * not in this print-shop-specific array (e.g. a northline product slug) --
 * correct, since northline isn't a customization demo.
 */
export function isCustomizableProduct(slug: string): boolean {
  return DEMO_PRODUCTS.some((product) => product.slug === slug && product.customizable);
}

interface ServiceDemoSku {
  slug: string;
  title: string;
  description: string;
  priceCents: number;
  stockUnits: number;
}

/**
 * Three single-variant, service-style demo products backing the 3-tier
 * bundle acceptance demo (bundle-04). Shape inspiration: the ATT recreation's
 * confirmed PDP direction, a 3-tier package selector ("Product Only" / "+ Pro
 * Setup" / "Complete Overhaul") -- see design-discussion.md §0. That repo is
 * referenced only as shape inspiration; none of its content is read or
 * copied here. `install` is the bundle's base product; `proSetup` and
 * `overhaul` are add-on SKUs only ever sold as part of a tier, never listed
 * standalone in DEMO_PRODUCTS. Rebranded to print-shop's own embroidery
 * business (print-shop-02) so no "Dragon"-branded content survives under
 * "The Print Shop" name -- this bundle-04 acceptance demo is otherwise
 * untouched by this story (it's a separate SKU family from DEMO_PRODUCTS,
 * never listed in the real catalog/nav).
 */
const SERVICE_DEMO_SKUS: { install: ServiceDemoSku; proSetup: ServiceDemoSku; overhaul: ServiceDemoSku } = {
  install: {
    slug: "onsite-embroidery-setup",
    title: "On-Site Embroidery Setup Service",
    description: "A technician visits your space to set up and calibrate your new embroidery equipment, done right the first time.",
    priceCents: 4900,
    stockUnits: 999,
  },
  proSetup: {
    slug: "onsite-embroidery-pro-setup-addon",
    title: "Pro Setup Add-On",
    description: "Adds thread-path calibration, hooping-station setup, and a full pro configuration pass.",
    priceCents: 2900,
    stockUnits: 999,
  },
  overhaul: {
    slug: "onsite-embroidery-complete-overhaul-addon",
    title: "Complete Overhaul Add-On",
    description: "Adds a full equipment teardown, deep clean, and rebuild to factory-fresh spec.",
    priceCents: 5900,
    stockUnits: 999,
  },
};

/** Creates one active product + one active SKU for a single-variant service demo SKU (identifyingAttributeKeys is a single "package" key with one "standard" value -- these aren't multi-variant products, just a minimal non-empty key set so generateSkus produces exactly one SKU). */
async function createServiceDemoSku(
  catalog: CatalogService,
  inventory: InventoryAdapter,
  demo: ServiceDemoSku,
): Promise<{ productId: string; skuId: string }> {
  const product = await catalog.createProduct({
    slug: demo.slug,
    title: demo.title,
    description: demo.description,
    identifyingAttributeKeys: ["package"],
  });
  await catalog.publishProduct(product.id);
  const skus = await catalog.generateSkus(
    product.id,
    { package: ["standard"] },
    { amount: demo.priceCents, currency: "USD" },
  );
  const sku = skus[0]!;
  await inventory.setStock(sku.id, demo.stockUnits);
  return { productId: product.id, skuId: sku.id };
}

/**
 * Seeds the bundle-04 acceptance demo: the 3 service-style SKUs above, plus
 * one Bundle attached to the base "install" product with exactly 3 tiers,
 * each tier's skuIds the correct CUMULATIVE set -- tier 1 is [install], tier
 * 2 is [install, proSetup], tier 3 is [install, proSetup, overhaul]. Mirrors
 * the ATT recreation's confirmed 3-tier package-selector shape (see
 * design-discussion.md §0) using this repo's own print-shop-branded demo
 * data -- the ATT recreation repo itself is never read or touched.
 */
async function seedServiceBundle(catalog: CatalogService, inventory: InventoryAdapter, bundles: BundlesService): Promise<void> {
  const install = await createServiceDemoSku(catalog, inventory, SERVICE_DEMO_SKUS.install);
  const proSetup = await createServiceDemoSku(catalog, inventory, SERVICE_DEMO_SKUS.proSetup);
  const overhaul = await createServiceDemoSku(catalog, inventory, SERVICE_DEMO_SKUS.overhaul);

  await bundles.createBundle({
    productId: install.productId,
    title: "Embroidery Setup Service Packages",
    tiers: [
      { id: randomUUID(), label: "Product Only", skuIds: [install.skuId] },
      { id: randomUUID(), label: "+ Pro Setup", skuIds: [install.skuId, proSetup.skuId] },
      { id: randomUUID(), label: "Complete Overhaul", skuIds: [install.skuId, proSetup.skuId, overhaul.skuId] },
    ],
  });
}

/**
 * Seeds print-shop's 4 real categories, all top-level (parentId: null) --
 * same "every real category is top-level" shape northline-depth-02 already
 * proved for Northline (see app/demo/[demoSlug]/layout.tsx's buildNavLinks
 * doc comment), so every one of these 4 automatically surfaces in the demo
 * nav via that already-built, demo-aware navLinks mechanism -- zero new nav
 * code needed (print-shop-02's Part 4).
 */
async function seedCategories(marketingCatalog: MarketingCatalogService): Promise<Map<string, string>> {
  const embroidery = await marketingCatalog.createCategory({
    slug: "embroidery",
    title: "Embroidery",
    description: "Totes, caps, and more, embroidered to order with your own text or a small custom design.",
    parentId: null,
  });
  const customCoasters = await marketingCatalog.createCategory({
    slug: "custom-coasters",
    title: "Custom Coasters",
    description: "Stoneware and cork-backed coaster sets, from a monogrammed custom order to our standard in-house prints.",
    parentId: null,
  });
  const apparel = await marketingCatalog.createCategory({
    slug: "apparel",
    title: "Apparel",
    description: "Hoodies and tees, embroidered on the chest with your own text or design.",
    parentId: null,
  });
  const drinkware = await marketingCatalog.createCategory({
    slug: "drinkware",
    title: "Drinkware",
    description: "Mugs and tumblers, custom-printed with your own text, photo, or design.",
    parentId: null,
  });

  return new Map([
    [embroidery.slug, embroidery.id],
    [customCoasters.slug, customCoasters.id],
    [apparel.slug, apparel.id],
    [drinkware.slug, drinkware.id],
  ]);
}

/** Seeds a CMS-authored home page (hero banner + category spot) and one live marketing/campaign page with a curated mini-catalog. */
async function seedCmsPages(cms: CmsService, productIdBySlug: Map<string, string>): Promise<void> {
  const home = await cms.createPage({
    pageType: "home",
    slug: "home",
    title: "Home",
    sections: [
      {
        componentType: "hero-banner",
        config: {
          headline: "The Print Shop",
          subheadline: "Embroidery, custom coasters, apparel, and drinkware -- personalized to order. New drops every season.",
        },
      },
      {
        componentType: "category-spot",
        config: { categorySlugs: ["embroidery", "custom-coasters"] },
      },
      {
        // Renders via components/cms-sections.tsx's AdSlot, resolved against
        // pageSlug="home" (see app/page.tsx) -- see seedAdvertising below
        // for the untargeted campaign this slot picks up.
        componentType: "ad-slot",
        config: {},
      },
    ],
  });
  await cms.publishPage(home.id);

  const toteId = productIdBySlug.get("embroidered-canvas-tote");
  const { page: campaign } = await cms.createMarketingPage({
    slug: "fall-sale",
    title: "Fall Sale",
    sections: toteId ? [{ componentType: "product-grid", config: { productIds: [toteId] } }] : [],
    campaignName: "Fall Sale 2026",
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    productIds: toteId ? [toteId] : [],
  });
  await cms.publishPage(campaign.id);
}

/**
 * Seeds a handful of demo service areas (generic local pickup/delivery
 * regions for this print-shop demo shop -- see epic 15a/15b for the real
 * ATT-style business seed data). The dad cap is deliberately assigned to
 * only 2 of the 3 areas, proving a product can be available in a subset of
 * areas, not all-or-nothing. Also publishes one CMS "location" page,
 * proving the ServiceArea-data / CMS-page-layout split end to end. Returns
 * Portland's real ServiceArea id so callers (see seedAdvertising) can seed
 * a campaign explicitly targeted at it, proving targeting discrimination
 * against real seed data rather than a synthetic id.
 */
async function seedServiceAreas(
  serviceAreas: ServiceAreaService,
  cms: CmsService,
  productIdBySlug: Map<string, string>,
): Promise<string> {
  const portland = await serviceAreas.createServiceArea({
    slug: "portland-or",
    name: "Portland, OR",
    region: "Pacific Northwest",
    description: "Local pickup and delivery for Portland-area customers.",
    phone: "(555) 555-0110",
  });
  const austin = await serviceAreas.createServiceArea({
    slug: "austin-tx",
    name: "Austin, TX",
    region: "Texas",
    description: "Local pickup and delivery for the Austin area.",
    phone: "(555) 555-0120",
  });
  const chicago = await serviceAreas.createServiceArea({
    slug: "chicago-il",
    name: "Chicago, IL",
    region: "Midwest",
    description: "Local pickup for Chicago-area customers.",
    phone: null,
  });

  const toteId = productIdBySlug.get("embroidered-canvas-tote");
  const capId = productIdBySlug.get("embroidered-dad-cap");

  for (const area of [portland, austin, chicago]) {
    if (toteId) await serviceAreas.assignProductToServiceArea(toteId, area.id);
  }
  for (const area of [portland, austin]) {
    if (capId) await serviceAreas.assignProductToServiceArea(capId, area.id);
  }

  const locationPage = await cms.createPage({
    pageType: "location",
    slug: portland.slug,
    title: portland.name,
    sections: [
      { componentType: "service-area-info", config: { hours: "Mon-Fri 9am-5pm" } },
      {
        // Renders via components/cms-sections.tsx's AdSlot, resolved against
        // pageSlug="portland-or" AND serviceAreaId=portland.id (see
        // app/locations/[slug]/page.tsx) -- see seedAdvertising below for
        // the service-area-targeted campaign this slot picks up.
        componentType: "ad-slot",
        config: {},
      },
    ],
  });
  await cms.publishPage(locationPage.id);

  return portland.id;
}

/**
 * Seeds the rec-04 acceptance demo: one curated, active RecommendationRule
 * from the Embroidered Canvas Tote Bag to the Embroidered Dad Cap, placement
 * "both" (so it satisfies both the PDP and cart resolution paths -- see
 * resolvePdpRecommendations/resolveCartRecommendations in
 * components/recommendation-shelf.tsx), labeled "Customers also bought". The
 * two products already share the "embroidery" category (see DEMO_PRODUCTS
 * above), so this also reads naturally as a real "customers also bought"
 * pairing, and the dad cap itself is left with no curated rule of its own --
 * its PDP demonstrates the same-category fallback shelf instead (it falls
 * back to the tote bag via that shared category).
 */
async function seedRecommendations(
  recommendations: RecommendationsService,
  productIdBySlug: Map<string, string>,
): Promise<void> {
  const toteId = productIdBySlug.get("embroidered-canvas-tote");
  const capId = productIdBySlug.get("embroidered-dad-cap");
  if (!toteId || !capId) return;

  await recommendations.createRule({
    sourceProductId: toteId,
    label: "Customers also bought",
    placement: "both",
    targetProductIds: [capId],
  });
}

/**
 * Seeds the ad-04 acceptance demo: one untargeted, active Campaign with 2
 * creatives (proving weighted-random rotation is at least wired, even
 * though any single render only shows one -- see
 * AdvertisingService.getActiveCreativeForSlot), plus, when a service area
 * is available to target, a SECOND campaign explicitly targeted to that
 * area's real id with distinct creative content -- proving targeting
 * actually discriminates rather than "any campaign renders everywhere".
 * See design-discussion.md §3 and components/cms-sections.tsx's AdSlot.
 */
async function seedAdvertising(advertising: AdvertisingService, targetedServiceAreaId?: string): Promise<void> {
  await advertising.createCampaign({
    name: "Print Shop Sale",
    startsAt: null,
    endsAt: null,
    targeting: { serviceAreaId: null, pageSlug: null },
    creatives: [
      {
        id: randomUUID(),
        headline: "The Print Shop Sale -- 20% Off Everything",
        body: "Embroidery, custom coasters, apparel, and drinkware -- all personalized to order, all on sale this week only.",
        imageUrl: null,
        linkHref: "/demo/print-shop/category/embroidery",
        weight: 1,
      },
      {
        id: randomUUID(),
        headline: "New: Embroidered Dad Cap Restock",
        body: "Our best-selling embroidered dad cap is back in stock. Grab yours before it's gone again.",
        imageUrl: null,
        linkHref: "/demo/print-shop/products/embroidered-dad-cap",
        weight: 1,
      },
    ],
  });

  if (!targetedServiceAreaId) return;

  await advertising.createCampaign({
    name: "Portland Print Shop Pop-Up",
    startsAt: null,
    endsAt: null,
    targeting: { serviceAreaId: targetedServiceAreaId, pageSlug: null },
    creatives: [
      {
        id: randomUUID(),
        headline: "Portland Print Shop Pop-Up This Saturday",
        body: "Meet the print shop team in person at our Portland pop-up -- local pickup discounts all day.",
        imageUrl: null,
        linkHref: "/demo/print-shop/locations/portland-or",
        weight: 1,
      },
    ],
  });
}

/** Seeds a handful of demo products/SKUs (published/active) with real stock, category assignments, and CMS pages. `serviceAreas` is optional -- most test files don't need location-page coverage. `bundles` is optional too -- most test files don't need the bundle-04 acceptance demo (3 service SKUs + one 3-tier Bundle); see seedServiceBundle. `recommendations` is optional too -- most test files don't need the rec-04 acceptance demo (one curated RecommendationRule); see seedRecommendations. `advertising` is optional too -- most test files don't need the ad-04 acceptance demo (1-2 Campaigns); see seedAdvertising. */
export async function seedCatalog(
  catalog: CatalogService,
  marketingCatalog: MarketingCatalogService,
  cms: CmsService,
  inventory: InventoryAdapter,
  serviceAreas?: ServiceAreaService,
  bundles?: BundlesService,
  recommendations?: RecommendationsService,
  advertising?: AdvertisingService,
): Promise<void> {
  const categoryIdBySlug = await seedCategories(marketingCatalog);
  const productIdBySlug = new Map<string, string>();

  for (const demo of DEMO_PRODUCTS) {
    const product = await catalog.createProduct({
      slug: demo.slug,
      title: demo.title,
      description: demo.description,
      identifyingAttributeKeys: ["color", "size"],
    });
    productIdBySlug.set(demo.slug, product.id);
    await catalog.publishProduct(product.id);
    const skus = await catalog.generateSkus(
      product.id,
      { color: [demo.color], size: [demo.size] },
      { amount: demo.priceCents, currency: "USD" },
    );
    // catalog.sku.created already initialized each SKU at onHand=0 via the
    // inventory subscriber -- this sets the real seeded stock level.
    for (const sku of skus) {
      await inventory.setStock(sku.id, demo.stockUnits);
    }

    for (const categorySlug of demo.categorySlugs) {
      const categoryId = categoryIdBySlug.get(categorySlug);
      if (categoryId) await marketingCatalog.assignProductToCategory(product.id, categoryId);
    }
  }

  await seedCmsPages(cms, productIdBySlug);
  let portlandServiceAreaId: string | undefined;
  if (serviceAreas) portlandServiceAreaId = await seedServiceAreas(serviceAreas, cms, productIdBySlug);
  if (bundles) await seedServiceBundle(catalog, inventory, bundles);
  if (recommendations) await seedRecommendations(recommendations, productIdBySlug);
  if (advertising) await seedAdvertising(advertising, portlandServiceAreaId);
}

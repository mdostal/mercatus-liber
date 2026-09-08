import { randomUUID } from "node:crypto";
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
}

const DEMO_PRODUCTS: DemoProduct[] = [
  {
    slug: "dragon-cable-organizer",
    title: "Dragon Cable Organizer",
    description: "A dragon-branded, multi-color 3D-printed cable organizer.",
    color: "red",
    size: "large",
    priceCents: 1999,
    // Shared category ("desk-accessories") proves many-to-many assignment.
    categorySlugs: ["desk-accessories", "3d-printed"],
    stockUnits: 12,
  },
  {
    slug: "dragon-desk-mat",
    title: "Dragon Desk Mat",
    description: "A dragon-branded desk mat.",
    color: "black",
    size: "medium",
    priceCents: 2999,
    categorySlugs: ["desk-accessories"],
    stockUnits: 5,
  },
];

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
 * standalone in DEMO_PRODUCTS.
 */
const SERVICE_DEMO_SKUS: { install: ServiceDemoSku; proSetup: ServiceDemoSku; overhaul: ServiceDemoSku } = {
  install: {
    slug: "dragon-install-service",
    title: "Dragon Install Service",
    description: "Professional installation of your dragon-branded desk setup, done right the first time.",
    priceCents: 4900,
    stockUnits: 999,
  },
  proSetup: {
    slug: "dragon-pro-setup-addon",
    title: "Dragon Pro Setup Add-On",
    description: "Adds cable routing, mount calibration, and a full pro configuration pass.",
    priceCents: 2900,
    stockUnits: 999,
  },
  overhaul: {
    slug: "dragon-complete-overhaul-addon",
    title: "Dragon Complete Overhaul Add-On",
    description: "Adds a full desk teardown, deep clean, and rebuild to factory-fresh spec.",
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
 * design-discussion.md §0) using this repo's own dragon-branded demo data --
 * the ATT recreation repo itself is never read or touched.
 */
async function seedServiceBundle(catalog: CatalogService, inventory: InventoryAdapter, bundles: BundlesService): Promise<void> {
  const install = await createServiceDemoSku(catalog, inventory, SERVICE_DEMO_SKUS.install);
  const proSetup = await createServiceDemoSku(catalog, inventory, SERVICE_DEMO_SKUS.proSetup);
  const overhaul = await createServiceDemoSku(catalog, inventory, SERVICE_DEMO_SKUS.overhaul);

  await bundles.createBundle({
    productId: install.productId,
    title: "Dragon Install Service Packages",
    tiers: [
      { id: randomUUID(), label: "Product Only", skuIds: [install.skuId] },
      { id: randomUUID(), label: "+ Pro Setup", skuIds: [install.skuId, proSetup.skuId] },
      { id: randomUUID(), label: "Complete Overhaul", skuIds: [install.skuId, proSetup.skuId, overhaul.skuId] },
    ],
  });
}

/** Seeds demo categories (top-level "Merch" with one child "Desk Accessories", plus a standalone "3D Printed"). */
async function seedCategories(marketingCatalog: MarketingCatalogService): Promise<Map<string, string>> {
  const merch = await marketingCatalog.createCategory({
    slug: "merch",
    title: "Merch",
    description: "Dragon-branded merch.",
    parentId: null,
  });
  const deskAccessories = await marketingCatalog.createCategory({
    slug: "desk-accessories",
    title: "Desk Accessories",
    description: "Things for your desk.",
    parentId: merch.id,
  });
  const printed3d = await marketingCatalog.createCategory({
    slug: "3d-printed",
    title: "3D Printed",
    description: "Anything that came off a printer.",
    parentId: null,
  });

  return new Map([
    [merch.slug, merch.id],
    [deskAccessories.slug, deskAccessories.id],
    [printed3d.slug, printed3d.id],
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
          headline: "Mercatus Liber",
          subheadline: "The 100% free, open-source, headless, AI-agent-accessible e-commerce kit.",
        },
      },
      {
        componentType: "category-spot",
        config: { categorySlugs: ["merch", "3d-printed"] },
      },
    ],
  });
  await cms.publishPage(home.id);

  const organizerId = productIdBySlug.get("dragon-cable-organizer");
  const { page: campaign } = await cms.createMarketingPage({
    slug: "fall-sale",
    title: "Fall Sale",
    sections: organizerId
      ? [{ componentType: "product-grid", config: { productIds: [organizerId] } }]
      : [],
    campaignName: "Fall Sale 2026",
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    productIds: organizerId ? [organizerId] : [],
  });
  await cms.publishPage(campaign.id);
}

/**
 * Seeds a handful of demo service areas (generic local pickup/delivery
 * regions for this dragon-merch demo shop -- see epic 15a/15b for the real
 * ATT-style business seed data). The desk mat is deliberately assigned to
 * only 2 of the 3 areas, proving a product can be available in a subset of
 * areas, not all-or-nothing. Also publishes one CMS "location" page,
 * proving the ServiceArea-data / CMS-page-layout split end to end.
 */
async function seedServiceAreas(
  serviceAreas: ServiceAreaService,
  cms: CmsService,
  productIdBySlug: Map<string, string>,
): Promise<void> {
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

  const organizerId = productIdBySlug.get("dragon-cable-organizer");
  const matId = productIdBySlug.get("dragon-desk-mat");

  for (const area of [portland, austin, chicago]) {
    if (organizerId) await serviceAreas.assignProductToServiceArea(organizerId, area.id);
  }
  for (const area of [portland, austin]) {
    if (matId) await serviceAreas.assignProductToServiceArea(matId, area.id);
  }

  const locationPage = await cms.createPage({
    pageType: "location",
    slug: portland.slug,
    title: portland.name,
    sections: [{ componentType: "service-area-info", config: { hours: "Mon-Fri 9am-5pm" } }],
  });
  await cms.publishPage(locationPage.id);
}

/**
 * Seeds the rec-04 acceptance demo: one curated, active RecommendationRule
 * from the Dragon Cable Organizer to the Dragon Desk Mat, placement "both"
 * (so it satisfies both the PDP and cart resolution paths -- see
 * resolvePdpRecommendations/resolveCartRecommendations in
 * components/recommendation-shelf.tsx), labeled "Customers also bought". The
 * two products already share the "desk-accessories" category (see
 * DEMO_PRODUCTS above), so this also reads naturally as a real
 * "customers also bought" pairing, and the desk mat itself is left with no
 * curated rule of its own -- its PDP demonstrates the same-category fallback
 * shelf instead (it falls back to the organizer via that shared category).
 */
async function seedRecommendations(
  recommendations: RecommendationsService,
  productIdBySlug: Map<string, string>,
): Promise<void> {
  const organizerId = productIdBySlug.get("dragon-cable-organizer");
  const matId = productIdBySlug.get("dragon-desk-mat");
  if (!organizerId || !matId) return;

  await recommendations.createRule({
    sourceProductId: organizerId,
    label: "Customers also bought",
    placement: "both",
    targetProductIds: [matId],
  });
}

/** Seeds a handful of demo products/SKUs (published/active) with real stock, category assignments, and CMS pages. `serviceAreas` is optional -- most test files don't need location-page coverage. `bundles` is optional too -- most test files don't need the bundle-04 acceptance demo (3 service SKUs + one 3-tier Bundle); see seedServiceBundle. `recommendations` is optional too -- most test files don't need the rec-04 acceptance demo (one curated RecommendationRule); see seedRecommendations. */
export async function seedCatalog(
  catalog: CatalogService,
  marketingCatalog: MarketingCatalogService,
  cms: CmsService,
  inventory: InventoryAdapter,
  serviceAreas?: ServiceAreaService,
  bundles?: BundlesService,
  recommendations?: RecommendationsService,
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
  if (serviceAreas) await seedServiceAreas(serviceAreas, cms, productIdBySlug);
  if (bundles) await seedServiceBundle(catalog, inventory, bundles);
  if (recommendations) await seedRecommendations(recommendations, productIdBySlug);
}

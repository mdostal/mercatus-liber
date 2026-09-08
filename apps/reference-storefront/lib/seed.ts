import type { CatalogService } from "@mercatus-liber/catalog";
import type { CmsService } from "@mercatus-liber/cms";
import type { InventoryAdapter } from "@mercatus-liber/inventory";
import type { MarketingCatalogService } from "@mercatus-liber/marketing-catalog";
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

/** Seeds a handful of demo products/SKUs (published/active) with real stock, category assignments, and CMS pages. `serviceAreas` is optional -- most test files don't need location-page coverage. */
export async function seedCatalog(
  catalog: CatalogService,
  marketingCatalog: MarketingCatalogService,
  cms: CmsService,
  inventory: InventoryAdapter,
  serviceAreas?: ServiceAreaService,
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
}

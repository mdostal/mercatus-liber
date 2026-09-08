import type { CatalogService } from "@mercatus-liber/catalog";
import type { CmsService } from "@mercatus-liber/cms";
import type { MarketingCatalogService } from "@mercatus-liber/marketing-catalog";
import type { ServiceAreaService } from "@mercatus-liber/service-areas";

/**
 * Epic 15b's public demo: "Northline Home Tech", a fictional smart-home
 * installer -- see .pHive/epics/service-demo-theme-public/docs/brand-and-scope.md
 * for the invented identity. Deliberately a different name, city list, and
 * visual identity from All That Technology (the real client epic 15a's
 * strictly-internal seed uses instead).
 *
 * These are installation SERVICES, not stocked physical goods -- inventory
 * (subsystem 11) is intentionally not seeded here; the reserve/commit/
 * release model exists for stocked SKUs, and "never throws, oversell
 * allowed by default" means checkout still works fine for a SKU with no
 * explicit stock record (see docs/subsystems/11-inventory.md).
 */
interface DemoService {
  slug: string;
  title: string;
  description: string;
  priceCents: number;
  /** Indices into DEMO_SERVICE_AREAS this service is available in -- proves the subset pattern at real scale, not every service everywhere. */
  areaIndices: number[];
}

const DEMO_SERVICES: DemoService[] = [
  {
    slug: "tv-wall-mounting",
    title: "TV Wall Mounting",
    description: "Flat-panel TV mounted flush to the wall, cables concealed, any wall type.",
    priceCents: 14900,
    areaIndices: [0, 1, 2, 3, 4, 5, 6, 7], // every area
  },
  {
    slug: "security-camera-install",
    title: "Security Camera Installation",
    description: "Wired or wireless security camera installation and app setup, per camera.",
    priceCents: 29900,
    areaIndices: [0, 1, 2, 3, 4, 5, 6, 7], // every area
  },
  {
    slug: "video-doorbell-install",
    title: "Video Doorbell Installation",
    description: "Smart video doorbell installation, existing wiring or battery-powered.",
    priceCents: 12900,
    areaIndices: [0, 1, 2, 3, 4, 5, 6, 7], // every area
  },
  {
    slug: "fiber-internet-install",
    title: "Fiber Internet Installation",
    description: "In-home fiber internet drop, ONT mounting, and router placement.",
    priceCents: 19900,
    areaIndices: [0, 1, 2, 3, 4], // only areas with fiber infrastructure
  },
  {
    slug: "home-theater-setup",
    title: "Home Theater Setup",
    description: "Full home theater install: speakers, receiver, calibration, universal remote.",
    priceCents: 34900,
    areaIndices: [0, 2, 5], // premium service, fewer areas
  },
];

const DEMO_SERVICE_AREAS = [
  { slug: "cedarbrook-oh", name: "Cedarbrook, OH", region: "Midwest", phone: "(555) 555-0201" },
  { slug: "maple-ridge-mn", name: "Maple Ridge, MN", region: "Midwest", phone: "(555) 555-0202" },
  { slug: "silver-creek-co", name: "Silver Creek, CO", region: "Mountain West", phone: "(555) 555-0203" },
  { slug: "brightwater-wa", name: "Brightwater, WA", region: "Pacific Northwest", phone: "(555) 555-0204" },
  { slug: "ashford-ga", name: "Ashford, GA", region: "Southeast", phone: "(555) 555-0205" },
  { slug: "millbrook-nc", name: "Millbrook, NC", region: "Southeast", phone: null },
  { slug: "fox-hollow-in", name: "Fox Hollow, IN", region: "Midwest", phone: null },
  { slug: "harborview-me", name: "Harborview, ME", region: "Northeast", phone: null },
];

export async function seedNorthlineDemo(
  catalog: CatalogService,
  marketingCatalog: MarketingCatalogService,
  cms: CmsService,
  serviceAreas: ServiceAreaService,
): Promise<void> {
  const installServices = await marketingCatalog.createCategory({
    slug: "installation-services",
    title: "Installation Services",
    description: "Professional in-home installation, done right the first time.",
    parentId: null,
  });

  const areas = await Promise.all(
    DEMO_SERVICE_AREAS.map((area) =>
      serviceAreas.createServiceArea({ slug: area.slug, name: area.name, region: area.region, description: `Local installation service for ${area.name}.`, phone: area.phone }),
    ),
  );

  const productIdBySlug = new Map<string, string>();
  for (const service of DEMO_SERVICES) {
    const product = await catalog.createProduct({
      slug: service.slug,
      title: service.title,
      description: service.description,
      identifyingAttributeKeys: ["package"],
    });
    productIdBySlug.set(service.slug, product.id);
    await catalog.publishProduct(product.id);
    await catalog.generateSkus(product.id, { package: ["standard"] }, { amount: service.priceCents, currency: "USD" });
    await marketingCatalog.assignProductToCategory(product.id, installServices.id);

    for (const areaIndex of service.areaIndices) {
      await serviceAreas.assignProductToServiceArea(product.id, areas[areaIndex]!.id);
    }
  }

  // Slug MUST be "home" -- app/page.tsx looks up a fixed "home" slug
  // regardless of which brand's seed is active (each seed runs against its
  // own fresh in-memory DB, so there's no collision between brands).
  const home = await cms.createPage({
    pageType: "home",
    slug: "home",
    title: "Northline Home Tech",
    sections: [
      {
        componentType: "hero-banner",
        config: {
          headline: "Northline Home Tech",
          subheadline: "Professional smart-home installation -- TVs, cameras, doorbells, fiber, and home theater, done right.",
        },
      },
      {
        componentType: "product-grid",
        config: { productIds: [...productIdBySlug.values()] },
      },
    ],
  });
  await cms.publishPage(home.id);

  // One location page (Cedarbrook) proving the ServiceArea-data / CMS-page-
  // layout split, same pattern the generic dragon-shop demo already proves.
  const locationPage = await cms.createPage({
    pageType: "location",
    slug: "cedarbrook-oh",
    title: "Cedarbrook, OH",
    sections: [{ componentType: "service-area-info", config: { hours: "Mon-Sat 8am-7pm" } }],
  });
  await cms.publishPage(locationPage.id);
}

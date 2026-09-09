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
 *
 * Epic demo-store-northline-depth, story northline-depth-01: 4 real
 * categories (not 1 catch-all), real tiered SKU variants for 2 services
 * (not one flat SKU each), and a real, distinct, published CMS location
 * page for every one of the 8 DEMO_SERVICE_AREAS entries (not 1 of 8).
 */

/** One priced SKU variant of a service (the "package" identifying attribute value). Mirrors lib/seed.ts's SERVICE_DEMO_SKUS single-variant convention (identifyingAttributeKeys: ["package"]), just applied once per tier instead of once per product -- each tier is its own catalog.generateSkus call with its own price, so a "flat" service is simply a service with exactly one tier. */
interface ServiceTier {
  package: string;
  label: string;
  priceCents: number;
}

interface DemoService {
  slug: string;
  title: string;
  description: string;
  categorySlug: string;
  /** One or more priced package tiers. A single-tier service (package: "standard") behaves exactly like every service did before this story; a multi-tier service generates one SKU per tier, each at its own price. */
  tiers: ServiceTier[];
  /** Indices into DEMO_SERVICE_AREAS this service is available in -- proves the subset pattern at real scale, not every service everywhere. */
  areaIndices: number[];
}

interface DemoCategory {
  slug: string;
  title: string;
  description: string;
}

const DEMO_CATEGORIES: DemoCategory[] = [
  {
    slug: "tv-home-theater",
    title: "TV & Home Theater",
    description: "Big-screen mounts and full home theater builds, wall mount to whole-room calibration.",
  },
  {
    slug: "security-cameras",
    title: "Security & Cameras",
    description: "Cameras and video doorbells that actually get monitored -- installed and configured right.",
  },
  {
    slug: "networking-fiber",
    title: "Networking & Fiber",
    description: "Wired for speed: fiber drops and clean in-home network setups.",
  },
  {
    slug: "smart-home-automation",
    title: "Smart Home & Automation",
    description: "Thermostats, locks, and the smart-home basics that make a house feel modern.",
  },
];

const DEMO_SERVICES: DemoService[] = [
  {
    slug: "tv-wall-mounting",
    title: "TV Wall Mounting",
    description: "Flat-panel TV mounted flush to the wall, cables concealed, any wall type.",
    categorySlug: "tv-home-theater",
    tiers: [{ package: "standard", label: "Standard", priceCents: 14900 }],
    areaIndices: [0, 1, 2, 3, 4, 5, 6, 7], // every area
  },
  {
    slug: "home-theater-setup",
    title: "Home Theater Setup",
    description: "Full home theater install: speakers, receiver, calibration, universal remote.",
    categorySlug: "tv-home-theater",
    // Second tiered example: essentials covers a standard 5.1 setup, premium
    // adds in-wall wiring, a second calibration pass, and a universal remote
    // programmed for every device in the room.
    tiers: [
      { package: "essentials", label: "Essentials", priceCents: 34900 },
      { package: "premium", label: "Premium", priceCents: 54900 },
    ],
    areaIndices: [0, 2, 5], // premium service, fewer areas
  },
  {
    slug: "security-camera-install",
    title: "Security Camera Installation",
    description: "Wired or wireless security camera installation and app setup, priced by package size.",
    categorySlug: "security-cameras",
    // Tiered by camera count. Installation labor doesn't scale linearly with
    // camera count (shared trip cost, shared network/app setup, some
    // per-camera mounting/run-cable time) so pricing reflects that curve
    // rather than a flat per-camera multiple.
    tiers: [
      { package: "1-camera", label: "1-Camera Package", priceCents: 29900 },
      { package: "4-camera", label: "4-Camera Package", priceCents: 89900 },
      { package: "8-camera", label: "8-Camera Package", priceCents: 159900 },
    ],
    areaIndices: [0, 1, 2, 3, 4, 5, 6, 7], // every area
  },
  {
    slug: "video-doorbell-install",
    title: "Video Doorbell Installation",
    description: "Smart video doorbell installation, existing wiring or battery-powered.",
    categorySlug: "security-cameras",
    tiers: [{ package: "standard", label: "Standard", priceCents: 12900 }],
    areaIndices: [0, 1, 2, 3, 4, 5, 6, 7], // every area
  },
  {
    slug: "fiber-internet-install",
    title: "Fiber Internet Installation",
    description: "In-home fiber internet drop, ONT mounting, and router placement.",
    categorySlug: "networking-fiber",
    tiers: [{ package: "standard", label: "Standard", priceCents: 19900 }],
    areaIndices: [0, 1, 2, 3, 4], // only areas with fiber infrastructure
  },
  {
    slug: "smart-thermostat-install",
    title: "Smart Thermostat Installation",
    description: "Smart thermostat install and app/HVAC pairing, compatible with most systems.",
    categorySlug: "smart-home-automation",
    tiers: [{ package: "standard", label: "Standard", priceCents: 14900 }],
    // Not yet offered in Harborview, ME (index 7) -- Northline's newest,
    // smallest market there is still ramping up past its original 3 core
    // installs (see the Harborview location page blurb).
    areaIndices: [0, 1, 2, 3, 4, 5, 6],
  },
  {
    slug: "smart-lock-install",
    title: "Smart Lock Installation",
    description: "Smart deadbolt or lever install with app pairing and guest-code setup.",
    categorySlug: "smart-home-automation",
    tiers: [{ package: "standard", label: "Standard", priceCents: 12900 }],
    // Not yet offered in Ashford, GA (index 4) or Harborview, ME (index 7).
    areaIndices: [0, 1, 2, 3, 5, 6],
  },
];

const DEMO_SERVICE_AREAS = [
  {
    slug: "cedarbrook-oh",
    name: "Cedarbrook, OH",
    region: "Midwest",
    phone: "(555) 555-0201",
    hours: "Mon-Sat 8am-7pm",
    blurb:
      "Cedarbrook is Northline's founding market in Ohio's Miami Valley, and it's where our crew is based -- expect the fastest scheduling here and our full service lineup.",
  },
  {
    slug: "maple-ridge-mn",
    name: "Maple Ridge, MN",
    region: "Midwest",
    phone: "(555) 555-0202",
    hours: "Mon-Fri 8am-6pm, Sat 9am-3pm",
    blurb: "Northline's Maple Ridge crew covers the Twin Cities exurbs, from lake cabins to new-construction subdivisions.",
  },
  {
    slug: "silver-creek-co",
    name: "Silver Creek, CO",
    region: "Mountain West",
    phone: "(555) 555-0203",
    hours: "Mon-Sat 7am-6pm",
    blurb:
      "Silver Creek sits at altitude in the Rockies foothills, and our installers are just as comfortable running cable through log-frame construction as mountain-modern new builds.",
  },
  {
    slug: "brightwater-wa",
    name: "Brightwater, WA",
    region: "Pacific Northwest",
    phone: "(555) 555-0204",
    hours: "Mon-Fri 8am-7pm, Sat 9am-5pm",
    blurb: "Brightwater's damp Pacific Northwest climate means we pay extra attention to weatherproofing every outdoor camera and doorbell mount.",
  },
  {
    slug: "ashford-ga",
    name: "Ashford, GA",
    region: "Southeast",
    phone: "(555) 555-0205",
    hours: "Mon-Sat 8am-8pm",
    blurb: "Ashford is Northline's busiest Southeast market, serving the metro Atlanta suburbs with same-week scheduling most of the year.",
  },
  {
    slug: "millbrook-nc",
    name: "Millbrook, NC",
    region: "Southeast",
    phone: null,
    hours: "Tue-Sat 9am-6pm",
    blurb:
      "Millbrook's mix of historic homes and new builds near the Research Triangle keeps our crew equally comfortable with plaster walls and modern drywall.",
  },
  {
    slug: "fox-hollow-in",
    name: "Fox Hollow, IN",
    region: "Midwest",
    phone: null,
    hours: "Mon-Fri 8am-6pm",
    blurb: "Fox Hollow is a smaller Midwest market for Northline, with a lean local crew focused on the installs homeowners ask for most.",
  },
  {
    slug: "harborview-me",
    name: "Harborview, ME",
    region: "Northeast",
    phone: null,
    hours: "Mon-Fri 8am-5pm, Sat 9am-1pm",
    blurb:
      "Harborview is Northline's newest and smallest Northeast market -- our coastal Maine crew currently focuses on the core installs homeowners request most, with more services rolling out over time.",
  },
];

export async function seedNorthlineDemo(
  catalog: CatalogService,
  marketingCatalog: MarketingCatalogService,
  cms: CmsService,
  serviceAreas: ServiceAreaService,
): Promise<void> {
  const categoryIdBySlug = new Map<string, string>();
  for (const category of DEMO_CATEGORIES) {
    const created = await marketingCatalog.createCategory({
      slug: category.slug,
      title: category.title,
      description: category.description,
      parentId: null,
    });
    categoryIdBySlug.set(category.slug, created.id);
  }

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

    for (const tier of service.tiers) {
      await catalog.generateSkus(product.id, { package: [tier.package] }, { amount: tier.priceCents, currency: "USD" });
    }

    const categoryId = categoryIdBySlug.get(service.categorySlug);
    if (categoryId) await marketingCatalog.assignProductToCategory(product.id, categoryId);

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

  // One real, published location page per service area (all 8, not 1 of 8).
  // The list of services offered is derived directly from each service's
  // real areaIndices membership -- never hand-typed -- so a page can never
  // drift out of sync with what's actually assigned to that area.
  for (let areaIndex = 0; areaIndex < DEMO_SERVICE_AREAS.length; areaIndex++) {
    const area = DEMO_SERVICE_AREAS[areaIndex]!;
    const servicesOfferedHere = DEMO_SERVICES.filter((service) => service.areaIndices.includes(areaIndex)).map((service) => service.title);

    const locationPage = await cms.createPage({
      pageType: "location",
      slug: area.slug,
      title: area.name,
      sections: [
        {
          componentType: "service-area-info",
          config: {
            hours: area.hours,
            blurb: area.blurb,
            servicesOffered: servicesOfferedHere,
          },
        },
      ],
    });
    await cms.publishPage(locationPage.id);
  }
}

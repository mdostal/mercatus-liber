/**
 * svcarea-02: proves the seeded service areas + product assignments +
 * location CMS page render correctly through the same service wiring
 * lib/services.ts uses, same pattern as marketing-catalog-search.test.ts.
 */
import { describe, expect, it } from "vitest";
import { seedCatalog } from "../lib/seed.js";
import { buildTestCatalogServices } from "./helpers.js";

describe("service areas (reference storefront)", () => {
  it("seeds 3 service areas, with the dad cap assigned to only 2 of them (subset, not all)", async () => {
    const { catalog, marketingCatalog, cms, inventory, serviceAreas } = buildTestCatalogServices();
    await seedCatalog(catalog, marketingCatalog, cms, inventory, serviceAreas);

    const areas = await serviceAreas.listServiceAreas();
    expect(areas.map((a) => a.slug).sort()).toEqual(["austin-tx", "chicago-il", "portland-or"]);

    const tote = await catalog.getProductBySlug("embroidered-canvas-tote");
    const cap = await catalog.getProductBySlug("embroidered-dad-cap");
    const toteAreas = await serviceAreas.listServiceAreasForProduct(tote!.id);
    const capAreas = await serviceAreas.listServiceAreasForProduct(cap!.id);

    expect(toteAreas.map((a) => a.slug).sort()).toEqual(["austin-tx", "chicago-il", "portland-or"]);
    expect(capAreas.map((a) => a.slug).sort()).toEqual(["austin-tx", "portland-or"]);
  });

  it("publishes a CMS 'location' page for the Portland service area", async () => {
    const { catalog, marketingCatalog, cms, inventory, serviceAreas } = buildTestCatalogServices();
    await seedCatalog(catalog, marketingCatalog, cms, inventory, serviceAreas);

    const page = await cms.getPageBySlug("portland-or");
    expect(page?.pageType).toBe("location");
    expect(page?.status).toBe("published");
    // ad-slot added by epic 23 (advertising) -- see lib/seed.ts's seedServiceAreas.
    expect(page?.sections).toEqual([
      { componentType: "service-area-info", config: { hours: "Mon-Fri 9am-5pm" } },
      { componentType: "ad-slot", config: {} },
    ]);
  });

  it("without a serviceAreas argument, seedCatalog does not seed any service areas -- optional, no regression for other test files", async () => {
    const { catalog, marketingCatalog, cms, inventory, serviceAreas } = buildTestCatalogServices();
    await seedCatalog(catalog, marketingCatalog, cms, inventory);

    expect(await serviceAreas.listServiceAreas()).toEqual([]);
  });
});

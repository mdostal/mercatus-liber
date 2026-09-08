import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryServiceAreaProductRepository, createInMemoryServiceAreaRepository } from "../src/in-memory-repository.js";
import { createServiceAreaService, type ServiceAreaService } from "../src/service.js";
import { ServiceAreaNotFoundError } from "../src/types.js";

describe("service area service", () => {
  let serviceAreas: ServiceAreaService;

  beforeEach(() => {
    serviceAreas = createServiceAreaService({
      areas: createInMemoryServiceAreaRepository(),
      assignments: createInMemoryServiceAreaProductRepository(),
    });
  });

  it("creates a service area with all its fields, including a nullable phone", async () => {
    const area = await serviceAreas.createServiceArea({
      slug: "royse-city-tx",
      name: "Royse City, TX",
      region: "Texas",
      description: "Home automation installs serving Royse City and surrounding areas.",
      phone: "(555) 555-0100",
    });
    expect(area).toMatchObject({ slug: "royse-city-tx", name: "Royse City, TX", region: "Texas", phone: "(555) 555-0100" });

    const noPhone = await serviceAreas.createServiceArea({ slug: "no-phone", name: "No Phone", region: "Texas", description: "", phone: null });
    expect(noPhone.phone).toBeNull();
  });

  it("getServiceArea and getServiceAreaBySlug both find the same area", async () => {
    const area = await serviceAreas.createServiceArea({ slug: "royse-city-tx", name: "Royse City, TX", region: "Texas", description: "", phone: null });
    expect((await serviceAreas.getServiceArea(area.id))?.id).toBe(area.id);
    expect((await serviceAreas.getServiceAreaBySlug("royse-city-tx"))?.id).toBe(area.id);
  });

  it("listServiceAreas returns every created area", async () => {
    await serviceAreas.createServiceArea({ slug: "a", name: "A", region: "TX", description: "", phone: null });
    await serviceAreas.createServiceArea({ slug: "b", name: "B", region: "TX", description: "", phone: null });
    expect(await serviceAreas.listServiceAreas()).toHaveLength(2);
  });

  it("assigns a product to multiple service areas independently (many-to-many, not overwrite)", async () => {
    const productId = "prod-1";
    const areaA = await serviceAreas.createServiceArea({ slug: "a", name: "A", region: "TX", description: "", phone: null });
    const areaB = await serviceAreas.createServiceArea({ slug: "b", name: "B", region: "TX", description: "", phone: null });

    await serviceAreas.assignProductToServiceArea(productId, areaA.id);
    await serviceAreas.assignProductToServiceArea(productId, areaB.id);

    const forProduct = await serviceAreas.listServiceAreasForProduct(productId);
    expect(forProduct.map((a) => a.slug).sort()).toEqual(["a", "b"]);
    expect(await serviceAreas.listProductIdsInServiceArea(areaA.id)).toEqual([productId]);
    expect(await serviceAreas.listProductIdsInServiceArea(areaB.id)).toEqual([productId]);
  });

  it("a product can be assigned to a subset of areas -- not all-or-nothing", async () => {
    const productId = "prod-2";
    const areaA = await serviceAreas.createServiceArea({ slug: "a2", name: "A2", region: "TX", description: "", phone: null });
    const areaB = await serviceAreas.createServiceArea({ slug: "b2", name: "B2", region: "TX", description: "", phone: null });
    await serviceAreas.assignProductToServiceArea(productId, areaA.id);

    expect(await serviceAreas.listProductIdsInServiceArea(areaA.id)).toEqual([productId]);
    expect(await serviceAreas.listProductIdsInServiceArea(areaB.id)).toEqual([]);
  });

  it("unassign removes only that specific product-area pairing", async () => {
    const productId = "prod-3";
    const areaA = await serviceAreas.createServiceArea({ slug: "a3", name: "A3", region: "TX", description: "", phone: null });
    const areaB = await serviceAreas.createServiceArea({ slug: "b3", name: "B3", region: "TX", description: "", phone: null });
    await serviceAreas.assignProductToServiceArea(productId, areaA.id);
    await serviceAreas.assignProductToServiceArea(productId, areaB.id);

    await serviceAreas.unassignProductFromServiceArea(productId, areaA.id);

    expect((await serviceAreas.listServiceAreasForProduct(productId)).map((a) => a.slug)).toEqual(["b3"]);
  });

  it("throws ServiceAreaNotFoundError when assigning to a nonexistent service area", async () => {
    await expect(serviceAreas.assignProductToServiceArea("prod-4", "missing")).rejects.toThrow(ServiceAreaNotFoundError);
  });
});

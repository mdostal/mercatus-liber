import { createSqliteAdapter } from "@mercatus-liber/adapter-sqlite";
import { createInMemoryEventBus, InvalidScheduleError, lifecycle } from "@mercatus-liber/core";
import { describe, expect, it } from "vitest";
import { createInMemoryCatalogRepository, createInMemoryProductCatalogRepository } from "../src/index.js";
import { createCatalogService } from "../src/service.js";

const service = () => createCatalogService({ persistence: createSqliteAdapter(":memory:"), events: createInMemoryEventBus(), catalogs: createInMemoryCatalogRepository(), productCatalogs: createInMemoryProductCatalogRepository() });

describe("product and SKU schedules", () => {
  it("stores windows normalised to UTC, lets an update extend or clear them, and refuses a bad window", async () => {
    const catalog = service();
    const product = await catalog.createProduct({ slug: "fleece", title: "Fleece", description: "", identifyingAttributeKeys: ["size"], activeFrom: "2026-11-30T12:00:00-06:00", activeTo: "2026-12-07T12:00:00-06:00" });
    expect(product).toMatchObject({ activeFrom: "2026-11-30T18:00:00.000Z", activeTo: "2026-12-07T18:00:00.000Z" });
    expect((await catalog.getProduct(product.id))!.activeTo).toBe("2026-12-07T18:00:00.000Z");
    // Bring it back: no end.
    const back = await catalog.updateProduct(product.id, { activeTo: null });
    expect(back.activeFrom).toBe("2026-11-30T18:00:00.000Z");
    expect("activeTo" in back).toBe(false);
    await expect(catalog.updateProduct(product.id, { activeTo: "2026-11-01T00:00:00Z" })).rejects.toBeInstanceOf(InvalidScheduleError);

    const sku = await catalog.createSku({ productId: product.id, identifyingAttributes: [{ key: "size", value: "M" }], price: { amount: 3000, currency: "USD" }, activeTo: "2026-12-07T18:00:00Z" });
    expect(sku.activeTo).toBe("2026-12-07T18:00:00.000Z");
    const published = await catalog.publishProduct(product.id);
    expect(lifecycle([published, sku], new Date("2026-12-08T00:00:00Z")).state).toBe("ended");
    expect("activeTo" in (await catalog.updateSku(sku.id, { activeTo: null }))!).toBe(false);
  });
});

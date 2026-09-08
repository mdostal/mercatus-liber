import { createSqliteAdapter } from "@mercatus-liber/adapter-sqlite";
import { createCatalogService, type CatalogService } from "@mercatus-liber/catalog";
import { createInMemoryEventBus } from "@mercatus-liber/core";
import { createThemingService, type ThemingService } from "@mercatus-liber/theming";
import { beforeEach, describe, expect, it } from "vitest";
import { createPdpService, type PdpService } from "../src/service.js";

describe("pdp service", () => {
  let catalog: CatalogService;
  let theming: ThemingService;
  let pdp: PdpService;
  let productId: string;

  beforeEach(async () => {
    const persistence = createSqliteAdapter(":memory:");
    catalog = createCatalogService({ persistence, events: createInMemoryEventBus() });
    theming = createThemingService();
    pdp = createPdpService({ catalog, theming }); // catalog passed structurally -- never imported by src/, only by this test

    const product = await catalog.createProduct({
      slug: "organizer",
      title: "Organizer",
      description: "d",
      identifyingAttributeKeys: ["color", "size"],
    });
    productId = product.id;
    await catalog.publishProduct(product.id);
    await catalog.generateSkus(
      product.id,
      { color: ["red", "blue"], size: ["large"] },
      { amount: 1500, currency: "USD" },
    );
  });

  it("computes optionValues from real SKUs only, not a theoretical cartesian product", async () => {
    const viewModel = await pdp.getViewModel("organizer");
    expect(viewModel).not.toBeNull();
    const byKey = Object.fromEntries(viewModel!.optionValues.map((o) => [o.key, o.values.sort()]));
    expect(byKey).toEqual({ color: ["blue", "red"], size: ["large"] });
  });

  it("returns null for a nonexistent product slug rather than throwing", async () => {
    expect(await pdp.getViewModel("missing")).toBeNull();
  });

  it("resolveSelection delegates to catalog's own resolveVariant", async () => {
    const viewModel = await pdp.getViewModel("organizer");
    const direct = await catalog.resolveVariant(productId, [
      { key: "color", value: "red" },
      { key: "size", value: "large" },
    ]);
    const viaPdp = await pdp.resolveSelection(productId, [
      { key: "color", value: "red" },
      { key: "size", value: "large" },
    ]);
    expect(viaPdp).toEqual(direct);
    expect(viaPdp?.identifyingAttributes.find((a) => a.key === "color")?.value).toBe("red");
    void viewModel;
  });

  it("wires the resolved theming template key into the view model", async () => {
    theming.setDefaultTemplate("pdp", "pdp.long-scroll");
    const viewModel = await pdp.getViewModel("organizer");
    expect(viewModel?.templateKey).toBe("pdp.long-scroll");

    const overridden = await pdp.getViewModel("organizer", "pdp.tabbed-detail");
    expect(overridden?.templateKey).toBe("pdp.tabbed-detail");
  });
});

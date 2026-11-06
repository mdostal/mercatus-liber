import { describe, expect, it, vi } from "vitest";
import { seedCustomizationExample } from "../lib/customization-seed";
import {
  createCustomizationService,
  createInMemoryArtStyleRepository,
  createInMemoryFinishTierRepository,
  createInMemoryPaletteRepository,
  createInMemoryPricingRulesRepository,
  createInMemoryProductCustomizationRepository,
  createPricingService,
  priceLine,
} from "@mercatus-liber/customization";
import { describeCustomization } from "../lib/describe-customization";

function setup() {
  const customization = createCustomizationService({
    palette: createInMemoryPaletteRepository(),
    finishTiers: createInMemoryFinishTierRepository(),
    artStyles: createInMemoryArtStyleRepository(),
    productCustomizations: createInMemoryProductCustomizationRepository(),
  });
  const pricing = createPricingService({ rules: createInMemoryPricingRulesRepository() });
  const catalog = { getProductBySlug: vi.fn(async () => ({ id: "cap" })) } as never;
  return { customization, pricing, catalog };
}

describe("seedCustomizationExample", () => {
  it("produces a product that prices end to end", async () => {
    const deps = setup();
    await seedCustomizationExample(deps);
    const config = await deps.customization.getProductCustomizationByProductId("cap");
    const priced = await priceLine(deps, config!.id, "cap", {
      finish: "custom",
      selection: { crown: "red", brim: "khaki", thread: "navy", patch: "navy" },
      picks: { patch: "leather", strap: "brass" },
      name: "Long Name Here",
    });
    // 2600 base + 2 extra colors + 6 letters past 8 + leather patch.
    expect(priced.unitAmount).toBe(2600 + 300 + 300 + 400);
    expect(priced.line.colors.patch).toBe("navy");
  });

  it("🔍 running again can't overwrite an admin's prices or add a second product", async () => {
    const deps = setup();
    await seedCustomizationExample(deps);
    const rules = await deps.pricing.getRules("cap");
    await deps.pricing.saveRules("cap", { ...rules!, basePriceCents: { custom: 9999 } });
    await seedCustomizationExample(deps);
    expect((await deps.pricing.getRules("cap"))!.basePriceCents.custom).toBe(9999);
    expect(await deps.customization.listProductCustomizations()).toHaveLength(1);
  });

  it("does nothing for a store without the product", async () => {
    const deps = setup();
    await seedCustomizationExample({ ...deps, catalog: { getProductBySlug: async () => null } as never });
    expect(await deps.customization.listPalette()).toEqual([]);
  });

  it("marks custom hardware as needing a quote", async () => {
    const deps = setup();
    await seedCustomizationExample(deps);
    const config = await deps.customization.getProductCustomizationByProductId("cap");
    const priced = await priceLine(deps, config!.id, "cap", { finish: "one-color", selection: { __all: "navy" }, picks: { patch: "embroidered", strap: "custom" } });
    expect(priced.line.quoteRequired).toBe(true);
    expect(priced.line.requests).toEqual([{ kind: "option", id: "custom", at: "strap" }]);
  });
});

describe("describeCustomization", () => {
  it("summarizes a line, including what needs handling by hand", () => {
    expect(describeCustomization({ finish: "custom", colorMode: "palette", colors: { a: "red", b: "red", c: "gold" }, picks: { patch: "leather" }, name: "Your Name", requests: [{ kind: "color", id: "gold", at: "c" }] })).toBe("Finish: custom · Name: Your Name · patch: leather · Colors: red, gold · By request: gold");
  });
});

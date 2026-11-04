import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryPricingRulesRepository } from "../src/in-memory-repository.js";
import { createPricingService, MissingPricingRulesError, type PricingService } from "../src/pricing-service.js";
import { TREASURE_CHEST_PRICING_RULES } from "./fixtures.js";

describe("PricingService", () => {
  let service: PricingService;

  beforeEach(() => {
    service = createPricingService({ rules: createInMemoryPricingRulesRepository() });
  });

  it("getRules returns null for a product with no rules saved yet", async () => {
    expect(await service.getRules("treasure-chest")).toBeNull();
  });

  it("saveRules/getRules round-trips a product's full pricing document", async () => {
    await service.saveRules("treasure-chest", TREASURE_CHEST_PRICING_RULES);
    expect(await service.getRules("treasure-chest")).toEqual(TREASURE_CHEST_PRICING_RULES);
  });

  it("🔍 mutating a returned rules object doesn't corrupt the repository's own stored copy", async () => {
    await service.saveRules("treasure-chest", TREASURE_CHEST_PRICING_RULES);
    const first = await service.getRules("treasure-chest");
    first!.basePriceCents.solid = 999999;
    const again = await service.getRules("treasure-chest");
    expect(again!.basePriceCents.solid).toBe(5900);
  });

  it("listRules returns every saved product's rules, keyed by productId", async () => {
    await service.saveRules("treasure-chest", TREASURE_CHEST_PRICING_RULES);
    await service.saveRules("school-caddy", { basePriceCents: { solid: 4100 }, attributes: [] });
    const all = await service.listRules();
    expect(Object.keys(all).sort()).toEqual(["school-caddy", "treasure-chest"]);
  });

  it("priceOf prices a build against the saved product's rules -- real reference number", async () => {
    await service.saveRules("treasure-chest", TREASURE_CHEST_PRICING_RULES);
    const result = await service.priceOf("treasure-chest", { finish: "solid", attributeCounts: { customName: 1 } });
    expect(result.total).toBe(6300);
  });

  it("priceOf throws MissingPricingRulesError for a product with no rules saved -- never silently prices at $0", async () => {
    await expect(service.priceOf("nope", { finish: "solid" })).rejects.toThrow(MissingPricingRulesError);
  });
});

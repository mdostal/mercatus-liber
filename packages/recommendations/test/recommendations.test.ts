import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryRecommendationRepository } from "../src/in-memory-repository.js";
import { createRecommendationsService, type RecommendationsService } from "../src/service.js";
import type { CreateRuleInput, RecommendationRepository } from "../src/types.js";

function ruleInput(overrides: Partial<CreateRuleInput> = {}): CreateRuleInput {
  return {
    sourceProductId: "p1",
    label: "Customers also bought",
    placement: "pdp",
    targetProductIds: ["p2", "p3"],
    ...overrides,
  };
}

describe("recommendations service", () => {
  let repository: RecommendationRepository;
  let recommendations: RecommendationsService;

  beforeEach(() => {
    repository = createInMemoryRecommendationRepository();
    recommendations = createRecommendationsService({ repository });
  });

  describe("CRUD", () => {
    it("createRule assigns an id and defaults status to active", async () => {
      const rule = await recommendations.createRule(ruleInput());
      expect(rule.id).toBeTruthy();
      expect(rule.status).toBe("active");
      expect(rule.targetProductIds).toEqual(["p2", "p3"]);
    });

    it("createRule respects an explicit status", async () => {
      const rule = await recommendations.createRule(ruleInput({ status: "inactive" }));
      expect(rule.status).toBe("inactive");
    });

    it("getRule returns null for an unknown id", async () => {
      expect(await recommendations.getRule("missing")).toBeNull();
    });

    it("getRule returns the created rule by id", async () => {
      const created = await recommendations.createRule(ruleInput());
      expect(await recommendations.getRule(created.id)).toEqual(created);
    });

    it("listRules returns every created rule", async () => {
      const a = await recommendations.createRule(ruleInput({ sourceProductId: "p1" }));
      const b = await recommendations.createRule(ruleInput({ sourceProductId: "p4" }));
      const listed = await recommendations.listRules();
      expect(listed.map((rule) => rule.id)).toEqual(expect.arrayContaining([a.id, b.id]));
    });
  });

  describe("getRecommendationsForProduct -- placement matching (acceptance criteria 1-3)", () => {
    it("AC1: a pdp-placement rule matches getRecommendationsForProduct(sourceProductId, 'pdp')", async () => {
      const rule = await recommendations.createRule(
        ruleInput({ sourceProductId: "p1", targetProductIds: ["p2", "p3"], placement: "pdp" }),
      );
      const results = await recommendations.getRecommendationsForProduct("p1", "pdp");
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(rule);
    });

    it("AC2: the same pdp-placement rule does NOT match getRecommendationsForProduct(sourceProductId, 'cart')", async () => {
      await recommendations.createRule(
        ruleInput({ sourceProductId: "p1", targetProductIds: ["p2", "p3"], placement: "pdp" }),
      );
      const results = await recommendations.getRecommendationsForProduct("p1", "cart");
      expect(results).toEqual([]);
    });

    it("AC3: a 'both'-placement rule matches both the 'pdp' and 'cart' placement filters", async () => {
      const rule = await recommendations.createRule(
        ruleInput({ sourceProductId: "p1", targetProductIds: ["p2"], placement: "both" }),
      );
      const pdpResults = await recommendations.getRecommendationsForProduct("p1", "pdp");
      const cartResults = await recommendations.getRecommendationsForProduct("p1", "cart");
      expect(pdpResults).toEqual([rule]);
      expect(cartResults).toEqual([rule]);
    });

    it("with no placement filter, returns every active matching rule regardless of its own placement", async () => {
      const pdpRule = await recommendations.createRule(
        ruleInput({ sourceProductId: "p1", targetProductIds: ["p2"], placement: "pdp" }),
      );
      const cartRule = await recommendations.createRule(
        ruleInput({ sourceProductId: "p1", targetProductIds: ["p3"], placement: "cart" }),
      );
      const results = await recommendations.getRecommendationsForProduct("p1");
      expect(results.map((rule) => rule.id)).toEqual(
        expect.arrayContaining([pdpRule.id, cartRule.id]),
      );
    });

    it("does not match rules for a different sourceProductId", async () => {
      await recommendations.createRule(ruleInput({ sourceProductId: "p1" }));
      const results = await recommendations.getRecommendationsForProduct("p9");
      expect(results).toEqual([]);
    });
  });

  describe("validation (acceptance criteria 4-5)", () => {
    it("AC4: rejects createRule with an empty targetProductIds array, and persists nothing", async () => {
      await expect(
        recommendations.createRule(ruleInput({ targetProductIds: [] })),
      ).rejects.toThrow(/at least one targetProductId/);
      expect(await recommendations.listRules()).toHaveLength(0);
    });

    it("AC5: rejects createRule when sourceProductId is also present in targetProductIds, and persists nothing", async () => {
      await expect(
        recommendations.createRule(
          ruleInput({ sourceProductId: "p1", targetProductIds: ["p1", "p2"] }),
        ),
      ).rejects.toThrow(/cannot appear in its own targetProductIds/);
      expect(await recommendations.listRules()).toHaveLength(0);
    });

    it("rejects updateRule with an empty targetProductIds array, and leaves the existing rule unchanged", async () => {
      const created = await recommendations.createRule(ruleInput());
      await expect(
        recommendations.updateRule(created.id, { targetProductIds: [] }),
      ).rejects.toThrow(/at least one targetProductId/);
      expect(await recommendations.getRule(created.id)).toEqual(created);
    });

    it("rejects updateRule that would introduce a self-recommendation, and leaves the existing rule unchanged", async () => {
      const created = await recommendations.createRule(ruleInput({ sourceProductId: "p1" }));
      await expect(
        recommendations.updateRule(created.id, { targetProductIds: ["p1", "p2"] }),
      ).rejects.toThrow(/cannot appear in its own targetProductIds/);
      expect(await recommendations.getRule(created.id)).toEqual(created);
    });
  });

  describe("updateRule (acceptance criterion 6)", () => {
    it("AC6: changing label via updateRule is reflected by getRule while id and targetProductIds are preserved", async () => {
      const created = await recommendations.createRule(ruleInput({ label: "Customers also bought" }));
      const updated = await recommendations.updateRule(created.id, { label: "Frequently bought together" });
      expect(updated).not.toBeNull();
      expect(updated!.label).toBe("Frequently bought together");
      expect(updated!.id).toBe(created.id);
      expect(updated!.targetProductIds).toEqual(created.targetProductIds);

      const fetched = await recommendations.getRule(created.id);
      expect(fetched!.label).toBe("Frequently bought together");
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.targetProductIds).toEqual(created.targetProductIds);
    });

    it("returns null when updating an unknown id", async () => {
      expect(await recommendations.updateRule("missing", { label: "x" })).toBeNull();
    });
  });

  describe("deactivateRule (acceptance criterion 7)", () => {
    it("AC7: a deactivated rule is excluded from getRecommendationsForProduct but remains visible via listRules/getRule", async () => {
      const created = await recommendations.createRule(ruleInput({ sourceProductId: "p1" }));
      const deactivated = await recommendations.deactivateRule(created.id);
      expect(deactivated).not.toBeNull();
      expect(deactivated!.status).toBe("inactive");

      const forProduct = await recommendations.getRecommendationsForProduct("p1");
      expect(forProduct).toEqual([]);

      const viaGetRule = await recommendations.getRule(created.id);
      expect(viaGetRule).not.toBeNull();
      expect(viaGetRule!.status).toBe("inactive");

      const viaListRules = await recommendations.listRules();
      expect(viaListRules.map((rule) => rule.id)).toContain(created.id);
    });

    it("returns null when deactivating an unknown id", async () => {
      expect(await recommendations.deactivateRule("missing")).toBeNull();
    });
  });

  describe("in-memory repository isolation", () => {
    it("mutating a returned rule does not affect stored state", async () => {
      const created = await recommendations.createRule(ruleInput());
      created.targetProductIds.push("mutated");
      const fetched = await recommendations.getRule(created.id);
      expect(fetched!.targetProductIds).toEqual(["p2", "p3"]);
    });
  });

  /**
   * commerce-gap-audit-3 finding 13: a real, disclosed gap -- listRules()
   * carried no demo filter at all, so an operator in one demo's own
   * `/admin/recommendations` list saw every other demo's rules mixed in
   * too. Same bug class/fix shape as service-areas/advertising/promotions'
   * demoSlug tests (commerce-gap-audit-3 findings 1-3).
   */
  describe("demo scoping", () => {
    it("listRules(filter) scopes by demoSlug -- two demos' rules never bleed into each other's results", async () => {
      const printShop = await recommendations.createRule(
        ruleInput({ sourceProductId: "p-print-shop", demoSlug: "print-shop" }),
      );
      const northline = await recommendations.createRule(
        ruleInput({ sourceProductId: "p-northline", demoSlug: "northline" }),
      );

      const printShopOnly = await recommendations.listRules({ demoSlug: "print-shop" });
      expect(printShopOnly.map((rule) => rule.id)).toEqual([printShop.id]);

      const northlineOnly = await recommendations.listRules({ demoSlug: "northline" });
      expect(northlineOnly.map((rule) => rule.id)).toEqual([northline.id]);

      // Unscoped listRules() (no demoSlug filter) legitimately still
      // returns every demo's rules -- backward compatible.
      const everything = await recommendations.listRules();
      expect(everything.map((rule) => rule.id).sort()).toEqual([printShop.id, northline.id].sort());
    });
  });
});

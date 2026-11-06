import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryArtStyleRepository, createInMemoryFinishTierRepository, createInMemoryPaletteRepository, createInMemoryProductCustomizationRepository } from "../src/in-memory-repository.js";
import { InvalidColorSelectionError } from "../src/resolution.js";
import { DiscontinuedArtStyleError, DiscontinuedFinishError, UnknownArtStyleError, UnknownFinishTierError, createCustomizationService, type CustomizationService } from "../src/service.js";
import { resolvePrice } from "../src/pricing.js";
import { MissingParentRegionError, type PricingRules } from "../src/types.js";
import { REAL_ART_STYLES, REAL_FINISHES, REAL_PALETTE, STOVETOP_GLOW_CUSTOMIZATION, STOVETOP_GLOW_REGIONS, TREASURE_CHEST_CUSTOMIZATION, TREASURE_CHEST_REGIONS } from "./fixtures.js";
// NOTE: pricing-related service tests (getFinishPriceDelta/getArtStylePriceDelta/getCustomizationPriceDelta)
// were removed along with those methods -- pricing now lives entirely in PricingService (test/pricing.test.ts
// and test/pricing-service.test.ts), decoupled from CustomizationService.

describe("CustomizationService", () => {
  let service: CustomizationService;

  beforeEach(async () => {
    service = createCustomizationService({
      palette: createInMemoryPaletteRepository(),
      finishTiers: createInMemoryFinishTierRepository(),
      artStyles: createInMemoryArtStyleRepository(),
      productCustomizations: createInMemoryProductCustomizationRepository(),
    });
    for (const color of REAL_PALETTE) await service.setPaletteColor(color);
    for (const finish of REAL_FINISHES) await service.setFinishTier(finish);
    for (const style of REAL_ART_STYLES) await service.setArtStyle(style);
  });

  describe("palette / finish tiers", () => {
    it("listPalette/listFinishTiers round-trip exactly what was seeded", async () => {
      expect((await service.listPalette()).map((c) => c.id).sort()).toEqual(REAL_PALETTE.map((c) => c.id).sort());
      expect((await service.listFinishTiers()).map((f) => f.id).sort()).toEqual(REAL_FINISHES.map((f) => f.id).sort());
    });

    it("🔍 mutating a returned palette color doesn't corrupt the repository's own stored copy", async () => {
      const [first] = await service.listPalette();
      first!.label = "MUTATED";
      const again = await service.listPalette();
      expect(again.find((c) => c.id === first!.id)!.label).not.toBe("MUTATED");
    });
  });

  describe("createProductCustomization / updateProductCustomization", () => {
    it("assigns an id and persists treasure-chest's real region list", async () => {
      const created = await service.createProductCustomization({ productId: TREASURE_CHEST_CUSTOMIZATION.productId, finishIds: TREASURE_CHEST_CUSTOMIZATION.finishIds, regions: TREASURE_CHEST_REGIONS });
      expect(created.id).toBeTruthy();
      expect(await service.getProductCustomization(created.id)).toEqual(created);
      expect(await service.getProductCustomizationByProductId("treasure-chest")).toEqual(created);
    });

    it("rejects a non-separable region with no parentRegionId at creation", async () => {
      await expect(service.createProductCustomization({ productId: "p", finishIds: ["ams"], regions: [{ id: "x", label: "X", defaultHex: "#fff", separable: false }] })).rejects.toThrow(MissingParentRegionError);
    });

    it("updateProductCustomization merges a patch and re-validates regions, never overwriting id/productId", async () => {
      const created = await service.createProductCustomization({ productId: TREASURE_CHEST_CUSTOMIZATION.productId, finishIds: ["solid"], regions: TREASURE_CHEST_REGIONS });
      const updated = await service.updateProductCustomization(created.id, { finishIds: ["solid", "ams", "painted"] });
      expect(updated!.id).toBe(created.id);
      expect(updated!.productId).toBe(created.productId);
      expect(updated!.finishIds).toEqual(["solid", "ams", "painted"]);
      expect(updated!.regions).toEqual(TREASURE_CHEST_REGIONS);
    });

    it("updateProductCustomization returns null for an unknown id", async () => {
      expect(await service.updateProductCustomization("nope", { finishIds: ["solid"] })).toBeNull();
    });

    it("listProductCustomizations lists everything created", async () => {
      await service.createProductCustomization({ productId: "a", finishIds: ["solid"], regions: [] });
      await service.createProductCustomization({ productId: "b", finishIds: ["solid"], regions: [] });
      expect(await service.listProductCustomizations()).toHaveLength(2);
    });
  });

  describe("resolveEffectiveColors", () => {
    it("resolves every region of treasure-chest under 'solid' (ColorMode single) from selection.__all", async () => {
      const created = await service.createProductCustomization({ productId: TREASURE_CHEST_CUSTOMIZATION.productId, finishIds: TREASURE_CHEST_CUSTOMIZATION.finishIds, regions: TREASURE_CHEST_REGIONS });
      const result = await service.resolveEffectiveColors(created.id, "solid", { __all: "brown" });
      expect(result).toEqual({ body: "brown", straps: "brown", name: "brown", "plate-border": "brown", plate: "brown", lock: "brown" });
    });

    it("resolves stovetop-glow under 'separate': coils/knob-pointers follow their parents", async () => {
      const created = await service.createProductCustomization({ productId: STOVETOP_GLOW_CUSTOMIZATION.productId, finishIds: STOVETOP_GLOW_CUSTOMIZATION.finishIds, regions: STOVETOP_GLOW_REGIONS });
      const result = await service.resolveEffectiveColors(created.id, "separate", { body: "black", glass: "blue", knobs: "red" });
      expect(result.coils).toBe("blue");
      expect(result["knob-pointers"]).toBe("red");
    });

    it("throws UnknownFinishTierError when finishId isn't in this product's own finishIds", async () => {
      const created = await service.createProductCustomization({ productId: "chest", finishIds: ["solid"], regions: TREASURE_CHEST_REGIONS });
      await expect(service.resolveEffectiveColors(created.id, "painted", { __all: "#000" })).rejects.toThrow(UnknownFinishTierError);
    });

    it("throws DiscontinuedFinishError when the finish tier itself is discontinued -- backend-enforced, not left to a client-side UI", async () => {
      await service.setFinishTier({ ...REAL_FINISHES.find((f) => f.id === "painted")!, status: "discontinued" });
      const created = await service.createProductCustomization({ productId: "chest", finishIds: ["solid", "painted"], regions: TREASURE_CHEST_REGIONS });
      await expect(service.resolveEffectiveColors(created.id, "painted", { __all: "#000" })).rejects.toThrow(DiscontinuedFinishError);
    });

    it("rejects a submitted discontinued palette color even though the UI would normally grey it out", async () => {
      await service.setPaletteColor({ ...REAL_PALETTE.find((c) => c.id === "red")!, status: "discontinued" });
      const created = await service.createProductCustomization({ productId: "chest", finishIds: ["ams"], regions: TREASURE_CHEST_REGIONS });
      await expect(
        service.resolveEffectiveColors(created.id, "ams", { body: "red", straps: "black", name: "black", "plate-border": "black", plate: "yellow", lock: "yellow" }),
      ).rejects.toThrow(InvalidColorSelectionError);
    });

    it("accepts a submitted 'request'-status palette color -- selectable on request, per AvailabilityStatus's contract", async () => {
      await service.setPaletteColor({ ...REAL_PALETTE.find((c) => c.id === "red")!, status: "request" });
      const created = await service.createProductCustomization({ productId: "chest", finishIds: ["ams"], regions: TREASURE_CHEST_REGIONS });
      const result = await service.resolveEffectiveColors(created.id, "ams", { body: "red", straps: "black", name: "black", "plate-border": "black", plate: "yellow", lock: "yellow" });
      expect(result.body).toBe("red");
    });

    it("🔍 doesn't validate a LOCKED region's own missing selection entry (it has none -- it inherits), only the parent's", async () => {
      const created = await service.createProductCustomization({ productId: STOVETOP_GLOW_CUSTOMIZATION.productId, finishIds: STOVETOP_GLOW_CUSTOMIZATION.finishIds, regions: STOVETOP_GLOW_REGIONS });
      // No "coils" key at all in the selection -- only its parent "glass" is set.
      const result = await service.resolveEffectiveColors(created.id, "separate", { body: "black", glass: "blue", knobs: "red" });
      expect(result.coils).toBe("blue");
    });
  });

  describe("getRegionChoices", () => {
    it("keys the result '__all' for a ColorMode 'single' finish", async () => {
      const created = await service.createProductCustomization({ productId: TREASURE_CHEST_CUSTOMIZATION.productId, finishIds: TREASURE_CHEST_CUSTOMIZATION.finishIds, regions: TREASURE_CHEST_REGIONS });
      const choices = await service.getRegionChoices(created.id, "solid");
      expect(Object.keys(choices)).toEqual(["__all"]);
      expect(choices.__all!.palette).toHaveLength(REAL_PALETTE.length);
    });

    it("keys the result per-region for a 'palette'/'any' finish, restricting coils to white", async () => {
      const created = await service.createProductCustomization({ productId: STOVETOP_GLOW_CUSTOMIZATION.productId, finishIds: STOVETOP_GLOW_CUSTOMIZATION.finishIds, regions: STOVETOP_GLOW_REGIONS });
      const choices = await service.getRegionChoices(created.id, "painted");
      expect(choices.coils!.palette.map((c) => c.id)).toEqual(["white"]);
      expect(choices.coils!.freeColor).toBe(false);
      expect(choices.body!.freeColor).toBe(true);
    });
  });

  describe("getColorCount", () => {
    it("counts distinct colors across treasure-chest's real regions under 'separate', collapsing parent-follows regions", async () => {
      const created = await service.createProductCustomization({ productId: "chest", finishIds: ["separate"], regions: TREASURE_CHEST_REGIONS });
      const count = await service.getColorCount(created.id, "separate", { body: "red", straps: "green", plate: "blue", lock: "blue" });
      expect(count).toBe(3);
    });

    it("rejects a submitted discontinued color before counting it -- same validation as resolveEffectiveColors", async () => {
      await service.setPaletteColor({ ...REAL_PALETTE.find((c) => c.id === "red")!, status: "discontinued" });
      const created = await service.createProductCustomization({ productId: "chest", finishIds: ["separate"], regions: TREASURE_CHEST_REGIONS });
      await expect(service.getColorCount(created.id, "separate", { body: "red", straps: "black", plate: "yellow", lock: "yellow" })).rejects.toThrow(InvalidColorSelectionError);
    });
  });

  describe("art styles", () => {
    it("listArtStyles round-trips exactly what was seeded", async () => {
      expect((await service.listArtStyles()).map((s) => s.id).sort()).toEqual(REAL_ART_STYLES.map((s) => s.id).sort());
    });

    it("validateArtStyleChoice returns the resolved ArtStyle when it's one of this product's own offered styles", async () => {
      const created = await service.createProductCustomization({ productId: "chest", finishIds: ["solid"], regions: [], artStyleIds: ["flush", "raised"] });
      const style = await service.validateArtStyleChoice(created.id, "raised");
      expect(style.id).toBe("raised");
    });

    it("validateArtStyleChoice throws UnknownArtStyleError when the product doesn't offer that art style at all", async () => {
      const created = await service.createProductCustomization({ productId: "chest", finishIds: ["solid"], regions: [], artStyleIds: ["flush"] });
      await expect(service.validateArtStyleChoice(created.id, "raised")).rejects.toThrow(UnknownArtStyleError);
    });

    it("validateArtStyleChoice throws DiscontinuedArtStyleError for a discontinued style -- backend-enforced, not left to a client-side UI", async () => {
      await service.setArtStyle({ ...REAL_ART_STYLES.find((s) => s.id === "raised")!, status: "discontinued" });
      const created = await service.createProductCustomization({ productId: "chest", finishIds: ["solid"], regions: [], artStyleIds: ["flush", "raised"] });
      await expect(service.validateArtStyleChoice(created.id, "raised")).rejects.toThrow(DiscontinuedArtStyleError);
    });
  });

  describe("palette ids end to end", () => {
    it("🔍 charges a color markup from resolveEffectiveColors' own output", async () => {
      const created = await service.createProductCustomization(TREASURE_CHEST_CUSTOMIZATION);
      const selection = Object.fromEntries(TREASURE_CHEST_REGIONS.map((r) => [r.id, r.id === "body" ? "red" : "black"]));
      const colors = await service.resolveEffectiveColors(created.id, "ams", selection);
      expect(colors.body).toBe("red");
      const rules: PricingRules = { basePriceCents: { ams: 1000 }, attributes: [], colorMarkupCents: { red: 500 } };
      expect(resolvePrice(rules, { finish: "ams", colors }).total).toBe(1500);
    });

    it("🔍 rejects a hex selection in a palette-only finish", async () => {
      const created = await service.createProductCustomization(TREASURE_CHEST_CUSTOMIZATION);
      const selection = Object.fromEntries(TREASURE_CHEST_REGIONS.map((r) => [r.id, "#141414"]));
      await expect(service.resolveEffectiveColors(created.id, "ams", selection)).rejects.toThrow(InvalidColorSelectionError);
    });
  });
});

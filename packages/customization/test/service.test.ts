import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryFinishTierRepository, createInMemoryPaletteRepository, createInMemoryProductCustomizationRepository } from "../src/in-memory-repository.js";
import { InvalidColorSelectionError } from "../src/resolution.js";
import { DiscontinuedFinishError, UnknownFinishTierError, createCustomizationService, type CustomizationService } from "../src/service.js";
import { MissingParentRegionError } from "../src/types.js";
import { REAL_FINISHES, REAL_PALETTE, STOVETOP_GLOW_CUSTOMIZATION, STOVETOP_GLOW_REGIONS, TREASURE_CHEST_CUSTOMIZATION, TREASURE_CHEST_REGIONS } from "./fixtures.js";

describe("CustomizationService", () => {
  let service: CustomizationService;

  beforeEach(async () => {
    service = createCustomizationService({
      palette: createInMemoryPaletteRepository(),
      finishTiers: createInMemoryFinishTierRepository(),
      productCustomizations: createInMemoryProductCustomizationRepository(),
    });
    for (const color of REAL_PALETTE) await service.setPaletteColor(color);
    for (const finish of REAL_FINISHES) await service.setFinishTier(finish);
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
      const result = await service.resolveEffectiveColors(created.id, "solid", { __all: "#7A4A24" });
      expect(result).toEqual({ body: "#7A4A24", straps: "#7A4A24", plate: "#7A4A24" });
    });

    it("resolves stovetop-glow under 'separate': diffusers/knob-pointers follow their parents", async () => {
      const created = await service.createProductCustomization({ productId: STOVETOP_GLOW_CUSTOMIZATION.productId, finishIds: STOVETOP_GLOW_CUSTOMIZATION.finishIds, regions: STOVETOP_GLOW_REGIONS });
      const result = await service.resolveEffectiveColors(created.id, "separate", { body: "#141414", glass: "#1F5FD0", knobs: "#C12E1F" });
      expect(result.diffusers).toBe("#1F5FD0");
      expect(result["knob-pointers"]).toBe("#C12E1F");
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
      await expect(service.resolveEffectiveColors(created.id, "ams", { body: "#C12E1F", straps: "#141414", plate: "#F4D21F" })).rejects.toThrow(InvalidColorSelectionError);
    });

    it("accepts a submitted 'request'-status palette color -- selectable on request, per AvailabilityStatus's contract", async () => {
      await service.setPaletteColor({ ...REAL_PALETTE.find((c) => c.id === "red")!, status: "request" });
      const created = await service.createProductCustomization({ productId: "chest", finishIds: ["ams"], regions: TREASURE_CHEST_REGIONS });
      const result = await service.resolveEffectiveColors(created.id, "ams", { body: "#C12E1F", straps: "#141414", plate: "#F4D21F" });
      expect(result.body).toBe("#C12E1F");
    });

    it("🔍 doesn't validate a LOCKED region's own missing selection entry (it has none -- it inherits), only the parent's", async () => {
      const created = await service.createProductCustomization({ productId: STOVETOP_GLOW_CUSTOMIZATION.productId, finishIds: STOVETOP_GLOW_CUSTOMIZATION.finishIds, regions: STOVETOP_GLOW_REGIONS });
      // No "diffusers" key at all in the selection -- only its parent "glass" is set.
      const result = await service.resolveEffectiveColors(created.id, "separate", { body: "#141414", glass: "#1F5FD0", knobs: "#C12E1F" });
      expect(result.diffusers).toBe("#1F5FD0");
    });
  });

  describe("getRegionChoices", () => {
    it("keys the result '__all' for a ColorMode 'single' finish", async () => {
      const created = await service.createProductCustomization({ productId: TREASURE_CHEST_CUSTOMIZATION.productId, finishIds: TREASURE_CHEST_CUSTOMIZATION.finishIds, regions: TREASURE_CHEST_REGIONS });
      const choices = await service.getRegionChoices(created.id, "solid");
      expect(Object.keys(choices)).toEqual(["__all"]);
      expect(choices.__all!.palette).toHaveLength(REAL_PALETTE.length);
    });

    it("keys the result per-region for a 'palette'/'any' finish, restricting diffusers to white", async () => {
      const created = await service.createProductCustomization({ productId: STOVETOP_GLOW_CUSTOMIZATION.productId, finishIds: STOVETOP_GLOW_CUSTOMIZATION.finishIds, regions: STOVETOP_GLOW_REGIONS });
      const choices = await service.getRegionChoices(created.id, "painted");
      expect(choices.diffusers!.palette.map((c) => c.id)).toEqual(["white"]);
      expect(choices.diffusers!.freeColor).toBe(false);
      expect(choices.body!.freeColor).toBe(true);
    });
  });

  describe("getFinishPriceDelta", () => {
    it("returns undefined when the product has no override and the finish has no global default", async () => {
      const created = await service.createProductCustomization({ productId: "chest", finishIds: ["painted"], regions: [] });
      expect(await service.getFinishPriceDelta(created.id, "painted")).toBeUndefined();
    });

    it("falls back to the finish tier's own global priceDelta", async () => {
      await service.setFinishTier({ ...REAL_FINISHES.find((f) => f.id === "painted")!, priceDelta: { amount: 1500, currency: "USD" } });
      const created = await service.createProductCustomization({ productId: "chest", finishIds: ["painted"], regions: [] });
      expect(await service.getFinishPriceDelta(created.id, "painted")).toEqual({ amount: 1500, currency: "USD" });
    });

    it("a product-level finishPriceDeltas override wins over the finish's global default -- a large chest costs more to hand-paint than a small insert tray", async () => {
      await service.setFinishTier({ ...REAL_FINISHES.find((f) => f.id === "painted")!, priceDelta: { amount: 1500, currency: "USD" } });
      const created = await service.createProductCustomization({ productId: "chest", finishIds: ["painted"], regions: [], finishPriceDeltas: { painted: { amount: 5000, currency: "USD" } } });
      expect(await service.getFinishPriceDelta(created.id, "painted")).toEqual({ amount: 5000, currency: "USD" });
    });
  });
});

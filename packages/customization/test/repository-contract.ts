import { describe, expect, it } from "vitest";
import { createCustomizationService } from "../src/service.js";
import { createPricingService } from "../src/pricing-service.js";
import { resolvePrice } from "../src/pricing.js";
import type {
  ArtStyleRepository,
  FinishTier,
  FinishTierRepository,
  PaletteColor,
  PaletteRepository,
  PricingRules,
  PricingRulesRepository,
  ProductCustomization,
  ProductCustomizationRepository,
} from "../src/types.js";
import type { ArtStyle } from "../src/types.js";

export interface CustomizationRepositories {
  palette: PaletteRepository;
  finishTiers: FinishTierRepository;
  artStyles: ArtStyleRepository;
  productCustomizations: ProductCustomizationRepository;
  rules: PricingRulesRepository;
}

const FULL_COLOR: PaletteColor = { id: "dawn", label: "Dawn silk", hex: "#C98FB0", kind: "multi", hexes: ["#F2A0B8", "#F2D060"], material: "silk", status: "request", note: "Ask first" };
const AMS: FinishTier = { id: "ams", rank: 2, label: "Multicolor", colors: "palette", description: "One print", producesSeparateParts: false };
const SEPARATE: FinishTier = { id: "separate", rank: 3, label: "Separate", colors: "palette", description: "Parts", producesSeparateParts: true, status: "discontinued", note: "Paused" };
const RAISED: ArtStyle = { id: "raised", label: "Raised", description: "Up", status: "request", note: "Soon" };
const FLUSH: ArtStyle = { id: "flush", label: "Flush", description: "Level" };
const FULL_CUSTOMIZATION: ProductCustomization = {
  id: "c1",
  productId: "chest",
  finishIds: ["ams", "solid"],
  regions: [
    { id: "body", label: "Body", defaultHex: "#141414", separable: true },
    { id: "coils", label: "Coils", defaultHex: "#F4F4F2", separable: false, parentRegionId: "body", allowedColorIds: ["white"], why: "LEDs" },
  ],
  bundledProductIds: ["a", "b"],
  artStyleIds: ["flush"],
  why: "Limited",
};
const FULL_RULES: PricingRules = {
  basePriceCents: { solid: 5900, ams: 8300 },
  attributes: [
    { id: "contrast", label: "Contrast", perUnitCents: 450 },
    { id: "discount", label: "Discount", perUnitCents: -100 },
    { id: "metal", label: "Metal", perUnitCents: 0, quoteOnly: true },
  ],
  contrastRules: [{ attributeId: "contrast", regions: ["straps"], core: ["body"] }],
  colorMarkupCents: { dawn: 500 },
  estimatedMinutes: { solid: 837, ams: 3642 },
  excessUnitRules: [{ attributeId: "contrast", source: "nameLength", freeUnits: 8, unitsPerExcess: 2 }],
};

/**
 * What every customization storage backend must do, run by each adapter's own
 * tests so they can't drift apart. `open` returns repositories on a fresh, empty
 * store; `reopen` returns new repositories on that same store, standing in for
 * a restart. Pass a `timeout` for a backend that's slow to start.
 */
export function describeCustomizationRepositoryContract(
  name: string,
  setup: () => Promise<{ open(): CustomizationRepositories }>,
  options: { timeout?: number } = {},
): void {
  describe(`${name}: customization repository contract`, { timeout: options.timeout ?? 5_000 }, () => {
    async function fresh(): Promise<{ repos: CustomizationRepositories; reopen(): CustomizationRepositories }> {
      const store = await setup();
      return { repos: store.open(), reopen: () => store.open() };
    }

    it("round-trips a palette color with every optional field", async () => {
      const { repos } = await fresh();
      await repos.palette.save(FULL_COLOR);
      expect(await repos.palette.list()).toEqual([FULL_COLOR]);
    });

    it("returns absent optional fields as absent, not null", async () => {
      const { repos } = await fresh();
      await repos.palette.save({ id: "black", label: "Black", hex: "#141414" });
      expect(await repos.palette.list()).toStrictEqual([{ id: "black", label: "Black", hex: "#141414" }]);
    });

    it("🔍 lists palette colors in insertion order, and an upsert keeps a color's position", async () => {
      const { repos } = await fresh();
      for (const id of ["white", "black", "red"]) await repos.palette.save({ id, label: id, hex: "#000000" });
      await repos.palette.save({ id: "white", label: "Bright white", hex: "#FFFFFF" });
      const listed = await repos.palette.list();
      expect(listed.map((c) => c.id)).toEqual(["white", "black", "red"]);
      expect(listed[0]!.label).toBe("Bright white");
    });

    it("🔍 clears an optional field when an upsert drops it", async () => {
      const { repos } = await fresh();
      await repos.palette.save(FULL_COLOR);
      await repos.palette.save({ id: "dawn", label: "Dawn", hex: "#C98FB0" });
      expect(await repos.palette.list()).toStrictEqual([{ id: "dawn", label: "Dawn", hex: "#C98FB0" }]);
    });

    it("lists finish tiers by rank and keeps every field", async () => {
      const { repos } = await fresh();
      await repos.finishTiers.save(SEPARATE);
      await repos.finishTiers.save(AMS);
      expect(await repos.finishTiers.list()).toEqual([AMS, SEPARATE]);
    });

    it("round-trips art styles in insertion order", async () => {
      const { repos } = await fresh();
      await repos.artStyles.save(RAISED);
      await repos.artStyles.save(FLUSH);
      expect(await repos.artStyles.list()).toEqual([RAISED, FLUSH]);
    });

    it("round-trips a product customization and finds it by id and product id", async () => {
      const { repos } = await fresh();
      await repos.productCustomizations.save(FULL_CUSTOMIZATION);
      expect(await repos.productCustomizations.get("c1")).toEqual(FULL_CUSTOMIZATION);
      expect(await repos.productCustomizations.getByProductId("chest")).toEqual(FULL_CUSTOMIZATION);
      expect(await repos.productCustomizations.list()).toEqual([FULL_CUSTOMIZATION]);
      expect(await repos.productCustomizations.get("missing")).toBeNull();
      expect(await repos.productCustomizations.getByProductId("missing")).toBeNull();
    });

    it("🔍 getByProductId returns the first saved when a product has two", async () => {
      const { repos } = await fresh();
      await repos.productCustomizations.save({ id: "first", productId: "chest", finishIds: [], regions: [] });
      await repos.productCustomizations.save({ id: "second", productId: "chest", finishIds: [], regions: [] });
      expect((await repos.productCustomizations.getByProductId("chest"))!.id).toBe("first");
    });

    it("round-trips full pricing rules, one document per product", async () => {
      const { repos } = await fresh();
      await repos.rules.save("chest", FULL_RULES);
      await repos.rules.save("caddy", { basePriceCents: { solid: 100 }, attributes: [] });
      expect(await repos.rules.get("chest")).toEqual(FULL_RULES);
      expect(await repos.rules.get("caddy")).toStrictEqual({ basePriceCents: { solid: 100 }, attributes: [] });
      expect(await repos.rules.get("missing")).toBeNull();
      expect(Object.keys(await repos.rules.list()).sort()).toEqual(["caddy", "chest"]);
      await repos.rules.save("caddy", { basePriceCents: { solid: 200 }, attributes: [] });
      expect((await repos.rules.get("caddy"))!.basePriceCents.solid).toBe(200);
    });

    it("🔍 keeps every repository's data across a restart", async () => {
      const { repos, reopen } = await fresh();
      await repos.palette.save(FULL_COLOR);
      await repos.finishTiers.save(AMS);
      await repos.artStyles.save(FLUSH);
      await repos.productCustomizations.save(FULL_CUSTOMIZATION);
      await repos.rules.save("chest", FULL_RULES);
      const after = reopen();
      expect(await after.palette.list()).toEqual([FULL_COLOR]);
      expect(await after.finishTiers.list()).toEqual([AMS]);
      expect(await after.artStyles.list()).toEqual([FLUSH]);
      expect(await after.productCustomizations.get("c1")).toEqual(FULL_CUSTOMIZATION);
      expect(await after.rules.get("chest")).toEqual(FULL_RULES);
    });

    it("🔍 an upsert after a restart keeps a color's position", async () => {
      const { repos, reopen } = await fresh();
      for (const id of ["white", "black"]) await repos.palette.save({ id, label: id, hex: "#000000" });
      const after = reopen();
      await after.palette.save({ id: "white", label: "Bright", hex: "#FFFFFF" });
      await after.palette.save({ id: "red", label: "Red", hex: "#FF0000" });
      expect((await after.palette.list()).map((c) => c.id)).toEqual(["white", "black", "red"]);
    });

    it("works end to end through both services: a saved price charges a markup after a restart", async () => {
      const { repos, reopen } = await fresh();
      const service = createCustomizationService(repos);
      await service.setPaletteColor({ id: "black", label: "Black", hex: "#141414" });
      await service.setPaletteColor(FULL_COLOR);
      await service.setFinishTier(AMS);
      const created = await service.createProductCustomization({
        productId: "chest",
        finishIds: ["ams"],
        regions: [
          { id: "body", label: "Body", defaultHex: "#141414", separable: true },
          { id: "straps", label: "Straps", defaultHex: "#141414", separable: true },
        ],
      });
      await createPricingService({ rules: repos.rules }).saveRules("chest", { basePriceCents: { ams: 8300 }, attributes: [], colorMarkupCents: { dawn: 500 } });

      const after = reopen();
      const colors = await createCustomizationService(after).resolveEffectiveColors(created.id, "ams", { body: "black", straps: "dawn" });
      expect(colors).toEqual({ body: "black", straps: "dawn" });
      const rules = await createPricingService({ rules: after.rules }).getRules("chest");
      expect(resolvePrice(rules!, { finish: "ams", colors }).total).toBe(8800);
    });
  });
}

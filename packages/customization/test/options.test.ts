import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryArtStyleRepository, createInMemoryFinishTierRepository, createInMemoryPaletteRepository, createInMemoryProductCustomizationRepository } from "../src/in-memory-repository.js";
import { InvalidOptionsConfigError, InvalidPicksError, activeRegions, defaultPicks, resolvePicks, validateOptions } from "../src/options.js";
import { resolvePrice } from "../src/pricing.js";
import { createCustomizationService, type CustomizationService } from "../src/service.js";
import type { ProductCustomization, ProductOption } from "../src/types.js";
import { CHEST_OPTIONS, CHEST_REGIONS, CHEST_VARIANTS } from "./chest-options.fixture.js";
import { REAL_FINISHES, REAL_PALETTE } from "./fixtures.js";

const CHEST = { options: CHEST_OPTIONS, variants: CHEST_VARIANTS, regions: CHEST_REGIONS };
const ids = (variantId: string): string[] => activeRegions(CHEST, variantId).map((r) => r.id);

describe("resolvePicks on the real treasure chest", () => {
  it.each([
    [{ lock_position: "below", lock_style: "keyhole" }, "plate"],
    [{ lock_position: "seam", lock_style: "keyhole" }, "plate-seam"],
    [{ lock_position: "below", lock_style: "painted" }, "painted"],
    [{ lock_position: "seam", lock_style: "painted" }, "painted-seam"],
    [{ lock_position: "seam", lock_style: "working" }, "hasp"],
    [{ lock_position: "none" }, "none"],
  ])("%j resolves to %s", (picks, variant) => {
    expect(resolvePicks(CHEST, { ...picks, hardware: "printed" }).variantId).toBe(variant);
  });

  it("🔍 drops a lock style when there's no lock, and a working lock doesn't refuse there", () => {
    const resolved = resolvePicks(CHEST, { lock_position: "none", lock_style: "working" });
    expect(resolved.variantId).toBe("none");
    expect(resolved.picks).toEqual({ lock_position: "none" });
  });

  it("🔍 refuses a working lock below the seam", () => {
    expect(() => resolvePicks(CHEST, { lock_position: "below", lock_style: "working" })).toThrow(InvalidPicksError);
  });

  it("refuses an unknown choice, and drops an unknown option", () => {
    expect(() => resolvePicks(CHEST, { lock_position: "sideways" })).toThrow(/sideways/);
    expect(resolvePicks(CHEST, { lock_position: "none", nonsense: "x" }).picks).toEqual({ lock_position: "none" });
  });

  it("🔍 a pick named like an Object.prototype member is just unknown", () => {
    expect(resolvePicks(CHEST, { lock_position: "none", constructor: "x", toString: "y" }).picks).toEqual({ lock_position: "none" });
    expect(() => resolvePicks(CHEST, { lock_position: "constructor" })).toThrow(InvalidPicksError);
  });

  it("refuses when no version matches, including no picks at all", () => {
    expect(() => resolvePicks(CHEST, {})).toThrow(InvalidPicksError);
    expect(() => resolvePicks(CHEST, { lock_position: "seam" })).toThrow(InvalidPicksError);
  });

  it("lists a request-status choice instead of refusing it", () => {
    const resolved = resolvePicks(CHEST, { lock_position: "none", hardware: "metal" });
    expect(resolved.requests).toEqual([{ optionId: "hardware", choiceId: "metal" }]);
  });

  it("returns a null variant for a product with no variants", () => {
    expect(resolvePicks({}, {})).toEqual({ picks: {}, variantId: null, requests: [], attributeCounts: {} });
  });
});

describe("generic option behavior", () => {
  it("🔍 a dropped pick also hides an option that depended on it, whatever order picks arrive in", () => {
    const options: ProductOption[] = [
      { id: "a", label: "A", choices: [{ id: "on", label: "On" }, { id: "off", label: "Off" }] },
      { id: "b", label: "B", when: { a: "on" }, choices: [{ id: "x", label: "X" }] },
      { id: "c", label: "C", when: { b: "x" }, choices: [{ id: "y", label: "Y" }] },
    ];
    expect(resolvePicks({ options }, { c: "y", b: "x", a: "off" }).picks).toEqual({ a: "off" });
  });

  it("refuses a discontinued choice", () => {
    const options: ProductOption[] = [{ id: "a", label: "A", choices: [{ id: "old", label: "Old", status: "discontinued" }] }];
    expect(() => resolvePicks({ options }, { a: "old" })).toThrow(/discontinued/);
  });

  it("🔍 charges a choice through its attribute, including a quote-only one", () => {
    const options: ProductOption[] = [
      { id: "lock", label: "Lock", choices: [{ id: "fancy", label: "Fancy", attributeId: "fancyLock" }] },
      { id: "hardware", label: "Hardware", choices: [{ id: "metal", label: "Metal", status: "request", attributeId: "metal" }] },
    ];
    const { attributeCounts } = resolvePicks({ options }, { lock: "fancy", hardware: "metal" });
    const rules = { basePriceCents: { ams: 1000 }, attributes: [{ id: "fancyLock", label: "Fancy lock", perUnitCents: 300 }, { id: "metal", label: "Metal", perUnitCents: 0, quoteOnly: true }] };
    const price = resolvePrice(rules, { finish: "ams", attributeCounts });
    expect(price.total).toBe(1300);
    expect(price.quoteRequired).toBe(true);
  });

  it("🔍 a choice in a dropped option charges nothing", () => {
    const options: ProductOption[] = [
      { id: "a", label: "A", choices: [{ id: "off", label: "Off" }] },
      { id: "b", label: "B", when: { a: "on" }, choices: [{ id: "x", label: "X", attributeId: "charged" }] },
    ];
    expect(resolvePicks({ options }, { a: "off", b: "x" }).attributeCounts).toEqual({});
  });
});

describe("activeRegions", () => {
  it("includes hasp parts only on the working lock", () => {
    expect(ids("hasp")).toContain("hasp-flap");
    expect(ids("hasp")).not.toContain("lock");
    expect(ids("plate")).toContain("lock");
    expect(ids("plate")).not.toContain("hasp-flap");
  });

  it("🔍 a clean front has neither, and a null variant keeps only unconditional regions", () => {
    expect(ids("none").some((id) => id.startsWith("hasp") || id === "lock")).toBe(false);
    expect(activeRegions(CHEST, null)).toEqual(CHEST_REGIONS.filter((r) => !r.when));
  });
});

describe("defaultPicks", () => {
  it("🔍 starts the chest on the variant its default model shows, never a request-only choice", () => {
    const picks = defaultPicks(CHEST);
    expect(picks).toEqual({ lock_position: "below", lock_style: "keyhole", hardware: "printed" });
    expect(resolvePicks(CHEST, picks).variantId).toBe("plate");
  });

  it("skips a choice whose only isn't met", () => {
    const options: ProductOption[] = [
      { id: "a", label: "A", choices: [{ id: "low", label: "Low" }] },
      { id: "b", label: "B", choices: [{ id: "high-only", label: "H", only: { a: "high" } }, { id: "any", label: "Any" }] },
    ];
    expect(defaultPicks({ options }).b).toBe("any");
  });
});

describe("validateOptions", () => {
  it("accepts the real chest", () => {
    expect(() => validateOptions(CHEST)).not.toThrow();
  });

  it("refuses a condition naming an unknown option or variant", () => {
    const regions = CHEST_REGIONS;
    expect(() => validateOptions({ regions, options: [{ id: "a", label: "A", when: { nope: "x" }, choices: [] }] })).toThrow(InvalidOptionsConfigError);
    expect(() => validateOptions({ regions: [{ id: "r", label: "R", defaultHex: "#000000", separable: true, when: { lock: ["ghost"] } }], options: CHEST_OPTIONS, variants: CHEST_VARIANTS })).toThrow(/ghost/);
    expect(() => validateOptions({ regions: [{ id: "r", label: "R", defaultHex: "#000000", separable: true, when: { other: ["plate"] } }], options: CHEST_OPTIONS, variants: CHEST_VARIANTS })).toThrow(/other/);
  });
});

describe("pricing by variant", () => {
  const rules = {
    basePriceCents: { ams: 8000, solid: 5000 },
    attributes: [{ id: "time", label: "Time", perUnitCents: 1 }],
    estimatedMinutes: { ams: 100 },
    excessUnitRules: [{ attributeId: "time", source: "estimatedMinutes" as const, freeUnits: 0 }],
    variantOverrides: { hasp: { basePriceCents: { ams: 9000 }, estimatedMinutes: { ams: 200 } } },
  };

  it("uses the variant's base price and minutes", () => {
    expect(resolvePrice(rules, { finish: "ams", variant: "hasp" }).total).toBe(9000 + 200);
  });

  it("🔍 falls back per finish, and without a variant or for an unlisted one", () => {
    expect(resolvePrice(rules, { finish: "solid", variant: "hasp" }).lines[0]!.amount).toBe(5000);
    expect(resolvePrice(rules, { finish: "ams" }).total).toBe(8000 + 100);
    expect(resolvePrice(rules, { finish: "ams", variant: "plate" }).total).toBe(8000 + 100);
  });
});

describe("CustomizationService with options", () => {
  let service: CustomizationService;
  let chest: ProductCustomization;

  beforeEach(async () => {
    service = createCustomizationService({
      palette: createInMemoryPaletteRepository(),
      finishTiers: createInMemoryFinishTierRepository(),
      artStyles: createInMemoryArtStyleRepository(),
      productCustomizations: createInMemoryProductCustomizationRepository(),
    });
    for (const color of REAL_PALETTE) await service.setPaletteColor(color);
    for (const finish of REAL_FINISHES) await service.setFinishTier(finish);
    chest = await service.createProductCustomization({ productId: "chest", finishIds: ["ams", "solid"], ...CHEST });
  });

  const allBlack = () => Object.fromEntries(CHEST_REGIONS.map((r) => [r.id, "black"]));

  it("returns colors only for regions this version has", async () => {
    const hasp = await service.resolveEffectiveColors(chest.id, "ams", allBlack(), { lock_position: "seam", lock_style: "working" });
    expect(Object.keys(hasp)).toContain("hasp-flap");
    expect(Object.keys(hasp)).not.toContain("lock");
    const choices = await service.getRegionChoices(chest.id, "ams", { lock_position: "none" });
    expect(Object.keys(choices)).not.toContain("hasp-flap");
  });

  it("🔍 a color on a region this version doesn't have can't change the count or be refused", async () => {
    const selection = { ...allBlack(), "hasp-flap": "no-such-color" };
    expect(await service.getColorCount(chest.id, "ams", selection, { lock_position: "none" })).toBe(1);
  });

  it("🔍 refuses to resolve colors with no picks rather than pricing the wrong version", async () => {
    await expect(service.resolveEffectiveColors(chest.id, "ams", allBlack())).rejects.toThrow(InvalidPicksError);
  });

  it("exposes resolvePicks, and refuses a bad config on save", async () => {
    expect((await service.resolvePicks(chest.id, { lock_position: "none" })).variantId).toBe("none");
    await expect(service.updateProductCustomization(chest.id, { variants: { key: "lock", rows: [{ id: "x", label: "X", when: { ghost: "y" } }] } })).rejects.toThrow(InvalidOptionsConfigError);
  });
});

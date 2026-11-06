import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryArtStyleRepository, createInMemoryFinishTierRepository, createInMemoryPaletteRepository, createInMemoryPricingRulesRepository, createInMemoryProductCustomizationRepository } from "../src/in-memory-repository.js";
import { PrintOrderError, priceLine, toPrintOrder } from "../src/line.js";
import { InvalidPicksError } from "../src/options.js";
import { createPricingService, type PricingService } from "../src/pricing-service.js";
import { InvalidColorSelectionError } from "../src/resolution.js";
import { createCustomizationService, type CustomizationService } from "../src/service.js";
import { CHEST_OPTIONS, CHEST_REGIONS, CHEST_VARIANTS } from "./chest-options.fixture.js";
import { REAL_ART_STYLES, REAL_FINISHES, REAL_PALETTE } from "./fixtures.js";

describe("resolveLine and priceLine", () => {
  let customization: CustomizationService;
  let pricing: PricingService;
  let id: string;
  const allBlack = Object.fromEntries(CHEST_REGIONS.map((r) => [r.id, "black"]));
  const LOCK = { lock_position: "seam", lock_style: "working", hardware: "printed" };

  beforeEach(async () => {
    customization = createCustomizationService({
      palette: createInMemoryPaletteRepository(),
      finishTiers: createInMemoryFinishTierRepository(),
      artStyles: createInMemoryArtStyleRepository(),
      productCustomizations: createInMemoryProductCustomizationRepository(),
    });
    pricing = createPricingService({ rules: createInMemoryPricingRulesRepository() });
    for (const color of REAL_PALETTE) await customization.setPaletteColor(color);
    for (const finish of REAL_FINISHES) await customization.setFinishTier(finish);
    for (const style of REAL_ART_STYLES) await customization.setArtStyle(style);
    const options = CHEST_OPTIONS.map((o) => (o.id === "hardware" ? { ...o, choices: o.choices.map((c) => (c.id === "metal" ? { ...c, attributeId: "metal" } : c)) } : o));
    id = (await customization.createProductCustomization({ productId: "chest", finishIds: ["ams", "solid", "painted"], artStyleIds: ["flush", "raised"], options, variants: CHEST_VARIANTS, regions: CHEST_REGIONS })).id;
    await pricing.saveRules("chest", {
      basePriceCents: { ams: 8000, solid: 5000, painted: 9000 },
      attributes: [{ id: "metal", label: "Metal", perUnitCents: 0, quoteOnly: true }, { id: "changes", label: "Colors", perUnitCents: 100 }, { id: "longName", label: "Long name", perUnitCents: 50 }],
      colorMarkupCents: { pink: 300 },
      excessUnitRules: [{ attributeId: "changes", source: "colorChanges", freeUnits: 0 }, { attributeId: "longName", source: "nameLength", freeUnits: 8 }],
      variantOverrides: { hasp: { basePriceCents: { ams: 8500 } } },
    });
  });

  const deps = () => ({ customization, pricing });

  it("builds a line in palette ids, with only this version's regions", async () => {
    const { line } = await customization.resolveLine(id, { finish: "ams", selection: { ...allBlack, body: "red" }, picks: { ...LOCK, nonsense: "x" }, artStyle: "raised", name: "  Your Name " });
    expect(line.colors.body).toBe("red");
    expect(line.colors["hasp-flap"]).toBe("black");
    expect(line.colors.lock).toBeUndefined();
    expect(line).toMatchObject({ finish: "ams", colorMode: "palette", variant: "hasp", artStyle: "raised", name: "Your Name", picks: LOCK });
    expect(line.requests).toBeUndefined();
  });

  it("🔍 prices everything together: variant base, color markup, changes, and name length", async () => {
    const priced = await priceLine(deps(), id, "chest", { finish: "ams", selection: { ...allBlack, body: "pink" }, picks: LOCK, name: "Long Name Here" });
    // 8500 variant base + 100 one color change + 6 x 50 over 8 characters + 300 pink.
    expect(priced.unitAmount).toBe(8500 + 100 + 300 + 300);
    expect(priced.lines.map((l) => l.id)).toEqual(["base", "changes", "longName", "color:pink"]);
    expect(priced.line.quoteRequired).toBeUndefined();
  });

  it("🔍 captures every request-only choice for fulfillment", async () => {
    const { line } = await customization.resolveLine(id, { finish: "ams", selection: { ...allBlack, body: "pink" }, picks: { lock_position: "none", hardware: "metal" } });
    expect(line.requests).toEqual([{ kind: "option", id: "metal", at: "hardware" }, { kind: "color", id: "pink", at: "body" }]);
  });

  it("🔍 marks a quote-only choice as needing a quote", async () => {
    const priced = await priceLine(deps(), id, "chest", { finish: "ams", selection: allBlack, picks: { lock_position: "none", hardware: "metal" } });
    expect(priced.line.quoteRequired).toBe(true);
  });

  it("refuses bad colors, picks, finishes and art styles", async () => {
    await expect(customization.resolveLine(id, { finish: "ams", selection: { ...allBlack, body: "#141414" }, picks: LOCK })).rejects.toThrow(InvalidColorSelectionError);
    await expect(customization.resolveLine(id, { finish: "ams", selection: allBlack })).rejects.toThrow(InvalidPicksError);
    await expect(customization.resolveLine(id, { finish: "separate", selection: allBlack, picks: LOCK })).rejects.toThrow();
    await expect(customization.resolveLine(id, { finish: "ams", selection: allBlack, picks: LOCK, artStyle: "nope" })).rejects.toThrow();
  });

  it("🔍 a blank name isn't a name, so it adds no length charge", async () => {
    const { line, build } = await customization.resolveLine(id, { finish: "ams", selection: allBlack, picks: LOCK, name: "   " });
    expect(line.name).toBeUndefined();
    expect(build.nameLength).toBeUndefined();
  });

  it("adds a caller's attribute counts to a choice's", async () => {
    const { build } = await customization.resolveLine(id, { finish: "ams", selection: allBlack, picks: { lock_position: "none", hardware: "metal" }, attributeCounts: { metal: 1, other: 2 } });
    expect(build.attributeCounts).toEqual({ metal: 2, other: 2 });
  });
});

describe("toPrintOrder", () => {
  const target = { orderId: "6f1c-22ab", lineId: "line-1", product: "treasure-chest" };

  it("writes a palette finish as region to palette id, and cleans ids the format would refuse", () => {
    const order = toPrintOrder({ finish: "ams", colorMode: "palette", colors: { body: "red" }, picks: { lock_position: "none" }, variant: "none", artStyle: "flush", name: "Your Name" }, target);
    expect(order).toEqual({ schema: "print-order/1", order_id: "6f1c_22ab", line_id: "line_1", product: "treasure-chest", finish: "ams", picks: { lock_position: "none" }, art_style: "flush", name: "Your Name", colors: { body: "red" } });
  });

  it("writes one color as all", () => {
    expect(toPrintOrder({ finish: "solid", colorMode: "single", colors: { a: "red", b: "red" } }, target).colors).toEqual({ all: "red" });
  });

  it("writes a painted finish with its print color and paint", () => {
    const line = { finish: "painted", colorMode: "any" as const, colors: { a: "#abcdef", b: "red" } };
    expect(toPrintOrder(line, { ...target, printColor: "white" }).colors).toEqual({ print_color: "white", paint: { a: "#abcdef", b: "red" } });
  });

  it("🔍 refuses a painted finish with no print color, a hex in a printed finish, and a line needing a quote", () => {
    expect(() => toPrintOrder({ finish: "painted", colorMode: "any", colors: { a: "red" } }, target)).toThrow(PrintOrderError);
    expect(() => toPrintOrder({ finish: "ams", colorMode: "palette", colors: { a: "#abcdef" } }, target)).toThrow(PrintOrderError);
    expect(() => toPrintOrder({ finish: "ams", colorMode: "palette", colors: { a: "red" }, quoteRequired: true }, target)).toThrow(/quote/);
  });
});

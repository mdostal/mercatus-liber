import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryArtStyleRepository, createInMemoryFinishTierRepository, createInMemoryPaletteRepository, createInMemoryProductCustomizationRepository } from "../src/in-memory-repository.js";
import { toPrintOrder } from "../src/line.js";
import { InvalidParamsError, measuredDefaults, measuredFromPrintTools, resolveParams, validateMeasured, type MeasuredCustomization } from "../src/params.js";
import { createCustomizationService, type CustomizationService } from "../src/service.js";
import { REAL_FINISHES, REAL_PALETTE } from "./fixtures.js";

/** Shaped like a measured product's `customize` block in the print tools' color-regions.json. Values are made up. */
const PRINT_TOOLS_CUSTOMIZE = {
  params: [
    { id: "mount", label: "Where it hangs", kind: "choice", choices: [{ id: "top", label: "Top rail" }, { id: "middle", label: "Middle bar" }], default: "top", group: "Your bed" },
    { id: "rail_d", label: "Top rail, front to back", kind: "number", unit: "mm", min: 15, max: 35, step: 0.1, default: 20, help: "Calipers across the rail.", group: "Your bed", when: { mount: ["top"] } },
    { id: "bar_d", label: "Middle bar", kind: "number", unit: "mm", min: 10, max: 30, default: 18, when: { mount: ["middle"] } },
    { id: "shapes", label: "Front shapes", kind: "choice_list", choices: ["heart", "star", ""], max_items: 4, default: ["heart"] },
    { id: "col_w", label: "Column widths", kind: "number_list", min: 15, max: 120, max_items: 3, default: [50, 50] },
    { id: "lines", label: "Divider lines", kind: "lines", max_items: 2, default: [] },
    { id: "stripe_w", label: "Stripe width", kind: "number", min: 2, max: 10, default: 4, when: { finish: ["ams"] } },
  ],
  presets: [{ id: "our-bed", label: "Our bed", values: { mount: "top", rail_d: 20.74 } }],
  default_preset: "our-bed",
};

describe("measured products", () => {
  const measured: MeasuredCustomization = measuredFromPrintTools(PRINT_TOOLS_CUSTOMIZE);

  it("converts the print tools' customize block", () => {
    expect(measured.defaultPreset).toBe("our-bed");
    expect(measured.params.find((p) => p.id === "shapes")).toMatchObject({ choices: [{ id: "heart" }, { id: "star" }, { id: "" }], maxItems: 4 });
    expect(measured.params.find((p) => p.id === "mount")?.choices?.[0]).toEqual({ id: "top", label: "Top rail" });
    expect(() => validateMeasured(measured)).not.toThrow();
  });

  it("takes the default preset's values before each param's own default", () => {
    expect(measuredDefaults(measured)).toMatchObject({ mount: "top", rail_d: 20.74, bar_d: 18, col_w: [50, 50] });
  });

  it("keeps what the shopper sent, as sent, and drops params that don't apply", () => {
    const sent = { rail_d: 21, bar_d: 12, shapes: ["star", "", "heart"], col_w: [40, 60, 80], lines: [[0, 10, 100, 10]], stripe_w: 5 };
    expect(resolveParams(measured, sent, "separate")).toEqual({ rail_d: 21, shapes: ["star", "", "heart"], col_w: [40, 60, 80], lines: [[0, 10, 100, 10]] });
    expect(resolveParams(measured, { mount: "middle", rail_d: 21, bar_d: 12 }, "ams")).toEqual({ mount: "middle", bar_d: 12 });
    expect(resolveParams(measured, { stripe_w: 5 }, "ams")).toEqual({ stripe_w: 5 });
  });

  it.each([
    [{ wheels: 4 }, /Unknown param "wheels"/],
    [{ rail_d: "21" }, /rail_d must be a number/],
    [{ rail_d: 40 }, /rail_d 40 is outside 15 to 35 mm/],
    [{ mount: "floor" }, /mount must be one of "top", "middle"/],
    [{ shapes: ["heart", "moon"] }, /shapes\[1\] must be one of/],
    [{ shapes: ["heart", "heart", "heart", "heart", "heart"] }, /at most 4/],
    [{ col_w: [50, 5] }, /col_w\[1\] 5 is outside 15 to 120/],
    [{ lines: [[0, 0, 10]] }, /lines\[0\] must be \[x1, y1, x2, y2\]/],
  ])("refuses %j", (sent, message) => {
    expect(() => resolveParams(measured, sent, "solid")).toThrow(message);
  });

  it("refuses an oversized params object", () => {
    expect(() => resolveParams({ params: [{ id: "note", label: "n", kind: "choice", choices: [{ id: "x".repeat(5000) }], default: "x".repeat(5000) }] }, { note: "x".repeat(5000) }, "solid")).toThrow(/larger than/);
  });

  it("refuses a bad configuration", () => {
    expect(() => validateMeasured({ params: [{ id: "a", label: "A", kind: "number", min: 1, max: 2, default: 5 }] })).toThrow(/outside/);
    expect(() => validateMeasured({ params: [{ id: "a", label: "A", kind: "choice", default: "x" }] })).toThrow(/needs choices/);
    expect(() => validateMeasured({ ...measured, defaultPreset: "nope" })).toThrow(/Unknown default preset/);
    expect(() => validateMeasured({ params: [{ id: "a", label: "A", kind: "number", default: 1, when: { ghost: ["x"] } }] })).toThrow(/unknown param "ghost"/);
  });

  describe("through the service", () => {
    let customization: CustomizationService;
    let id: string;

    beforeEach(async () => {
      customization = createCustomizationService({
        palette: createInMemoryPaletteRepository(),
        finishTiers: createInMemoryFinishTierRepository(),
        artStyles: createInMemoryArtStyleRepository(),
        productCustomizations: createInMemoryProductCustomizationRepository(),
      });
      for (const color of REAL_PALETTE) await customization.setPaletteColor(color);
      for (const finish of REAL_FINISHES) await customization.setFinishTier(finish);
      const regions = [
        { id: "holder", label: "Holder", defaultHex: "#F4F4F2", separable: true },
        { id: "clip", label: "Clip", defaultHex: "#F4F4F2", separable: true },
      ];
      id = (await customization.createProductCustomization({ productId: "cup-holder", finishIds: ["solid", "separate"], regions, measured })).id;
    });

    it("puts the params on the line and on the print order", async () => {
      const { line } = await customization.resolveLine(id, { finish: "separate", selection: { holder: "red", clip: "white" }, params: { rail_d: 21, col_w: [40] } });
      expect(line.params).toEqual({ rail_d: 21, col_w: [40] });
      expect(toPrintOrder(line, { orderId: "A1", lineId: "1", product: "bunk-cup-holder" })).toMatchObject({
        product: "bunk-cup-holder",
        finish: "separate",
        params: { rail_d: 21, col_w: [40] },
        colors: { holder: "red", clip: "white" },
      });
    });

    it("leaves params off when the shopper takes every default", async () => {
      const { line } = await customization.resolveLine(id, { finish: "solid", selection: { __all: "white" } });
      expect(line).not.toHaveProperty("params");
    });

    it("refuses bad params, and params on a product that doesn't take them", async () => {
      await expect(customization.resolveLine(id, { finish: "solid", selection: { __all: "white" }, params: { rail_d: 99 } })).rejects.toThrow(InvalidParamsError);
      const plain = (await customization.createProductCustomization({ productId: "plain", finishIds: ["solid"], regions: [{ id: "body", label: "Body", defaultHex: "#141414", separable: true }] })).id;
      await expect(customization.resolveLine(plain, { finish: "solid", selection: { __all: "white" }, params: {} })).rejects.toThrow(/doesn't take params/);
    });

    it("refuses a product created with a bad configuration", async () => {
      await expect(customization.createProductCustomization({ productId: "bad", finishIds: ["solid"], regions: [{ id: "body", label: "Body", defaultHex: "#141414", separable: true }], measured: { params: [], defaultPreset: "x" } })).rejects.toThrow(/Unknown default preset/);
    });
  });
});

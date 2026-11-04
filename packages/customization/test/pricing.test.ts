import { describe, expect, it } from "vitest";
import { resolvePrice } from "../src/pricing.js";
import type { PricingRules } from "../src/types.js";
import { TREASURE_CHEST_PRICING_RULES } from "./fixtures.js";

describe("resolvePrice", () => {
  it("prices the base alone when no attribute counts and no colors are given", () => {
    const result = resolvePrice(TREASURE_CHEST_PRICING_RULES, { finish: "solid" });
    expect(result.total).toBe(5900);
    expect(result.lines).toEqual([{ id: "base", label: "Base price", amount: 5900 }]);
  });

  it("adds a flat attribute charge once per unit -- custom name", () => {
    const result = resolvePrice(TREASURE_CHEST_PRICING_RULES, { finish: "solid", attributeCounts: { customName: 1 } });
    expect(result.total).toBe(6300);
  });

  it("adds an attribute charge scaled by its unit count -- extra colors", () => {
    // 3 distinct colors -> 2 "extra" units at $2 each, matching the real reference's own colorDeltaPerExtra.
    const result = resolvePrice(TREASURE_CHEST_PRICING_RULES, { finish: "ams", attributeCounts: { extraColor: 2, customName: 1 } });
    expect(result.total).toBe(8300 + 400 + 400);
  });

  it("fires a contrast rule's attribute when a listed region's color doesn't match any core region's color", () => {
    const result = resolvePrice(TREASURE_CHEST_PRICING_RULES, {
      finish: "ams",
      attributeCounts: { extraColor: 2, customName: 1 },
      colors: { body: "#7A4A24", straps: "#141414" },
    });
    expect(result.total).toBe(8300 + 400 + 400 + 4500);
    expect(result.lines.some((l) => l.id === "strapsContrast")).toBe(true);
  });

  it("does NOT fire a contrast rule when the listed region matches a core region's color", () => {
    const result = resolvePrice(TREASURE_CHEST_PRICING_RULES, {
      finish: "ams",
      attributeCounts: { extraColor: 0, customName: 1 },
      colors: { body: "#7A4A24", straps: "#7A4A24" },
    });
    expect(result.lines.some((l) => l.id === "strapsContrast")).toBe(false);
    expect(result.total).toBe(8300 + 400);
  });

  it("reproduces the real reference numbers exactly: chest, 3 colors, contrast straps, custom name -- $136", () => {
    const result = resolvePrice(TREASURE_CHEST_PRICING_RULES, {
      finish: "ams",
      attributeCounts: { extraColor: 2, customName: 1 },
      colors: { body: "#7A4A24", "lid-body": "#7A4A24", straps: "#141414" },
    });
    expect(result.total).toBe(13600);
  });

  it("reproduces the real reference numbers exactly: chest, 2 colors, straps match -- $89", () => {
    const result = resolvePrice(TREASURE_CHEST_PRICING_RULES, {
      finish: "ams",
      attributeCounts: { extraColor: 1, customName: 1 },
      colors: { body: "#7A4A24", "lid-body": "#7A4A24", straps: "#7A4A24" },
    });
    expect(result.total).toBe(8900);
  });

  it("reproduces the real reference numbers exactly: chest, 3 colors, raised art -- $121", () => {
    const result = resolvePrice(TREASURE_CHEST_PRICING_RULES, {
      finish: "ams",
      attributeCounts: { extraColor: 2, customName: 1, raisedArt: 1 },
      colors: { body: "#7A4A24", "lid-body": "#7A4A24", straps: "#141414" },
    });
    expect(result.total).toBe(12100);
  });

  it("a negative-rate attribute (a discount) never pushes the total below the finish's own base price", () => {
    const rules: PricingRules = { basePriceCents: { ams: 8300 }, attributes: [{ id: "bigDiscount", label: "Big discount", perUnitCents: -50000 }] };
    const result = resolvePrice(rules, { finish: "ams", attributeCounts: { bigDiscount: 1 } });
    expect(result.total).toBe(8300);
  });

  it("a quoteOnly attribute never adds its own price line, and sets quoteRequired instead", () => {
    const rules: PricingRules = { basePriceCents: { solid: 1000 }, attributes: [{ id: "metalHardware", label: "Real metal hardware", perUnitCents: 3500, quoteOnly: true }] };
    const result = resolvePrice(rules, { finish: "solid", attributeCounts: { metalHardware: 1 } });
    expect(result.total).toBe(1000);
    expect(result.quoteRequired).toBe(true);
    expect(result.lines.some((l) => l.id === "metalHardware")).toBe(false);
  });

  it("quoteRequired is false when no quoteOnly attribute's count is non-zero", () => {
    const rules: PricingRules = { basePriceCents: { solid: 1000 }, attributes: [{ id: "metalHardware", label: "Real metal hardware", perUnitCents: 3500, quoteOnly: true }] };
    const result = resolvePrice(rules, { finish: "solid" });
    expect(result.quoteRequired).toBe(false);
  });

  it("🔍 ignores an attribute count for an id this product's own rules don't list -- 'fully customizable per product' means per-product, not global", () => {
    const rules: PricingRules = { basePriceCents: { solid: 1000 }, attributes: [] };
    const result = resolvePrice(rules, { finish: "solid", attributeCounts: { someOtherProductsAttribute: 5 } });
    expect(result.total).toBe(1000);
    expect(result.lines).toHaveLength(1);
  });

  it("prices a finish with no basePriceCents entry at 0 rather than throwing or silently defaulting to another finish", () => {
    const rules: PricingRules = { basePriceCents: { solid: 1000 }, attributes: [] };
    const result = resolvePrice(rules, { finish: "painted" });
    expect(result.total).toBe(0);
  });

  it("charges colorMarkupCents once per distinct palette color id actually used, not once per region", () => {
    const rules: PricingRules = {
      basePriceCents: { ams: 8300 },
      attributes: [],
      colorMarkupCents: { "dawn-radiance": 500 },
    };
    const result = resolvePrice(rules, { finish: "ams", colors: { body: "dawn-radiance", straps: "dawn-radiance", lock: "black" } });
    expect(result.total).toBe(8300 + 500);
    expect(result.lines.filter((l) => l.id === "color:dawn-radiance")).toHaveLength(1);
  });

  it("omits a zero-amount line entirely rather than showing a $0 line", () => {
    const rules: PricingRules = { basePriceCents: { solid: 1000 }, attributes: [{ id: "noop", label: "No-op", perUnitCents: 0 }] };
    const result = resolvePrice(rules, { finish: "solid", attributeCounts: { noop: 1 } });
    expect(result.lines).toHaveLength(1);
  });
});

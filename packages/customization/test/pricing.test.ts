import { describe, expect, it } from "vitest";
import { resolvePrice } from "../src/pricing.js";
import type { PricingRules } from "../src/types.js";
import { TREASURE_CHEST_COMPLEXITY_PRICING_RULES, TREASURE_CHEST_PRICING_RULES } from "./fixtures.js";

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

describe("resolvePrice -- excessUnitRules (complexity-based charges)", () => {
  it("charges excess print minutes beyond the free threshold -- solid finish, real reference minutes", () => {
    // estimatedMinutes.solid=837, freeUnits=180 -> 657 excess minutes * 2c = 1314c.
    const result = resolvePrice(TREASURE_CHEST_COMPLEXITY_PRICING_RULES, { finish: "solid" });
    expect(result.total).toBe(5900 + 1314);
    expect(result.lines.some((l) => l.id === "excessTime")).toBe(true);
  });

  it("charges excess print minutes beyond the free threshold -- ams finish, real reference minutes", () => {
    // estimatedMinutes.ams=3642, freeUnits=180 -> 3462 excess minutes * 2c = 6924c.
    const result = resolvePrice(TREASURE_CHEST_COMPLEXITY_PRICING_RULES, { finish: "ams" });
    expect(result.total).toBe(8300 + 6924);
  });

  it("derives colorChanges purely from build.colors -- never a caller-supplied attributeCounts key", () => {
    // 3 distinct colors used -> 2 color changes (one color is free). straps matches body
    // deliberately, so the inherited strapsContrast rule (from TREASURE_CHEST_PRICING_RULES)
    // does NOT fire -- keeps this assertion isolated to the colorChanges-derived lines.
    const result = resolvePrice(TREASURE_CHEST_COMPLEXITY_PRICING_RULES, {
      finish: "solid",
      colors: { body: "#7A4A24", straps: "#7A4A24", plate: "#1F5FD0", lock: "#F4D21F" },
    });
    // base 5900 + excessTime 1314 + colorChangeComplexity (2 * 150c = 300c) + colorChangeWaste (round(2*5)=10 * 3c = 30c).
    expect(result.total).toBe(5900 + 1314 + 300 + 30);
    expect(result.lines.some((l) => l.id === "colorChangeComplexity")).toBe(true);
    expect(result.lines.some((l) => l.id === "colorChangeWaste")).toBe(true);
    expect(result.lines.some((l) => l.id === "strapsContrast")).toBe(false);
  });

  it("charges a personalization-length excess beyond freeUnits characters", () => {
    const over = resolvePrice(TREASURE_CHEST_COMPLEXITY_PRICING_RULES, { finish: "solid", nameLength: 11 });
    // 11 - 8 free = 3 excess chars * 50c = 150c, on top of the solid base + its own excess-time charge.
    expect(over.total).toBe(5900 + 1314 + 150);
    expect(over.lines.some((l) => l.id === "longName")).toBe(true);
  });

  it("omits the personalization-length line entirely when under the free threshold", () => {
    const under = resolvePrice(TREASURE_CHEST_COMPLEXITY_PRICING_RULES, { finish: "solid", nameLength: 5 });
    expect(under.lines.some((l) => l.id === "longName")).toBe(false);
  });

  it("🔍 an ExcessUnitRule naming an attributeId this product's own attributes list doesn't define contributes nothing", () => {
    const rules: PricingRules = {
      basePriceCents: { solid: 1000 },
      attributes: [],
      excessUnitRules: [{ attributeId: "ghost", source: "nameLength", freeUnits: 0 }],
    };
    const result = resolvePrice(rules, { finish: "solid", nameLength: 5 });
    expect(result.total).toBe(1000);
    expect(result.lines).toHaveLength(1);
  });

  it("🔍 rounds the derived excess count, never truncates it", () => {
    const rules: PricingRules = {
      basePriceCents: { solid: 1000 },
      attributes: [{ id: "x", label: "X", perUnitCents: 100 }],
      excessUnitRules: [{ attributeId: "x", source: "nameLength", freeUnits: 0, unitsPerExcess: 0.5 }],
    };
    // 3 excess chars * 0.5 = 1.5 -> Math.round gives 2, not 1 (floor/truncate would).
    const result = resolvePrice(rules, { finish: "solid", nameLength: 3 });
    expect(result.total).toBe(1000 + 2 * 100);
  });

  it("🔍 a source value below freeUnits (or a missing estimatedMinutes entry for this finish) contributes exactly zero, never negative", () => {
    // TREASURE_CHEST_COMPLEXITY_PRICING_RULES.estimatedMinutes has no "finished" entry -> sourceValue is 0 -> excess is floored at 0, not negative.
    const result = resolvePrice(TREASURE_CHEST_COMPLEXITY_PRICING_RULES, { finish: "finished" });
    expect(result.lines.some((l) => l.id === "excessTime")).toBe(false);
    expect(result.total).toBe(13800);
  });
});

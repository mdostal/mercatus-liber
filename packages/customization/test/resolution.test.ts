import { describe, expect, it } from "vitest";
import {
  InvalidColorSelectionError,
  availableColorChoices,
  resolveEffectiveColor,
  resolveFinishPriceDelta,
  validateRegions,
  validateSelectedColor,
} from "../src/resolution.js";
import { MissingParentRegionError, UnknownParentRegionError, type ColorRegion, type ProductCustomization } from "../src/types.js";
import { REAL_PALETTE, STOVETOP_GLOW_CUSTOMIZATION, STOVETOP_GLOW_REGIONS, TREASURE_CHEST_REGIONS, findFinish } from "./fixtures.js";

describe("validateRegions", () => {
  it("accepts treasure-chest's real all-separable region list", () => {
    expect(() => validateRegions(TREASURE_CHEST_REGIONS)).not.toThrow();
  });

  it("accepts stovetop-glow's real mixed region list (non-separable regions each name a real parent)", () => {
    expect(() => validateRegions(STOVETOP_GLOW_REGIONS)).not.toThrow();
  });

  it("throws MissingParentRegionError when a non-separable region names no parentRegionId", () => {
    const regions: ColorRegion[] = [{ id: "lid-art", label: "Lid art", defaultHex: "#fff", separable: false }];
    expect(() => validateRegions(regions)).toThrow(MissingParentRegionError);
  });

  it("throws UnknownParentRegionError when parentRegionId doesn't resolve to a region on the same list", () => {
    const regions: ColorRegion[] = [{ id: "lid-art", label: "Lid art", defaultHex: "#fff", separable: false, parentRegionId: "lid" }];
    expect(() => validateRegions(regions)).toThrow(UnknownParentRegionError);
  });
});

describe("resolveEffectiveColor", () => {
  it("ColorMode 'single': every region shares selection.__all, regardless of the region itself", () => {
    const finish = findFinish("solid");
    const selection = { __all: "#7A4A24" };
    for (const region of TREASURE_CHEST_REGIONS) {
      expect(resolveEffectiveColor(TREASURE_CHEST_REGIONS, finish, selection, region.id)).toBe("#7A4A24");
    }
  });

  it("ColorMode 'single': throws when selection.__all is missing", () => {
    const finish = findFinish("solid");
    expect(() => resolveEffectiveColor(TREASURE_CHEST_REGIONS, finish, {}, "body")).toThrow(/selection\.__all/);
  });

  it("every region picks its own color under 'ams' (producesSeparateParts: false), even non-separable ones -- the reference's own rule: only separate/finished force the parent fallback", () => {
    const finish = findFinish("ams");
    const selection = { body: "#141414", glass: "#141414", diffusers: "#F4F4F2", knobs: "#141414", "knob-pointers": "#F4F4F2" };
    expect(resolveEffectiveColor(STOVETOP_GLOW_REGIONS, finish, selection, "diffusers")).toBe("#F4F4F2");
    expect(resolveEffectiveColor(STOVETOP_GLOW_REGIONS, finish, selection, "knob-pointers")).toBe("#F4F4F2");
  });

  it("a non-separable region follows its parent's effective color under 'separate' (producesSeparateParts: true)", () => {
    const finish = findFinish("separate");
    const selection = { body: "#141414", glass: "#1F5FD0", knobs: "#C12E1F" };
    expect(resolveEffectiveColor(STOVETOP_GLOW_REGIONS, finish, selection, "diffusers")).toBe("#1F5FD0");
    expect(resolveEffectiveColor(STOVETOP_GLOW_REGIONS, finish, selection, "knob-pointers")).toBe("#C12E1F");
  });

  it("🔍 a separable region keeps its own color under 'separate' even when siblings are locked", () => {
    const finish = findFinish("separate");
    const selection = { body: "#00AE42", glass: "#1F5FD0", knobs: "#C12E1F" };
    expect(resolveEffectiveColor(STOVETOP_GLOW_REGIONS, finish, selection, "body")).toBe("#00AE42");
  });

  it("throws on an unknown region id", () => {
    const finish = findFinish("ams");
    expect(() => resolveEffectiveColor(TREASURE_CHEST_REGIONS, finish, {}, "nope")).toThrow(/Unknown region/);
  });
});

describe("availableColorChoices", () => {
  it("ColorMode 'single': __all is unlocked, every other id is locked", () => {
    const finish = findFinish("solid");
    expect(availableColorChoices(REAL_PALETTE, TREASURE_CHEST_REGIONS, finish, "__all").locked).toBe(false);
    expect(availableColorChoices(REAL_PALETTE, TREASURE_CHEST_REGIONS, finish, "body").locked).toBe(true);
  });

  it("restricts 'diffusers' to only its allowedColorIds (white), in every finish, even 'any'", () => {
    const palatte = findFinish("painted");
    const choices = availableColorChoices(REAL_PALETTE, STOVETOP_GLOW_REGIONS, palatte, "diffusers");
    expect(choices.palette.map((p) => p.id)).toEqual(["white"]);
    expect(choices.freeColor).toBe(false);
  });

  it("'knob-pointers' (non-separable, no restriction) is locked under 'finished' and offers the full palette when not locked", () => {
    const finished = availableColorChoices(REAL_PALETTE, STOVETOP_GLOW_REGIONS, findFinish("finished"), "knob-pointers");
    expect(finished.locked).toBe(true);

    const ams = availableColorChoices(REAL_PALETTE, STOVETOP_GLOW_REGIONS, findFinish("ams"), "knob-pointers");
    expect(ams.locked).toBe(false);
    expect(ams.palette).toHaveLength(REAL_PALETTE.length);
  });

  it("freeColor is true only for ColorMode 'any' AND no allowedColorIds restriction", () => {
    const body = availableColorChoices(REAL_PALETTE, STOVETOP_GLOW_REGIONS, findFinish("painted"), "body");
    expect(body.freeColor).toBe(true);

    const diffusers = availableColorChoices(REAL_PALETTE, STOVETOP_GLOW_REGIONS, findFinish("painted"), "diffusers");
    expect(diffusers.freeColor).toBe(false);

    const ams = availableColorChoices(REAL_PALETTE, STOVETOP_GLOW_REGIONS, findFinish("ams"), "body");
    expect(ams.freeColor).toBe(false);
  });
});

describe("validateSelectedColor", () => {
  it("passes a hex that matches an active palette entry", () => {
    const choices = availableColorChoices(REAL_PALETTE, TREASURE_CHEST_REGIONS, findFinish("ams"), "body");
    expect(() => validateSelectedColor(choices, "body", "#C12E1F")).not.toThrow();
  });

  it("is case-insensitive on hex comparison", () => {
    const choices = availableColorChoices(REAL_PALETTE, TREASURE_CHEST_REGIONS, findFinish("ams"), "body");
    expect(() => validateSelectedColor(choices, "body", "#c12e1f")).not.toThrow();
  });

  it("throws InvalidColorSelectionError('discontinued') for a discontinued palette color, never silently accepted", () => {
    const palette = REAL_PALETTE.map((c) => (c.id === "red" ? { ...c, status: "discontinued" as const } : c));
    const choices = availableColorChoices(palette, TREASURE_CHEST_REGIONS, findFinish("ams"), "body");
    expect(() => validateSelectedColor(choices, "body", "#C12E1F")).toThrow(InvalidColorSelectionError);
  });

  it("allows a 'request'-status palette color through -- explicitly selectable on request", () => {
    const palette = REAL_PALETTE.map((c) => (c.id === "red" ? { ...c, status: "request" as const } : c));
    const choices = availableColorChoices(palette, TREASURE_CHEST_REGIONS, findFinish("ams"), "body");
    expect(() => validateSelectedColor(choices, "body", "#C12E1F")).not.toThrow();
  });

  it("throws InvalidColorSelectionError('not-offered') for a hex outside the palette when freeColor is false", () => {
    const choices = availableColorChoices(REAL_PALETTE, TREASURE_CHEST_REGIONS, findFinish("ams"), "body");
    expect(() => validateSelectedColor(choices, "body", "#ABCDEF")).toThrow(InvalidColorSelectionError);
  });

  it("allows an arbitrary hex outside the palette when freeColor is true", () => {
    const choices = availableColorChoices(REAL_PALETTE, TREASURE_CHEST_REGIONS, findFinish("painted"), "body");
    expect(() => validateSelectedColor(choices, "body", "#ABCDEF")).not.toThrow();
  });

  it("🔍 a restricted region (diffusers) still rejects an arbitrary hex under 'any' because its own allowedColorIds beats the finish's freeColor", () => {
    const choices = availableColorChoices(REAL_PALETTE, STOVETOP_GLOW_REGIONS, findFinish("painted"), "diffusers");
    expect(() => validateSelectedColor(choices, "diffusers", "#ABCDEF")).toThrow(InvalidColorSelectionError);
  });
});

describe("resolveFinishPriceDelta", () => {
  const baseCustomization: ProductCustomization = { id: "c1", productId: "p1", finishIds: ["painted"], regions: [] };

  it("returns undefined when neither the product nor the finish names a delta", () => {
    expect(resolveFinishPriceDelta(findFinish("painted"), baseCustomization)).toBeUndefined();
  });

  it("returns the finish's own global priceDelta when the product has no override", () => {
    const finish = { ...findFinish("painted"), priceDelta: { amount: 1500, currency: "USD" } };
    expect(resolveFinishPriceDelta(finish, baseCustomization)).toEqual({ amount: 1500, currency: "USD" });
  });

  it("a product-specific finishPriceDeltas override wins over the finish's global default", () => {
    const finish = { ...findFinish("painted"), priceDelta: { amount: 1500, currency: "USD" } };
    const customization = { ...baseCustomization, finishPriceDeltas: { painted: { amount: 4000, currency: "USD" } } };
    expect(resolveFinishPriceDelta(finish, customization)).toEqual({ amount: 4000, currency: "USD" });
  });

  it("an override for a DIFFERENT finish id doesn't leak into this finish's resolved delta", () => {
    const finish = { ...findFinish("painted"), priceDelta: { amount: 1500, currency: "USD" } };
    const customization = { ...baseCustomization, finishPriceDeltas: { finished: { amount: 900, currency: "USD" } } };
    expect(resolveFinishPriceDelta(finish, customization)).toEqual({ amount: 1500, currency: "USD" });
  });
});

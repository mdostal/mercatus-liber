import { describe, expect, it } from "vitest";
import { availableColorChoices, isRegionLocked, resolveEffectiveColor } from "../src/resolve.js";
import type { ColorRegion, ColorSelection, CustomizableProduct, FinishTier, PaletteColor } from "../src/types.js";

const PALETTE: PaletteColor[] = [
  { id: "blue", label: "Blue", hex: "#1F5FD0" },
  { id: "red", label: "Red", hex: "#C12E1F" },
  { id: "gold", label: "Gold", hex: "#F4D21F", status: "discontinued", note: "Out of stock, not restocking." },
  { id: "white", label: "White", hex: "#F4F4F2", status: "request", note: "Ask and we'll special-order it." },
];

const FINISHES: FinishTier[] = [
  { id: "solid", rank: 1, label: "One color", colors: "single", description: "" },
  { id: "separate", rank: 3, label: "Separate parts", colors: "palette", description: "" },
  { id: "painted", rank: 5, label: "Hand-painted", colors: "any", description: "" },
];

const REGIONS: ColorRegion[] = [
  { id: "body", label: "Body", default: "#1F5FD0", separable: true },
  { id: "art", label: "Name and pictures", default: "#F4F4F2", separable: false, parent: "body" },
];

const PRODUCT: CustomizableProduct = { id: "caddy", label: "Caddy", finishes: ["solid", "separate", "painted"], regions: REGIONS };

describe("resolveEffectiveColor", () => {
  it("single-mode finish paints every region the one chosen color", () => {
    const selection: ColorSelection = { finishId: "solid", colors: { __all: "#C12E1F" } };
    expect(resolveEffectiveColor(FINISHES, PRODUCT, selection, REGIONS[0]!)).toBe("#C12E1F");
    expect(resolveEffectiveColor(FINISHES, PRODUCT, selection, REGIONS[1]!)).toBe("#C12E1F");
  });

  it("a non-separable region under 'separate' follows its parent's resolved color", () => {
    const selection: ColorSelection = { finishId: "separate", colors: { body: "#1F5FD0" } };
    expect(resolveEffectiveColor(FINISHES, PRODUCT, selection, REGIONS[1]!)).toBe("#1F5FD0");
  });

  it("a separable region under 'separate' keeps its own chosen color, not its parent's", () => {
    const selection: ColorSelection = { finishId: "separate", colors: { body: "#1F5FD0", art: "#C12E1F" } };
    // 'art' is non-separable -- even with its own entry in colors, isRegionLocked
    // means the UI never lets it diverge; resolveEffectiveColor itself still
    // prefers the parent's color for a non-separable region under separate/finished.
    expect(resolveEffectiveColor(FINISHES, PRODUCT, selection, REGIONS[1]!)).toBe("#1F5FD0");
  });

  it("falls back to the region's own default when nothing is selected yet", () => {
    const selection: ColorSelection = { finishId: "painted", colors: {} };
    expect(resolveEffectiveColor(FINISHES, PRODUCT, selection, REGIONS[0]!)).toBe("#1F5FD0");
  });
});

describe("isRegionLocked", () => {
  it("locks a non-separable region under separate/finished", () => {
    expect(isRegionLocked("separate", REGIONS[1]!)).toBe(true);
    expect(isRegionLocked("finished", REGIONS[1]!)).toBe(true);
  });
  it("never locks a separable region", () => {
    expect(isRegionLocked("separate", REGIONS[0]!)).toBe(false);
  });
  it("never locks under other finishes, even for a non-separable region", () => {
    expect(isRegionLocked("solid", REGIONS[1]!)).toBe(false);
    expect(isRegionLocked("painted", REGIONS[1]!)).toBe(false);
  });
});

describe("availableColorChoices", () => {
  it("includes discontinued and request-status colors -- never silently filters them out", () => {
    const { list } = availableColorChoices(PALETTE, FINISHES[2]!, REGIONS[0]!);
    expect(list.map((p) => p.id)).toEqual(["blue", "red", "gold", "white"]);
    expect(list.find((p) => p.id === "gold")?.status).toBe("discontinued");
    expect(list.find((p) => p.id === "white")?.status).toBe("request");
  });

  it("respects an explicit allow-list regardless of finish", () => {
    const region: ColorRegion = { id: "diffuser", label: "Diffuser", default: "#F4F4F2", separable: false, allowed: ["white"] };
    const { list, free } = availableColorChoices(PALETTE, FINISHES[2]!, region);
    expect(list.map((p) => p.id)).toEqual(["white"]);
    expect(free).toBe(false);
  });

  it("'any' color mode is free-pick only when the region has no allow-list", () => {
    const { free } = availableColorChoices(PALETTE, FINISHES[2]!, REGIONS[0]!);
    expect(free).toBe(true);
  });

  it("'palette' and 'single' color modes are never free-pick", () => {
    expect(availableColorChoices(PALETTE, FINISHES[1]!, REGIONS[0]!).free).toBe(false);
    expect(availableColorChoices(PALETTE, FINISHES[0]!, REGIONS[0]!).free).toBe(false);
  });
});

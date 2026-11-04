import { describe, expect, it } from "vitest";
import { InvalidColorSelectionError, availableColorChoices, resolveColorCount, resolveEffectiveColor, validateRegions, validateSelectedColor } from "../src/resolution.js";
import { MissingParentRegionError, UnknownParentRegionError, type ColorRegion } from "../src/types.js";
import { REAL_PALETTE, STOVETOP_GLOW_REGIONS, TREASURE_CHEST_REGIONS, findFinish } from "./fixtures.js";

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
    const selection = { body: "#141414", glass: "#141414", coils: "#F4F4F2", knobs: "#141414", "knob-pointers": "#F4F4F2" };
    expect(resolveEffectiveColor(STOVETOP_GLOW_REGIONS, finish, selection, "coils")).toBe("#F4F4F2");
    expect(resolveEffectiveColor(STOVETOP_GLOW_REGIONS, finish, selection, "knob-pointers")).toBe("#F4F4F2");
  });

  it("a non-separable region follows its parent's effective color under 'separate' (producesSeparateParts: true)", () => {
    const finish = findFinish("separate");
    const selection = { body: "#141414", glass: "#1F5FD0", knobs: "#C12E1F" };
    expect(resolveEffectiveColor(STOVETOP_GLOW_REGIONS, finish, selection, "coils")).toBe("#1F5FD0");
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

  it("restricts 'coils' to only its allowedColorIds (white), in every finish, even 'any'", () => {
    const palatte = findFinish("painted");
    const choices = availableColorChoices(REAL_PALETTE, STOVETOP_GLOW_REGIONS, palatte, "coils");
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

    const coils = availableColorChoices(REAL_PALETTE, STOVETOP_GLOW_REGIONS, findFinish("painted"), "coils");
    expect(coils.freeColor).toBe(false);

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

  it("🔍 a restricted region (coils) still rejects an arbitrary hex under 'any' because its own allowedColorIds beats the finish's freeColor", () => {
    const choices = availableColorChoices(REAL_PALETTE, STOVETOP_GLOW_REGIONS, findFinish("painted"), "coils");
    expect(() => validateSelectedColor(choices, "coils", "#ABCDEF")).toThrow(InvalidColorSelectionError);
  });
});

describe("resolveColorCount", () => {
  it("ColorMode 'single' always resolves to exactly 1, regardless of region count", () => {
    expect(resolveColorCount(REAL_PALETTE, TREASURE_CHEST_REGIONS, findFinish("solid"), { __all: "#7A4A24" })).toBe(1);
  });

  it("counts 1 when every region ends up the same color under 'separate'", () => {
    const selection = { body: "#141414", straps: "#141414", plate: "#141414", lock: "#141414" };
    expect(resolveColorCount(REAL_PALETTE, TREASURE_CHEST_REGIONS, findFinish("separate"), selection)).toBe(1);
  });

  it("counts each distinct color once, collapsing a parent-follows region into its parent's color rather than double-counting", () => {
    // Under "separate": name/plate-border inherit "plate"'s color -- 3 distinct
    // colors chosen (body, straps, plate), not 4, even though plate's color
    // is also what name and plate-border resolve to.
    const selection = { body: "#C12E1F", straps: "#00AE42", plate: "#1F5FD0", lock: "#1F5FD0" };
    expect(resolveColorCount(REAL_PALETTE, TREASURE_CHEST_REGIONS, findFinish("separate"), selection)).toBe(3);
  });

  it("dedups by palette id, not literal selection string casing", () => {
    const selection = { body: "#c12e1f", straps: "#C12E1F", plate: "#1F5FD0", lock: "#1F5FD0" };
    expect(resolveColorCount(REAL_PALETTE, TREASURE_CHEST_REGIONS, findFinish("separate"), selection)).toBe(2);
  });

  it("🔍 a free-picked hex not in the palette still dedups correctly by its own raw value when reused across regions", () => {
    // Under "painted" (producesSeparateParts: false) every region takes its own selection entry, including non-separable ones.
    const selection = { body: "#ABCDEF", straps: "#ABCDEF", name: "#1F5FD0", "plate-border": "#1F5FD0", plate: "#1F5FD0", lock: "#1F5FD0" };
    expect(resolveColorCount(REAL_PALETTE, TREASURE_CHEST_REGIONS, findFinish("painted"), selection)).toBe(2);
  });
});

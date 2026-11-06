import { describe, expect, it } from "vitest";
import { InvalidColorSelectionError, availableColorChoices, canonicalColor, defaultSelection, resolveColorCount, resolveColorHex, resolveEffectiveColor, validateRegions, validateSelectedColor } from "../src/resolution.js";
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
    const selection = { __all: "brown" };
    for (const region of TREASURE_CHEST_REGIONS) {
      expect(resolveEffectiveColor(TREASURE_CHEST_REGIONS, finish, selection, region.id)).toBe("brown");
    }
  });

  it("ColorMode 'single': throws when selection.__all is missing", () => {
    const finish = findFinish("solid");
    expect(() => resolveEffectiveColor(TREASURE_CHEST_REGIONS, finish, {}, "body")).toThrow(/selection\.__all/);
  });

  it("every region picks its own color under 'ams' (producesSeparateParts: false), even non-separable ones -- the reference's own rule: only separate/finished force the parent fallback", () => {
    const finish = findFinish("ams");
    const selection = { body: "black", glass: "black", coils: "white", knobs: "black", "knob-pointers": "white" };
    expect(resolveEffectiveColor(STOVETOP_GLOW_REGIONS, finish, selection, "coils")).toBe("white");
    expect(resolveEffectiveColor(STOVETOP_GLOW_REGIONS, finish, selection, "knob-pointers")).toBe("white");
  });

  it("a non-separable region follows its parent's effective color under 'separate' (producesSeparateParts: true)", () => {
    const finish = findFinish("separate");
    const selection = { body: "black", glass: "blue", knobs: "red" };
    expect(resolveEffectiveColor(STOVETOP_GLOW_REGIONS, finish, selection, "coils")).toBe("blue");
    expect(resolveEffectiveColor(STOVETOP_GLOW_REGIONS, finish, selection, "knob-pointers")).toBe("red");
  });

  it("🔍 a separable region keeps its own color under 'separate' even when siblings are locked", () => {
    const finish = findFinish("separate");
    const selection = { body: "green", glass: "blue", knobs: "red" };
    expect(resolveEffectiveColor(STOVETOP_GLOW_REGIONS, finish, selection, "body")).toBe("green");
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
  it("passes the id of an active palette entry", () => {
    const choices = availableColorChoices(REAL_PALETTE, TREASURE_CHEST_REGIONS, findFinish("ams"), "body");
    expect(() => validateSelectedColor(choices, "body", "red")).not.toThrow();
  });

  it("🔍 rejects a hex in a palette-only region, even one matching a palette entry", () => {
    const choices = availableColorChoices(REAL_PALETTE, TREASURE_CHEST_REGIONS, findFinish("ams"), "body");
    expect(() => validateSelectedColor(choices, "body", "#C12E1F")).toThrow(InvalidColorSelectionError);
  });

  it("rejects a palette id this region doesn't offer", () => {
    const choices = availableColorChoices(REAL_PALETTE, TREASURE_CHEST_REGIONS, findFinish("ams"), "body");
    expect(() => validateSelectedColor(choices, "body", "no-such-color")).toThrow(InvalidColorSelectionError);
  });

  it("🔍 rejects a malformed free color", () => {
    const choices = availableColorChoices(REAL_PALETTE, TREASURE_CHEST_REGIONS, findFinish("painted"), "body");
    for (const bad of ["#FFF", "#GGGGGG", "#12345678", "#"]) {
      expect(() => validateSelectedColor(choices, "body", bad)).toThrow(InvalidColorSelectionError);
    }
  });

  it("🔍 rejects a free hex that resolves to a discontinued palette color", () => {
    const palette = REAL_PALETTE.map((c) => (c.id === "red" ? { ...c, status: "discontinued" as const } : c));
    const choices = availableColorChoices(palette, TREASURE_CHEST_REGIONS, findFinish("painted"), "body");
    expect(() => validateSelectedColor(choices, "body", "#c12e1f")).toThrow(InvalidColorSelectionError);
  });

  it("throws InvalidColorSelectionError('discontinued') for a discontinued palette color, never silently accepted", () => {
    const palette = REAL_PALETTE.map((c) => (c.id === "red" ? { ...c, status: "discontinued" as const } : c));
    const choices = availableColorChoices(palette, TREASURE_CHEST_REGIONS, findFinish("ams"), "body");
    expect(() => validateSelectedColor(choices, "body", "red")).toThrow(InvalidColorSelectionError);
  });

  it("allows a 'request'-status palette color through -- explicitly selectable on request", () => {
    const palette = REAL_PALETTE.map((c) => (c.id === "red" ? { ...c, status: "request" as const } : c));
    const choices = availableColorChoices(palette, TREASURE_CHEST_REGIONS, findFinish("ams"), "body");
    expect(() => validateSelectedColor(choices, "body", "red")).not.toThrow();
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
  it("🔍 counts two palette entries sharing a hex as two colors", () => {
    const palette = [...REAL_PALETTE, { id: "dawn", label: "Dawn silk", hex: "#141414", kind: "multi" as const }];
    const regions: ColorRegion[] = [
      { id: "a", label: "A", defaultHex: "#141414", separable: true },
      { id: "b", label: "B", defaultHex: "#141414", separable: true },
    ];
    expect(resolveColorCount(palette, regions, findFinish("ams"), { a: "black", b: "dawn" })).toBe(2);
  });

  it("🔍 counts a free hex and the palette id it matches as one color", () => {
    const regions: ColorRegion[] = [
      { id: "a", label: "A", defaultHex: "#141414", separable: true },
      { id: "b", label: "B", defaultHex: "#141414", separable: true },
    ];
    expect(resolveColorCount(REAL_PALETTE, regions, findFinish("painted"), { a: "black", b: "#141414" })).toBe(1);
  });

  it("ColorMode 'single' always resolves to exactly 1, regardless of region count", () => {
    expect(resolveColorCount(REAL_PALETTE, TREASURE_CHEST_REGIONS, findFinish("solid"), { __all: "brown" })).toBe(1);
  });

  it("counts 1 when every region ends up the same color under 'separate'", () => {
    const selection = { body: "black", straps: "black", plate: "black", lock: "black" };
    expect(resolveColorCount(REAL_PALETTE, TREASURE_CHEST_REGIONS, findFinish("separate"), selection)).toBe(1);
  });

  it("counts each distinct color once, collapsing a parent-follows region into its parent's color rather than double-counting", () => {
    // Under "separate": name/plate-border inherit "plate"'s color -- 3 distinct
    // colors chosen (body, straps, plate), not 4, even though plate's color
    // is also what name and plate-border resolve to.
    const selection = { body: "red", straps: "green", plate: "blue", lock: "blue" };
    expect(resolveColorCount(REAL_PALETTE, TREASURE_CHEST_REGIONS, findFinish("separate"), selection)).toBe(3);
  });

  it("dedups by palette id, not literal selection string casing", () => {
    const selection = { body: "#c12e1f", straps: "red", plate: "blue", lock: "blue" };
    expect(resolveColorCount(REAL_PALETTE, TREASURE_CHEST_REGIONS, findFinish("separate"), selection)).toBe(2);
  });

  it("🔍 a free-picked hex not in the palette still dedups correctly by its own raw value when reused across regions", () => {
    // Under "painted" (producesSeparateParts: false) every region takes its own selection entry, including non-separable ones.
    const selection = { body: "#ABCDEF", straps: "#ABCDEF", name: "blue", "plate-border": "blue", plate: "blue", lock: "blue" };
    expect(resolveColorCount(REAL_PALETTE, TREASURE_CHEST_REGIONS, findFinish("painted"), selection)).toBe(2);
  });
});

describe("canonicalColor", () => {
  const SHARED_HEX = [...REAL_PALETTE, { id: "dawn", label: "Dawn silk", hex: "#141414", kind: "multi" as const }];

  it("leaves a palette id alone", () => {
    expect(canonicalColor(REAL_PALETTE, "black")).toBe("black");
  });

  it("turns a hex matching one solid entry into that id, ignoring case", () => {
    expect(canonicalColor(REAL_PALETTE, "#c12e1f")).toBe("red");
  });

  it("lowercases a hex outside the palette", () => {
    expect(canonicalColor(REAL_PALETTE, "#ABCDEF")).toBe("#abcdef");
  });

  it("🔍 never matches a multi-color entry by its representative hex", () => {
    expect(canonicalColor([{ id: "dawn", label: "Dawn silk", hex: "#C98FB0", kind: "multi" }], "#C98FB0")).toBe("#c98fb0");
    expect(canonicalColor(SHARED_HEX, "#141414")).toBe("black");
  });

  it("🔍 keeps a hex shared by two solid entries as a hex rather than guessing", () => {
    const palette = [...REAL_PALETTE, { id: "charcoal", label: "Charcoal", hex: "#141414" }];
    expect(canonicalColor(palette, "#141414")).toBe("#141414");
  });
});

describe("resolveColorHex", () => {
  it("returns a palette entry's hex, including a multi-color entry's representative hex", () => {
    expect(resolveColorHex(REAL_PALETTE, "red")).toBe("#C12E1F");
    expect(resolveColorHex([{ id: "dawn", label: "Dawn silk", hex: "#C98FB0", kind: "multi" }], "dawn")).toBe("#C98FB0");
  });

  it("returns a free color lowercased, and throws on an unknown id", () => {
    expect(resolveColorHex(REAL_PALETTE, "#ABCDEF")).toBe("#abcdef");
    expect(() => resolveColorHex(REAL_PALETTE, "no-such-color")).toThrow(/no-such-color/);
  });
});

describe("defaultSelection", () => {
  it("holds only __all under ColorMode 'single'", () => {
    const selection = defaultSelection(REAL_PALETTE, TREASURE_CHEST_REGIONS, findFinish("solid"));
    expect(Object.keys(selection)).toEqual(["__all"]);
    expect(REAL_PALETTE.some((c) => c.id === selection.__all)).toBe(true);
  });

  it("skips locked regions and produces a selection the validator accepts", () => {
    const finish = findFinish("separate");
    const selection = defaultSelection(REAL_PALETTE, STOVETOP_GLOW_REGIONS, finish);
    expect(selection.coils).toBeUndefined();
    for (const [regionId, value] of Object.entries(selection)) {
      expect(() => validateSelectedColor(availableColorChoices(REAL_PALETTE, STOVETOP_GLOW_REGIONS, finish, regionId), regionId, value)).not.toThrow();
    }
  });

  it("🔍 falls back to the first active color when a default is discontinued, request-only, or outside the palette", () => {
    const finish = findFinish("ams");
    const region = (defaultHex: string): ColorRegion[] => [{ id: "body", label: "Body", defaultHex, separable: true }];
    const gone = REAL_PALETTE.map((c) => (c.id === "red" ? { ...c, status: "discontinued" as const } : c));
    expect(defaultSelection(gone, region("#C12E1F"), finish).body).toBe("black");
    expect(defaultSelection(REAL_PALETTE, region("#F55A74"), finish).body).toBe("black");
    expect(defaultSelection(REAL_PALETTE, region("#ABCDEF"), finish).body).toBe("black");
  });

  it("keeps an out-of-palette default where a free color is offered", () => {
    const regions: ColorRegion[] = [{ id: "body", label: "Body", defaultHex: "#ABCDEF", separable: true }];
    expect(defaultSelection(REAL_PALETTE, regions, findFinish("painted")).body).toBe("#abcdef");
  });
});

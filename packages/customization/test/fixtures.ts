import type { ColorRegion, FinishTier, PaletteColor, ProductCustomization } from "../src/types.js";

/**
 * Ported directly from dostal-3d-printing/shop-assets/color/color-regions.json
 * (v2) -- the real palette, finish tiers and two real products' regions
 * (treasure-chest: all-separable, no restrictions; stovetop-glow:
 * mixes separable/non-separable regions and an allowedColorIds
 * restriction on "diffusers"). Not invented -- see that file's own
 * `palette`/`finishes`/`products` for the source values.
 */
export const REAL_PALETTE: PaletteColor[] = [
  { id: "black", label: "Black", hex: "#141414" },
  { id: "white", label: "White", hex: "#F4F4F2" },
  { id: "red", label: "Red", hex: "#C12E1F" },
  { id: "yellow", label: "Yellow", hex: "#F4D21F" },
  { id: "green", label: "Green", hex: "#00AE42" },
  { id: "blue", label: "Blue", hex: "#1F5FD0" },
  { id: "brown", label: "Brown", hex: "#7A4A24" },
];

export const REAL_FINISHES: FinishTier[] = [
  { id: "solid", rank: 1, label: "One color", colors: "single", description: "The whole piece printed in one filament color.", producesSeparateParts: false },
  { id: "ams", rank: 2, label: "Multicolor print", colors: "palette", description: "Printed in full color in one go on a multi-color printer.", producesSeparateParts: false },
  { id: "separate", rank: 3, label: "Separate color parts", colors: "palette", description: "Each color printed as its own part and assembled.", producesSeparateParts: true },
  { id: "finished", rank: 4, label: "Finished", colors: "palette", description: "Separate color parts, sanded, glued and touched up by hand.", producesSeparateParts: true },
  { id: "painted", rank: 5, label: "Hand-painted", colors: "any", description: "Painted by hand after printing, in any colors you like.", producesSeparateParts: false },
];

export function findFinish(id: string): FinishTier {
  const finish = REAL_FINISHES.find((f) => f.id === id);
  if (!finish) throw new Error(`fixture bug: no finish "${id}"`);
  return finish;
}

/** treasure-chest's real regions -- every region separable, no restrictions. */
export const TREASURE_CHEST_REGIONS: ColorRegion[] = [
  { id: "body", label: "Chest", defaultHex: "#7A4A24", separable: true },
  { id: "straps", label: "Straps and name", defaultHex: "#141414", separable: true },
  { id: "plate", label: "Name plate and lock", defaultHex: "#F4D21F", separable: true },
];

export const TREASURE_CHEST_CUSTOMIZATION: ProductCustomization = {
  id: "cust-treasure-chest",
  productId: "treasure-chest",
  finishIds: ["solid", "ams", "separate", "finished", "painted"],
  regions: TREASURE_CHEST_REGIONS,
};

/**
 * stovetop-glow's real regions -- "diffusers" is non-separable (follows
 * "glass"), restricted to white only (allowedColorIds); "knob-pointers" is
 * non-separable (follows "knobs") with no restriction.
 */
export const STOVETOP_GLOW_REGIONS: ColorRegion[] = [
  { id: "body", label: "Body", defaultHex: "#F4F4F2", separable: true },
  { id: "glass", label: "Cooktop", defaultHex: "#141414", separable: true },
  { id: "diffusers", label: "Glowing coils", defaultHex: "#F4F4F2", separable: false, parentRegionId: "glass", allowedColorIds: ["white"], why: "The LEDs shine through these, so they stay white." },
  { id: "knobs", label: "Knobs", defaultHex: "#141414", separable: true },
  { id: "knob-pointers", label: "Knob pointers", defaultHex: "#F4F4F2", separable: false, parentRegionId: "knobs" },
];

export const STOVETOP_GLOW_CUSTOMIZATION: ProductCustomization = {
  id: "cust-stovetop-glow",
  productId: "stovetop-glow",
  finishIds: ["ams", "separate", "finished", "painted"],
  regions: STOVETOP_GLOW_REGIONS,
  why: "No one-color option: the coil diffusers must be white for the LEDs to shine through.",
};

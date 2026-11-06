import type { ArtStyle, ColorRegion, FinishTier, PaletteColor, PricingRules, ProductCustomization } from "../src/types.js";

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
  { id: "pink", label: "Pink", hex: "#F55A74", status: "request", note: "Arriving this week" },
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

/** Ported from the real reference manifest's own top-level `art_styles`. */
export const REAL_ART_STYLES: ArtStyle[] = [
  { id: "flush", label: "Flush inlay", description: "Names and pictures are set level into the surface, printed in place." },
  { id: "raised", label: "Raised", description: "Names and pictures stand up off the surface. Fewer filament swaps, so it prints faster and costs less." },
];

export function findArtStyle(id: string): ArtStyle {
  const style = REAL_ART_STYLES.find((s) => s.id === id);
  if (!style) throw new Error(`fixture bug: no art style "${id}"`);
  return style;
}

/**
 * treasure-chest's real regions, as re-split by the 3D-printing side on
 * 2026-11-04 ("break apart the chest so the straps and name are
 * separate; the name plate and lock as well"): body/straps/plate/lock
 * are each their own separable part; name and plate-border are non-
 * separable, both parented to "plate".
 */
export const TREASURE_CHEST_REGIONS: ColorRegion[] = [
  { id: "body", label: "Chest", defaultHex: "#7A4A24", separable: true },
  { id: "straps", label: "Straps", defaultHex: "#141414", separable: true },
  { id: "name", label: "Name", defaultHex: "#141414", separable: false, parentRegionId: "plate" },
  { id: "plate-border", label: "Name plate border", defaultHex: "#141414", separable: false, parentRegionId: "plate" },
  { id: "plate", label: "Name plate", defaultHex: "#F4D21F", separable: true },
  { id: "lock", label: "Lock", defaultHex: "#F4D21F", separable: true },
];

export const TREASURE_CHEST_CUSTOMIZATION: ProductCustomization = {
  id: "cust-treasure-chest",
  productId: "treasure-chest",
  finishIds: ["solid", "ams", "separate", "finished", "painted"],
  regions: TREASURE_CHEST_REGIONS,
  artStyleIds: ["flush", "raised"],
};

/**
 * stovetop-glow's real regions -- "coils" is non-separable (follows
 * "glass"), restricted to white only (allowedColorIds); "rings" is
 * non-separable (follows "glass") with no restriction; "knob-pointers"
 * is non-separable (follows "knobs") with no restriction.
 */
export const STOVETOP_GLOW_REGIONS: ColorRegion[] = [
  { id: "body", label: "Body", defaultHex: "#F4F4F2", separable: true },
  { id: "glass", label: "Cooktop", defaultHex: "#141414", separable: true },
  { id: "coils", label: "Glowing coils", defaultHex: "#F4F4F2", separable: false, parentRegionId: "glass", allowedColorIds: ["white"], why: "The LEDs shine through these, so they stay white." },
  { id: "rings", label: "Burner rings", defaultHex: "#F4F4F2", separable: false, parentRegionId: "glass" },
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

/**
 * Ported from dostal-3d-printing's real suggested-levers.json entry for
 * treasure-chest/plate (flattening base+finishDelta into one absolute
 * basePriceCents per finish, and the one real contrast group into a
 * generic, admin-defined attribute+rule pair) -- used to check
 * resolvePrice against the 4 treasure-chest "plate" vectors from that
 * file's `examples`, expressed as admin-defined attributes. `core: ["body"]`
 * only (the real manifest also lists "lid-body", omitted here since this
 * test fixture's own TREASURE_CHEST_REGIONS doesn't model a separate
 * chest lid region).
 */
export const TREASURE_CHEST_PRICING_RULES: PricingRules = {
  basePriceCents: {
    solid: 5900,
    ams: 8300,
    separate: 13300,
    finished: 13800,
    painted: 17700,
  },
  attributes: [
    { id: "extraColor", label: "Extra color", perUnitCents: 200 },
    { id: "customName", label: "Custom name", perUnitCents: 400 },
    { id: "raisedArt", label: "Raised art", perUnitCents: -1500 },
    { id: "strapsContrast", label: "Contrast: straps", perUnitCents: 4500 },
  ],
  contrastRules: [{ attributeId: "strapsContrast", regions: ["straps"], core: ["body"] }],
};

/**
 * Extends TREASURE_CHEST_PRICING_RULES with the complexity-based levers
 * (excess print time, color-change waste, long personalization) -- real
 * minute numbers ported from dostal-3d-printing's own estimates.json:
 * treasure-chest `solid.time_s=50249` (837.48 min) and `ams.time_s=218501`
 * (3641.68 min), rounded to whole minutes since the source estimates are
 * themselves approximate ("Times are slicer estimates, and real prints
 * run longer" -- print/README.md). Rates below are illustrative, NOT
 * approved prices -- matching the placeholder status of the source data. Deliberately NOT the owner's own placeholder 7 cents/minute:
 * at the real ~3642-minute ams estimate, 7 cents/min would add ~$241 to
 * an $83 product, which is exactly why real minute-scale numbers matter
 * even for an illustrative test -- a plausible rate here is a couple
 * cents per minute, not whatever round number sounded easy to type.
 *
 * NOTE: `ams.swaps` in the real estimates.json (1625 for treasure-chest)
 * is an UPPER BOUND assuming every tiny region segment gets its own
 * filament swap, not a stand-in for a realistic shopper's colorChanges
 * count (2-4 distinct colors in practice) -- never calibrate
 * colorChangeWaste's rate by spreading that number across a realistic
 * selection; it would wildly overcharge.
 */
export const TREASURE_CHEST_COMPLEXITY_PRICING_RULES: PricingRules = {
  ...TREASURE_CHEST_PRICING_RULES,
  attributes: [
    ...TREASURE_CHEST_PRICING_RULES.attributes,
    { id: "excessTime", label: "Extra print time", perUnitCents: 2 },
    { id: "colorChangeComplexity", label: "Color-change complexity", perUnitCents: 150 },
    { id: "colorChangeWaste", label: "Filament waste from color changes", perUnitCents: 3 },
    { id: "longName", label: "Personalization over 8 characters", perUnitCents: 50 },
  ],
  estimatedMinutes: { solid: 837, ams: 3642 },
  excessUnitRules: [
    { attributeId: "excessTime", source: "estimatedMinutes", freeUnits: 180 },
    { attributeId: "colorChangeComplexity", source: "colorChanges", freeUnits: 0 },
    { attributeId: "colorChangeWaste", source: "colorChanges", freeUnits: 0, unitsPerExcess: 5 },
    { attributeId: "longName", source: "nameLength", freeUnits: 8 },
  ],
};

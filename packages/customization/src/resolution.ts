import type { ColorRegion, CustomizationSelection, FinishTier, PaletteColor, RegionColorChoices } from "./types.js";
import { MissingParentRegionError, UnknownParentRegionError } from "./types.js";

/**
 * Validates a product's regions before they're persisted (createProductCustomization/
 * updateProductCustomization both call this) -- every non-separable region must name a
 * real parentRegionId on the SAME region list. Thrown errors here are data-integrity
 * problems, not shopper-input problems (those never reach this far).
 */
export function validateRegions(regions: ColorRegion[]): void {
  const ids = new Set(regions.map((r) => r.id));
  for (const region of regions) {
    if (!region.separable) {
      if (!region.parentRegionId) throw new MissingParentRegionError(region.id);
      if (!ids.has(region.parentRegionId)) throw new UnknownParentRegionError(region.id, region.parentRegionId);
    }
  }
}

/**
 * The effective (actually-applied) color for one region, given the current finish and the
 * shopper's selection -- ported faithfully from the real reference implementation's own
 * `effective()` (dostal-3d-printing/shop-assets/color/index.html). Three cases, checked in
 * order:
 * 1. The finish's ColorMode is "single" -- every region shares the one whole-piece color,
 *    held at `selection.__all` (see CustomizationSelection's own doc comment).
 * 2. The region isn't separable AND the finish producesSeparateParts -- it follows its
 *    parent region's own effective color instead (recursively, in case a chain exists),
 *    because a finish that assembles physically separate parts can't give a too-small
 *    region its own piece.
 * 3. Otherwise -- the region's own individually-selected color from `selection`.
 */
export function resolveEffectiveColor(regions: ColorRegion[], finish: FinishTier, selection: CustomizationSelection, regionId: string): string {
  if (finish.colors === "single") {
    const allColor = selection.__all;
    if (!allColor) throw new Error(`ColorMode "single" requires selection.__all to be set`);
    return allColor;
  }
  const region = regions.find((r) => r.id === regionId);
  if (!region) throw new Error(`Unknown region: ${regionId}`);
  if (!region.separable && finish.producesSeparateParts) {
    if (!region.parentRegionId) throw new MissingParentRegionError(region.id);
    return resolveEffectiveColor(regions, finish, selection, region.parentRegionId);
  }
  const own = selection[regionId];
  if (!own) throw new Error(`No color selected for region "${regionId}"`);
  return own;
}

/**
 * What one region can be colored under the current finish -- ported from the reference
 * implementation's own `choices()`. The palette offered is the full shared palette,
 * filtered to ColorRegion.allowedColorIds when the region restricts it; a free color
 * picker is additionally offered only when the finish's ColorMode is "any" AND the region
 * has no allowedColorIds restriction. `locked` (this package's own addition, not in the
 * reference JS, which handled it inline in the UI layer instead) is true when the region
 * doesn't take its own choice at all under the current finish -- see RegionColorChoices'
 * own doc comment for exactly when.
 */
export function availableColorChoices(palette: PaletteColor[], regions: ColorRegion[], finish: FinishTier, regionId: string): RegionColorChoices {
  if (finish.colors === "single") {
    return { palette, freeColor: false, locked: regionId !== "__all" };
  }
  const region = regions.find((r) => r.id === regionId);
  if (!region) throw new Error(`Unknown region: ${regionId}`);
  const locked = !region.separable && finish.producesSeparateParts;
  const list = region.allowedColorIds ? palette.filter((p) => region.allowedColorIds!.includes(p.id)) : palette;
  const freeColor = finish.colors === "any" && !region.allowedColorIds;
  return { palette: list, freeColor, locked };
}

/** A free-picked color's only accepted form. */
const FREE_COLOR_HEX = /^#[0-9a-f]{6}$/i;

/**
 * Thrown when a submitted selection isn't one this region's current choices
 * allow: a palette id it doesn't offer, a discontinued color, a hex in a
 * region without a free color picker, or a malformed hex. "request"-status
 * colors are allowed through: per AvailabilityStatus, they're selectable on
 * request and the caller captures that request with the order. Never trust
 * client-side greying-out alone, since a script can submit anything.
 */
export class InvalidColorSelectionError extends Error {
  constructor(regionId: string, value: string, reason: "discontinued" | "not-offered") {
    super(reason === "discontinued" ? `Region "${regionId}": color ${value} is discontinued and cannot be selected` : `Region "${regionId}": color ${value} is not one of this region's offered choices`);
    this.name = "InvalidColorSelectionError";
  }
}

/**
 * The one form a color value is compared, priced, and stored in: a palette id,
 * or a lowercase `#rrggbb` for a free-picked color. A hex that exactly matches
 * one solid palette entry becomes that entry's id, so a painted region picked
 * as `#141414` and a region picked as `black` are one color. A multi-color
 * entry never matches by hex (its hex is only representative), and a hex
 * shared by two solid entries stays a hex rather than guessing between them.
 */
export function canonicalColor(palette: PaletteColor[], value: string): string {
  if (!value.startsWith("#")) return value;
  const hex = value.toLowerCase();
  const matches = palette.filter((p) => p.kind !== "multi" && p.hex.toLowerCase() === hex);
  return matches.length === 1 ? matches[0]!.id : hex;
}

/** The hex to paint for a canonical color value: a multi-color entry returns its representative hex. Throws on a palette id that doesn't exist. */
export function resolveColorHex(palette: PaletteColor[], value: string): string {
  if (value.startsWith("#")) return value.toLowerCase();
  const match = palette.find((p) => p.id === value);
  if (!match) throw new Error(`Unknown palette color: ${value}`);
  return match.hex;
}

/**
 * Validates one region's selected color against its own current choices (the
 * output of availableColorChoices for that region). A palette id must be
 * offered and not discontinued. A `#rrggbb` hex is valid only when
 * `choices.freeColor` is true, and is still refused if it resolves to a
 * discontinued palette entry. Call this for every region before persisting a
 * selection: resolveEffectiveColor and availableColorChoices only compute.
 */
export function validateSelectedColor(choices: RegionColorChoices, regionId: string, value: string): void {
  if (value.startsWith("#") && (!choices.freeColor || !FREE_COLOR_HEX.test(value))) {
    throw new InvalidColorSelectionError(regionId, value, "not-offered");
  }
  const canonical = canonicalColor(choices.palette, value);
  const match = choices.palette.find((p) => p.id === canonical);
  if (match?.status === "discontinued") throw new InvalidColorSelectionError(regionId, value, "discontinued");
  if (!match && !canonical.startsWith("#")) throw new InvalidColorSelectionError(regionId, value, "not-offered");
}

/** The starting color for one slot: its default when that's still normally offered, else the first active color offered, else nothing. */
function defaultColor(palette: PaletteColor[], choices: RegionColorChoices, defaultHex: string): string | undefined {
  const canonical = canonicalColor(palette, defaultHex);
  const isActive = (p: PaletteColor): boolean => (p.status ?? "active") === "active";
  const entry = choices.palette.find((p) => p.id === canonical);
  if (entry ? isActive(entry) : choices.freeColor && FREE_COLOR_HEX.test(canonical)) return canonical;
  return choices.palette.find(isActive)?.id;
}

/** A starting selection for a finish, built from each region's `defaultHex`. Holds `__all` under ColorMode "single" (from the first region's default), else one entry per region that takes its own choice. */
export function defaultSelection(palette: PaletteColor[], regions: ColorRegion[], finish: FinishTier): CustomizationSelection {
  const selection: CustomizationSelection = {};
  if (finish.colors === "single") {
    const color = regions[0] && defaultColor(palette, availableColorChoices(palette, regions, finish, "__all"), regions[0].defaultHex);
    if (color) selection.__all = color;
    return selection;
  }
  for (const region of regions) {
    const choices = availableColorChoices(palette, regions, finish, region.id);
    if (choices.locked) continue;
    const color = defaultColor(palette, choices, region.defaultHex);
    if (color) selection[region.id] = color;
  }
  return selection;
}

/**
 * The number of DISTINCT colors a build actually resolves to, after finish
 * rules are applied. ColorMode "single" always resolves to exactly 1;
 * otherwise every region's effective color is counted by canonicalColor, so
 * parent-follows regions collapse into their parent's one color, and two
 * palette entries that happen to share a hex stay two colors.
 */
export function resolveColorCount(palette: PaletteColor[], regions: ColorRegion[], finish: FinishTier, selection: CustomizationSelection): number {
  if (finish.colors === "single") return 1;
  const colors = new Set<string>();
  for (const region of regions) {
    colors.add(canonicalColor(palette, resolveEffectiveColor(regions, finish, selection, region.id)));
  }
  return colors.size;
}

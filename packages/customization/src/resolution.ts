import type { Money } from "@mercatus-liber/core";
import type { ColorRegion, CustomizationSelection, FinishTier, PaletteColor, ProductCustomization, RegionColorChoices } from "./types.js";
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

/**
 * Thrown when a submitted selection tries to use a palette color this
 * region's current choices don't actually allow -- either a color id that
 * doesn't exist in this region's offered palette at all, or one that's
 * discontinued (never selectable, regardless of what a client-side UI
 * shows or omits to show). "request"-status colors ARE allowed through --
 * per AvailabilityStatus's own contract, they're explicitly selectable on
 * request, the caller is responsible for capturing that request with the
 * order (see this package's own README/service doc comments). Never
 * trust client-side greying-out alone -- a shopper (or a script) could
 * submit any hex directly.
 */
export class InvalidColorSelectionError extends Error {
  constructor(regionId: string, hex: string, reason: "discontinued" | "not-offered") {
    super(reason === "discontinued" ? `Region "${regionId}": color ${hex} is discontinued and cannot be selected` : `Region "${regionId}": color ${hex} is not one of this region's offered choices`);
    this.name = "InvalidColorSelectionError";
  }
}

/**
 * Validates one region's selected hex against its own current choices
 * (the output of availableColorChoices for that region) -- throws
 * InvalidColorSelectionError if it's discontinued or not actually
 * offered. A hex that doesn't match any palette entry is valid ONLY when
 * `choices.freeColor` is true (an "any"-mode region's free color picker);
 * otherwise it must match a non-discontinued palette entry by hex.
 * Call this for every region before persisting a shopper's selection
 * (e.g. onto a cart line) -- resolveEffectiveColor/availableColorChoices
 * alone don't enforce this, they just compute, matching this package's
 * own "pure derivation, caller decides when to enforce" discipline.
 */
export function validateSelectedColor(choices: RegionColorChoices, regionId: string, hex: string): void {
  const match = choices.palette.find((p) => p.hex.toLowerCase() === hex.toLowerCase());
  if (match) {
    if (match.status === "discontinued") throw new InvalidColorSelectionError(regionId, hex, "discontinued");
    return;
  }
  if (!choices.freeColor) throw new InvalidColorSelectionError(regionId, hex, "not-offered");
}

/**
 * The price delta a shopper actually pays for choosing `finish` on this
 * specific product -- `customization.finishPriceDeltas[finish.id]` wins
 * when the product names its own override (see ProductCustomization.
 * finishPriceDeltas' own doc comment for why: hand-painting a large
 * product costs more than hand-painting a small one), else the finish
 * tier's own global `priceDelta`, else undefined (no price change).
 */
export function resolveFinishPriceDelta(finish: FinishTier, customization: ProductCustomization): Money | undefined {
  return customization.finishPriceDeltas?.[finish.id] ?? finish.priceDelta;
}

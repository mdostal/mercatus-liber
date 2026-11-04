import type { Money } from "@mercatus-liber/core";
import type { ArtStyle, ColorRegion, CustomizationSelection, FinishTier, PaletteColor, ProductCustomization, RegionColorChoices } from "./types.js";
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

/**
 * The price delta a shopper actually pays for choosing `artStyle` on this
 * specific product -- same override pattern as resolveFinishPriceDelta:
 * `customization.artStylePriceDeltas[artStyle.id]` wins when present,
 * else the art style's own global `priceDelta`, else undefined.
 */
export function resolveArtStylePriceDelta(artStyle: ArtStyle, customization: ProductCustomization): Money | undefined {
  return customization.artStylePriceDeltas?.[artStyle.id] ?? artStyle.priceDelta;
}

/**
 * A resolved hex's identity for counting/pricing purposes: the matching
 * palette color's own `id` when one exists, else the raw (lowercased)
 * hex itself -- for a free-picked color under ColorMode "any" that isn't
 * in the palette at all. Identity is by palette id, not hex, because a
 * multi-color/blend filament (the reference manifest's own real "kind":
 * "multi" palette entries, e.g. "Dawn Radiance" -- a representative
 * `hex` plus blend-stop `hexes`) can share its representative hex with a
 * different palette entry while still being a genuinely different
 * choice (a different spool) -- an identity keyed on hex alone would
 * wrongly merge the two. This package doesn't yet carry `kind`/`hexes`
 * on PaletteColor (a separate, not-yet-built epic); the identity rule is
 * designed to stay correct once it does.
 */
function colorIdentity(palette: PaletteColor[], hex: string): string {
  const match = palette.find((p) => p.hex.toLowerCase() === hex.toLowerCase());
  return match ? match.id : hex.toLowerCase();
}

/**
 * The number of DISTINCT colors a build actually resolves to, after
 * finish rules are applied -- the real pricing lever Mathew (shop owner)
 * wants ("we'll charge more for the more color differentiations they
 * put"), reported by the reference editor as `colorCount`. ColorMode
 * "single" always resolves to exactly 1 (the whole piece shares one
 * color); otherwise every region's resolveEffectiveColor result is
 * counted by colorIdentity, so parent-follows regions correctly collapse
 * into their parent's one color instead of each counting separately.
 */
export function resolveColorCount(palette: PaletteColor[], regions: ColorRegion[], finish: FinishTier, selection: CustomizationSelection): number {
  if (finish.colors === "single") return 1;
  const identities = new Set<string>();
  for (const region of regions) {
    const hex = resolveEffectiveColor(regions, finish, selection, region.id);
    identities.add(colorIdentity(palette, hex));
  }
  return identities.size;
}

/** Thrown when summing Money deltas that don't share one currency -- this package never silently mixes them. */
export class MixedCurrencyError extends Error {
  constructor(a: string, b: string) {
    super(`Cannot sum price deltas in different currencies: ${a} and ${b}`);
    this.name = "MixedCurrencyError";
  }
}

function sumMoneyDeltas(deltas: (Money | undefined)[]): Money | undefined {
  const present = deltas.filter((d): d is Money => d !== undefined);
  if (present.length === 0) return undefined;
  const currency = present[0]!.currency;
  let amount = 0;
  for (const delta of present) {
    if (delta.currency !== currency) throw new MixedCurrencyError(currency, delta.currency);
    amount += delta.amount;
  }
  return { amount, currency };
}

/**
 * The total additive price delta for one fully-resolved build -- sums
 * every independent lever this package supports, none of which double-
 * count the others:
 * 1. resolveFinishPriceDelta -- the chosen finish tier's own cost.
 * 2. Each DISTINCT color actually used (by colorIdentity, see
 *    resolveColorCount) that itself carries a `PaletteColor.priceDelta`
 *    -- counted once per distinct color, not once per region it's used
 *    on ("some colors can cost more").
 * 3. Each region that took its OWN independent choice (not locked --
 *    see RegionColorChoices.locked) whose `ColorRegion.priceDelta` is
 *    set -- counted once per such region regardless of which color
 *    landed on it ("some other parts will cost more").
 * 4. `customization.colorCountPriceDeltas[String(colorCount)]`, if the
 *    product names a surcharge at this exact distinct-color count.
 * 5. resolveArtStylePriceDelta -- the chosen art style's own cost, only
 *    when both `artStyles` and `artStyleId` are given (a product that
 *    doesn't offer a choice of art style never has one to price).
 * Returns undefined (no price change) only when every lever above is
 * absent for this build -- otherwise a real Money sum, never a silent
 * partial total.
 */
export function resolveCustomizationPriceDelta(
  palette: PaletteColor[],
  finish: FinishTier,
  customization: ProductCustomization,
  selection: CustomizationSelection,
  artStyles: ArtStyle[] = [],
  artStyleId?: string,
): Money | undefined {
  const regions = customization.regions;
  const deltas: (Money | undefined)[] = [resolveFinishPriceDelta(finish, customization)];
  if (artStyleId) {
    const artStyle = artStyles.find((a) => a.id === artStyleId);
    if (!artStyle) throw new Error(`Unknown art style: ${artStyleId}`);
    deltas.push(resolveArtStylePriceDelta(artStyle, customization));
  }

  const usedIdentities = new Set<string>();
  for (const region of regions) {
    const choices = availableColorChoices(palette, regions, finish, region.id);
    const hex = resolveEffectiveColor(regions, finish, selection, region.id);
    usedIdentities.add(colorIdentity(palette, hex));
    if (!choices.locked && region.priceDelta) deltas.push(region.priceDelta);
  }
  for (const identity of usedIdentities) {
    const color = palette.find((p) => p.id === identity);
    if (color?.priceDelta) deltas.push(color.priceDelta);
  }

  const colorCount = resolveColorCount(palette, regions, finish, selection);
  const colorCountDelta = customization.colorCountPriceDeltas?.[String(colorCount)];
  if (colorCountDelta) deltas.push(colorCountDelta);

  return sumMoneyDeltas(deltas);
}

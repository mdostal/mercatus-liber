import { randomUUID } from "node:crypto";
import type { Money } from "@mercatus-liber/core";
import { resolveArtStylePriceDelta, resolveColorCount, resolveCustomizationPriceDelta, resolveEffectiveColor, resolveFinishPriceDelta, availableColorChoices, validateRegions, validateSelectedColor } from "./resolution.js";
import type {
  ArtStyle,
  ArtStyleRepository,
  CustomizationSelection,
  FinishTier,
  FinishTierRepository,
  NewProductCustomizationInput,
  PaletteColor,
  PaletteRepository,
  ProductCustomization,
  ProductCustomizationRepository,
  RegionColorChoices,
} from "./types.js";

/** Thrown when a ProductCustomization lists a finishId that isn't a known FinishTier -- the finish catalog is this package's own, never invented by the caller. */
export class UnknownFinishTierError extends Error {
  constructor(finishId: string) {
    super(`Unknown finish tier: ${finishId}`);
    this.name = "UnknownFinishTierError";
  }
}

/** Thrown when a shopper's (or a script's) request names a finish tier that's discontinued -- per AvailabilityStatus's own contract, discontinued is never selectable, backend-enforced here rather than trusted to a client-side UI. "request"-status finishes ARE allowed through (see this error's sibling check in requireFinish). */
export class DiscontinuedFinishError extends Error {
  constructor(finishId: string) {
    super(`Finish tier "${finishId}" is discontinued and cannot be selected`);
    this.name = "DiscontinuedFinishError";
  }
}

/** Thrown when a ProductCustomization lists an artStyleId that isn't a known ArtStyle, or doesn't offer that style at all -- same "this package's own catalog, never invented by the caller" discipline as UnknownFinishTierError. */
export class UnknownArtStyleError extends Error {
  constructor(artStyleId: string) {
    super(`Unknown art style: ${artStyleId}`);
    this.name = "UnknownArtStyleError";
  }
}

/** Thrown when a request names an art style that's discontinued -- same server-side enforcement as DiscontinuedFinishError. */
export class DiscontinuedArtStyleError extends Error {
  constructor(artStyleId: string) {
    super(`Art style "${artStyleId}" is discontinued and cannot be selected`);
    this.name = "DiscontinuedArtStyleError";
  }
}

export interface CustomizationService {
  listPalette(): Promise<PaletteColor[]>;
  setPaletteColor(color: PaletteColor): Promise<PaletteColor>;

  listFinishTiers(): Promise<FinishTier[]>;
  setFinishTier(tier: FinishTier): Promise<FinishTier>;

  listArtStyles(): Promise<ArtStyle[]>;
  setArtStyle(style: ArtStyle): Promise<ArtStyle>;

  createProductCustomization(input: NewProductCustomizationInput): Promise<ProductCustomization>;
  /** Merges patch into an existing ProductCustomization; null if no customization has this id. Id/productId are never overwritten. Re-validates regions/finishIds exactly as createProductCustomization does. */
  updateProductCustomization(id: string, patch: Partial<Omit<NewProductCustomizationInput, "productId">>): Promise<ProductCustomization | null>;
  getProductCustomization(id: string): Promise<ProductCustomization | null>;
  getProductCustomizationByProductId(productId: string): Promise<ProductCustomization | null>;
  listProductCustomizations(): Promise<ProductCustomization[]>;

  /**
   * The effective color for EVERY region of a product's customization,
   * under one finish and one shopper selection -- what a storefront's 3D
   * viewer actually paints each region. Throws if finishId isn't one of
   * this product's offered finishIds, or if a region's `selection` entry
   * is missing where required (see resolveEffectiveColor's own doc
   * comment) -- a storefront should only ever call this with a complete
   * selection built from getRegionChoices' own output.
   */
  resolveEffectiveColors(productCustomizationId: string, finishId: string, selection: CustomizationSelection): Promise<Record<string, string>>;

  /**
   * What every region of a product's customization can be colored under
   * one finish -- the live data a storefront's swatch-row UI renders
   * from. Keyed by region id (plus "__all" when the finish's ColorMode is
   * "single"). Throws if finishId isn't one of this product's offered
   * finishIds.
   */
  getRegionChoices(productCustomizationId: string, finishId: string): Promise<Record<string, RegionColorChoices>>;

  /**
   * The price delta a shopper pays for choosing `finishId` on this
   * product -- the product's own override from
   * ProductCustomization.finishPriceDeltas when present, else the finish
   * tier's global default, else undefined. See resolveFinishPriceDelta's
   * own doc comment.
   */
  getFinishPriceDelta(productCustomizationId: string, finishId: string): Promise<Money | undefined>;

  /**
   * The number of distinct colors `selection` resolves to under
   * `finishId`, after finish rules are applied -- see resolveColorCount's
   * own doc comment. Validates `selection` exactly as
   * resolveEffectiveColors does (never trusts a discontinued color
   * through).
   */
  getColorCount(productCustomizationId: string, finishId: string, selection: CustomizationSelection): Promise<number>;

  /**
   * The total additive price delta for one fully-resolved build -- sums
   * the finish's own delta, any per-color surcharges for distinct colors
   * actually used, any per-region surcharges for regions that took their
   * own independent choice, and any colorCount-tier surcharge. See
   * resolveCustomizationPriceDelta's own doc comment. Validates
   * `selection` exactly as resolveEffectiveColors does.
   */
  /**
   * `artStyleId` is optional -- most callers price without regard to art
   * style until a storefront actually offers that choice. When given, it
   * must be one of this product's own `artStyleIds` and not discontinued
   * (same enforcement as finishId). Adds resolveArtStylePriceDelta's own
   * result on top of every other lever.
   */
  getCustomizationPriceDelta(productCustomizationId: string, finishId: string, selection: CustomizationSelection, artStyleId?: string): Promise<Money | undefined>;

  /**
   * The price delta a shopper pays for choosing `artStyleId` on this
   * product -- the product's own override from
   * ProductCustomization.artStylePriceDeltas when present, else the art
   * style's global default, else undefined. See
   * resolveArtStylePriceDelta's own doc comment.
   */
  getArtStylePriceDelta(productCustomizationId: string, artStyleId: string): Promise<Money | undefined>;
}

export function createCustomizationService(deps: {
  palette: PaletteRepository;
  finishTiers: FinishTierRepository;
  artStyles: ArtStyleRepository;
  productCustomizations: ProductCustomizationRepository;
}): CustomizationService {
  const { palette, finishTiers, artStyles, productCustomizations } = deps;

  async function requireFinish(customization: ProductCustomization, finishId: string): Promise<FinishTier> {
    if (!customization.finishIds.includes(finishId)) {
      throw new UnknownFinishTierError(finishId);
    }
    const tiers = await finishTiers.list();
    const tier = tiers.find((t) => t.id === finishId);
    if (!tier) throw new UnknownFinishTierError(finishId);
    if (tier.status === "discontinued") throw new DiscontinuedFinishError(finishId);
    return tier;
  }

  async function requireArtStyle(customization: ProductCustomization, artStyleId: string): Promise<ArtStyle> {
    if (!customization.artStyleIds?.includes(artStyleId)) {
      throw new UnknownArtStyleError(artStyleId);
    }
    const styles = await artStyles.list();
    const style = styles.find((s) => s.id === artStyleId);
    if (!style) throw new UnknownArtStyleError(artStyleId);
    if (style.status === "discontinued") throw new DiscontinuedArtStyleError(artStyleId);
    return style;
  }

  // Validate what the shopper actually submitted -- never trust client-side
  // greying-out alone. Only the slot(s) the shopper actually fills in get
  // checked: selection.__all under ColorMode "single", else each unlocked
  // region's own entry (a locked region has no entry of its own -- it
  // inherits, and its parent's entry is validated when the parent is reached).
  // Shared by every method that resolves a selection into colors or price.
  function validateSelection(customization: ProductCustomization, finish: FinishTier, paletteColors: PaletteColor[], selection: CustomizationSelection): void {
    if (finish.colors === "single") {
      const allChoices = availableColorChoices(paletteColors, customization.regions, finish, "__all");
      if (selection.__all) validateSelectedColor(allChoices, "__all", selection.__all);
      return;
    }
    for (const region of customization.regions) {
      const choices = availableColorChoices(paletteColors, customization.regions, finish, region.id);
      if (!choices.locked && selection[region.id]) validateSelectedColor(choices, region.id, selection[region.id]!);
    }
  }

  return {
    async listPalette(): Promise<PaletteColor[]> {
      return palette.list();
    },

    async setPaletteColor(color: PaletteColor): Promise<PaletteColor> {
      await palette.save(color);
      return color;
    },

    async listFinishTiers(): Promise<FinishTier[]> {
      return finishTiers.list();
    },

    async setFinishTier(tier: FinishTier): Promise<FinishTier> {
      await finishTiers.save(tier);
      return tier;
    },

    async listArtStyles(): Promise<ArtStyle[]> {
      return artStyles.list();
    },

    async setArtStyle(style: ArtStyle): Promise<ArtStyle> {
      await artStyles.save(style);
      return style;
    },

    async createProductCustomization(input: NewProductCustomizationInput): Promise<ProductCustomization> {
      validateRegions(input.regions);
      const customization: ProductCustomization = { ...input, id: randomUUID() };
      await productCustomizations.save(customization);
      return customization;
    },

    async updateProductCustomization(id, patch): Promise<ProductCustomization | null> {
      const existing = await productCustomizations.get(id);
      if (!existing) return null;
      const updated: ProductCustomization = { ...existing, ...patch, id: existing.id, productId: existing.productId };
      validateRegions(updated.regions);
      await productCustomizations.save(updated);
      return updated;
    },

    async getProductCustomization(id: string): Promise<ProductCustomization | null> {
      return productCustomizations.get(id);
    },

    async getProductCustomizationByProductId(productId: string): Promise<ProductCustomization | null> {
      return productCustomizations.getByProductId(productId);
    },

    async listProductCustomizations(): Promise<ProductCustomization[]> {
      return productCustomizations.list();
    },

    async resolveEffectiveColors(productCustomizationId, finishId, selection): Promise<Record<string, string>> {
      const customization = await productCustomizations.get(productCustomizationId);
      if (!customization) throw new Error(`Product customization not found: ${productCustomizationId}`);
      const finish = await requireFinish(customization, finishId);
      const paletteColors = await palette.list();
      validateSelection(customization, finish, paletteColors, selection);

      const result: Record<string, string> = {};
      for (const region of customization.regions) {
        result[region.id] = resolveEffectiveColor(customization.regions, finish, selection, region.id);
      }
      return result;
    },

    async getRegionChoices(productCustomizationId, finishId): Promise<Record<string, RegionColorChoices>> {
      const customization = await productCustomizations.get(productCustomizationId);
      if (!customization) throw new Error(`Product customization not found: ${productCustomizationId}`);
      const finish = await requireFinish(customization, finishId);
      const paletteColors = await palette.list();
      const result: Record<string, RegionColorChoices> = {};
      if (finish.colors === "single") {
        result.__all = availableColorChoices(paletteColors, customization.regions, finish, "__all");
        return result;
      }
      for (const region of customization.regions) {
        result[region.id] = availableColorChoices(paletteColors, customization.regions, finish, region.id);
      }
      return result;
    },

    async getFinishPriceDelta(productCustomizationId, finishId): Promise<Money | undefined> {
      const customization = await productCustomizations.get(productCustomizationId);
      if (!customization) throw new Error(`Product customization not found: ${productCustomizationId}`);
      const finish = await requireFinish(customization, finishId);
      return resolveFinishPriceDelta(finish, customization);
    },

    async getColorCount(productCustomizationId, finishId, selection): Promise<number> {
      const customization = await productCustomizations.get(productCustomizationId);
      if (!customization) throw new Error(`Product customization not found: ${productCustomizationId}`);
      const finish = await requireFinish(customization, finishId);
      const paletteColors = await palette.list();
      validateSelection(customization, finish, paletteColors, selection);
      return resolveColorCount(paletteColors, customization.regions, finish, selection);
    },

    async getCustomizationPriceDelta(productCustomizationId, finishId, selection, artStyleId): Promise<Money | undefined> {
      const customization = await productCustomizations.get(productCustomizationId);
      if (!customization) throw new Error(`Product customization not found: ${productCustomizationId}`);
      const finish = await requireFinish(customization, finishId);
      const paletteColors = await palette.list();
      validateSelection(customization, finish, paletteColors, selection);
      if (artStyleId === undefined) {
        return resolveCustomizationPriceDelta(paletteColors, finish, customization, selection);
      }
      await requireArtStyle(customization, artStyleId);
      const allStyles = await artStyles.list();
      return resolveCustomizationPriceDelta(paletteColors, finish, customization, selection, allStyles, artStyleId);
    },

    async getArtStylePriceDelta(productCustomizationId, artStyleId): Promise<Money | undefined> {
      const customization = await productCustomizations.get(productCustomizationId);
      if (!customization) throw new Error(`Product customization not found: ${productCustomizationId}`);
      const style = await requireArtStyle(customization, artStyleId);
      return resolveArtStylePriceDelta(style, customization);
    },
  };
}

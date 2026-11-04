import type { AvailabilityStatus, Money } from "@mercatus-liber/core";

/**
 * One filament/paint color offered for customization -- a shared palette
 * across every product, same "one shared catalog" shape as the real
 * reference manifest's own `palette`.
 */
export interface PaletteColor {
  id: string;
  label: string;
  hex: string;
  /**
   * sku-availability-status epic's shared type, reused here for the
   * identical three-state concept the real reference manifest's v2 adds
   * to palette items -- missing means "active". See AvailabilityStatus's
   * own doc comment (@mercatus-liber/core) for the full contract.
   */
  status?: AvailabilityStatus;
  /** Shown to the shopper alongside a non-"active" status -- e.g. "Out of this filament until next restock." */
  note?: string;
  /**
   * Additive money increment for choosing THIS color anywhere in a build
   * -- a specialty/metallic filament that costs more regardless of which
   * region it's applied to or how many regions use it. Counted once per
   * customization even if the same color is used on multiple regions --
   * see resolveCustomizationPriceDelta's own doc comment. Real business
   * need (Mathew, shop owner): "some colors can cost more." Absent means
   * no surcharge for this color. Never defaulted/invented.
   */
  priceDelta?: Money;
}

/**
 * How a finish tier lets a shopper pick colors:
 * - "single": the whole piece is one color -- every region gets the same color, no per-region choice.
 * - "palette": each region (that isn't locked to a parent, see ColorRegion.separable) picks independently from the shared palette.
 * - "any": each region (that isn't restricted via ColorRegion.allowedColorIds) picks any color at all, via a free color picker, plus the palette as quick picks.
 */
export type ColorMode = "single" | "palette" | "any";

/**
 * A way a product can be made -- e.g. "one color print" up to "hand-painted," each a real
 * step up in cost. `rank` orders tiers cheapest-to-priciest (1 = cheapest); this package
 * never invents a price delta -- see FinishTier's own doc comment on `priceDelta`.
 */
export interface FinishTier {
  id: string;
  /** Price rank, ascending (1 = cheapest). Display-only ordering; the real price delta (if any) is priceDelta. */
  rank: number;
  label: string;
  colors: ColorMode;
  description: string;
  /**
   * Whether this finish produces the product as physically separate,
   * independently-colored parts that get assembled (e.g. "separate color
   * parts," "finished") as opposed to one physical print/paint event that
   * handles every region together (e.g. "one color," "multicolor print,"
   * "hand-painted"). This is the real, named trigger for ColorRegion.
   * separable's effect -- see resolveEffectiveColor's own doc comment.
   * Confirmed against the real reference manifest's own rule text: a
   * region too small to be its own physical part follows its parent
   * region's color specifically in the tiers that assemble separate
   * parts, not in a single-print-event tier that can inlay a tiny region
   * without it ever being its own physical piece.
   */
  producesSeparateParts: boolean;
  /**
   * Additive money increment over the product's base price for choosing
   * this finish tier -- the GLOBAL default, used when a specific
   * ProductCustomization doesn't name its own override in
   * `finishPriceDeltas` (see that field's own doc comment for why a
   * delta can legitimately vary by product -- hand-painting a small part
   * costs less than hand-painting a large one). Absent until a real
   * business decision sets it. Never defaulted/invented.
   */
  priceDelta?: Money;
  /**
   * sku-availability-status epic's shared type, reused here for the
   * identical three-state concept the real reference manifest's v2 adds
   * to finish entries -- missing means "active". See AvailabilityStatus's
   * own doc comment (@mercatus-liber/core) for the full contract.
   */
  status?: AvailabilityStatus;
  /** Shown to the shopper alongside a non-"active" status -- e.g. "Multicolor printing paused for maintenance." */
  note?: string;
}

/**
 * One independently-colorable part of a product's 3D model -- `id` must
 * match a named material/region in the product's own GLB (see
 * @mercatus-liber/core's Product.viewerUrl), so a storefront's 3D viewer
 * can recolor it directly; this package has no rendering code of its own.
 */
export interface ColorRegion {
  id: string;
  label: string;
  defaultHex: string;
  /**
   * Whether this region CAN be its own physically separate, independently
   * colored part. When false, `parentRegionId` must be set -- see
   * resolveEffectiveColor's own doc comment for exactly when that
   * fallback applies (only under a finish tier whose
   * `producesSeparateParts` is true).
   */
  separable: boolean;
  /** Required when separable is false -- which region this one's color follows when a finish tier can't give it its own physical part. */
  parentRegionId?: string;
  /**
   * If set, only these palette color ids are ever offered for this
   * region, in every finish tier, regardless of the tier's own colors
   * mode -- e.g. a light-diffuser part that must stay a specific color
   * for an LED to shine through correctly. See `why` for the shopper-
   * facing explanation.
   */
  allowedColorIds?: string[];
  /** Shown to the shopper when this region is restricted or locked -- e.g. "The LEDs shine through these, so they stay white." */
  why?: string;
  /**
   * Additive money increment for giving THIS region its own independent
   * color choice -- charged once whenever the region is unlocked (not
   * following a parent, not forced to a single whole-piece color) under
   * the chosen finish, regardless of which color is picked. Real
   * business need (Mathew, shop owner): "some other parts will cost
   * more" -- breaking a part out as separately colorable/paintable is
   * itself what costs extra, not just which color lands on it. Absent
   * means no surcharge for this region. Never defaulted/invented.
   */
  priceDelta?: Money;
}

/**
 * One product's customization configuration -- which finishes it offers
 * and its own color regions. References the catalog Product by id only
 * (same "never fork/extend core's closed Product/Sku shapes" discipline
 * every other subsystem follows) -- never imports @mercatus-liber/catalog.
 */
export interface ProductCustomization {
  id: string;
  productId: string;
  /** Finish tier ids this product offers, in the order they should be presented to a shopper (not necessarily rank order -- a storefront may want to lead with its preferred default). */
  finishIds: string[];
  regions: ColorRegion[];
  /**
   * Informational provenance only, NOT auto-merged by this package: which
   * other products' own regions this combined model's `regions` above
   * were authored from (e.g. a "cubby set" lists its own full combined
   * region list -- chest regions plus the caddy's own regions renamed to
   * avoid id collisions, like "caddy-body" -- directly on THIS
   * ProductCustomization; `bundledProductIds` just records that it came
   * from those two products, for a storefront UI that wants to say "this
   * set includes X and Y"). Deliberately NOT @mercatus-liber/bundles'
   * BundleTier -- that's a pricing/cart concept (which SKUs a tier adds
   * to cart); this has no price/SKU implication of its own. A storefront
   * composing a bundle's real price still uses @mercatus-liber/bundles
   * for that -- the two are independent and may both apply to the same
   * combined product.
   */
  bundledProductIds?: string[];
  /**
   * Per-product override of a finish tier's global `priceDelta`, keyed by
   * finishId -- wins over FinishTier.priceDelta when present for a given
   * finish. Real production need, not speculative: a large product (a
   * treasure chest) hand-painted costs more than a small one (an insert
   * tray) hand-painted, so a single global delta per finish tier can't be
   * the only price lever. Absent entirely means "use every finish's own
   * global default" -- most products never need this.
   */
  finishPriceDeltas?: Record<string, Money>;
  /**
   * Additive money increment keyed by the distinct-color COUNT a build
   * resolves to (see resolveColorCount) -- e.g. `{ "2": {...}, "3":
   * {...} }` charges extra once a build uses 2 or 3 distinct colors.
   * Real business need (Mathew, shop owner): "we'll charge more for the
   * more color differentiations they put." A missing key at a given
   * count means no surcharge at that count; the shop sets the real
   * amounts and curve (flat, cliff, or per-step) -- this package never
   * assumes linear pricing. Absent entirely means colorCount never
   * affects price for this product.
   */
  colorCountPriceDeltas?: Record<string, Money>;
  /** Shown to the shopper for why this product's offered finishes are limited (e.g. "No one-color option: the coil diffusers must be white for the LEDs to shine through."). */
  why?: string;
}

export type NewProductCustomizationInput = Omit<ProductCustomization, "id">;

/** A shopper's in-progress or submitted color choice -- regionId -> palette color id (or a free hex string, only valid for a region whose available choices allow it, see availableColorChoices). The special key `__all` holds the single whole-piece color under a ColorMode "single" finish. */
export type CustomizationSelection = Record<string, string>;

/** What a region can be colored under the CURRENT finish selection -- the live result of availableColorChoices, driving a storefront's swatch row. */
export interface RegionColorChoices {
  /** The palette colors offered -- the full shared palette, filtered to ColorRegion.allowedColorIds when the region restricts it. */
  palette: PaletteColor[];
  /** Whether a free-form color picker should ALSO be offered (true only when the finish's ColorMode is "any" and the region has no allowedColorIds restriction). */
  freeColor: boolean;
  /**
   * True when this region doesn't take its own choice at all under the
   * current finish -- either because the finish is ColorMode "single"
   * (the whole piece shares one color), or because the region isn't
   * separable and the finish producesSeparateParts (it follows its
   * parent instead). A storefront should render this region read-only
   * (e.g. ColorRegion.why as the shown reason) rather than an editable
   * swatch row.
   */
  locked: boolean;
}

/** Thrown when a ColorRegion's parentRegionId doesn't resolve to a real region on the same ProductCustomization -- a data-integrity error, not a runtime shopper-input error. */
export class UnknownParentRegionError extends Error {
  constructor(regionId: string, parentRegionId: string) {
    super(`Region "${regionId}" names parentRegionId "${parentRegionId}", which is not a region on this product`);
    this.name = "UnknownParentRegionError";
  }
}

/** Thrown when a ColorRegion has separable: false but no parentRegionId -- required, see ColorRegion's own doc comment. */
export class MissingParentRegionError extends Error {
  constructor(regionId: string) {
    super(`Region "${regionId}" has separable: false but no parentRegionId`);
    this.name = "MissingParentRegionError";
  }
}

/** Adapter pattern, as everywhere else in this codebase. */
export interface PaletteRepository {
  list(): Promise<PaletteColor[]>;
  save(color: PaletteColor): Promise<void>;
}

/** Adapter pattern, as everywhere else in this codebase. */
export interface FinishTierRepository {
  list(): Promise<FinishTier[]>;
  save(tier: FinishTier): Promise<void>;
}

/** Adapter pattern, as everywhere else in this codebase. */
export interface ProductCustomizationRepository {
  get(id: string): Promise<ProductCustomization | null>;
  getByProductId(productId: string): Promise<ProductCustomization | null>;
  list(): Promise<ProductCustomization[]>;
  save(customization: ProductCustomization): Promise<void>;
}

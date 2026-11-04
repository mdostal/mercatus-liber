import type { AvailabilityStatus } from "@mercatus-liber/core";

/**
 * One filament/paint color offered for customization -- a shared palette
 * across every product, same "one shared catalog" shape as the real
 * reference manifest's own `palette`.
 */
export interface PaletteColor {
  id: string;
  label: string;
  /** For a "multi" kind entry, the representative color used wherever a single value is needed (3D preview base color, anywhere one hex is required). */
  hex: string;
  /**
   * "solid" (default when missing) or "multi" -- a real filament whose
   * color changes along the strand (e.g. a silk gradient), ported from
   * the reference manifest's own real `kind`/`hexes` fields. Additive:
   * every existing consumer that only reads `hex` keeps working.
   */
  kind?: "solid" | "multi";
  /** Only present for kind "multi" -- the blend's stop colors, for a swatch gradient and order display. Absent for "solid". */
  hexes?: string[];
  /**
   * Which filament material this is -- e.g. "silk" (glossier, and the
   * real cost driver behind a per-silk-color surcharge; see
   * PricingLevers.silkColorDelta). Absent means the shop's base material
   * ("basic" in the reference manifest). Never a price itself -- this
   * package carries the material fact, pricing lives in the levers.
   */
  material?: string;
  /**
   * sku-availability-status epic's shared type, reused here for the
   * identical three-state concept the real reference manifest's v2 adds
   * to palette items -- missing means "active". See AvailabilityStatus's
   * own doc comment (@mercatus-liber/core) for the full contract.
   */
  status?: AvailabilityStatus;
  /** Shown to the shopper alongside a non-"active" status -- e.g. "Out of this filament until next restock." */
  note?: string;
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
 * step up in cost. `rank` orders tiers cheapest-to-priciest (1 = cheapest); the real price
 * delta for choosing this tier lives in PricingLevers.products[productId].variants[variantId]
 * .finishDeltas[id], generated from real cost/slicer data -- not carried on this type.
 */
export interface FinishTier {
  id: string;
  /** Price rank, ascending (1 = cheapest). Display-only ordering; the real price delta (if any) lives in PricingLevers. */
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
 * A way a product's engraved/printed art (names, pictures) can be made --
 * ported from the real reference manifest's own `art_styles`: "flush"
 * (set level into the surface, printed in place) or "raised" (stands up
 * off the surface). Orthogonal to FinishTier -- a product picks one
 * finish AND one art style independently; this package has no opinion
 * on which GLB a style loads (`glb_raised` is a pure rendering/asset
 * concern, never carried here). Real business driver: raised is cheaper
 * to print on most products (fewer filament swaps) but not all (see
 * PricingLevers.products[productId].variants[variantId].artDeltas.raised,
 * generated from real slicer data -- the delta isn't carried on this
 * type since it genuinely varies by product, not just globally).
 */
export interface ArtStyle {
  id: string;
  label: string;
  description: string;
  /**
   * sku-availability-status epic's shared type, reused here for the
   * identical three-state concept -- missing means "active". See
   * AvailabilityStatus's own doc comment (@mercatus-liber/core).
   */
  status?: AvailabilityStatus;
  /** Shown to the shopper alongside a non-"active" status. */
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
  /** Art style ids this product offers (e.g. "flush", "raised"), in presentation order. Absent means this product doesn't offer a choice of art style at all -- not every product needs one. */
  artStyleIds?: string[];
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
export interface ArtStyleRepository {
  list(): Promise<ArtStyle[]>;
  save(style: ArtStyle): Promise<void>;
}

/** Adapter pattern, as everywhere else in this codebase. */
export interface ProductCustomizationRepository {
  get(id: string): Promise<ProductCustomization | null>;
  getByProductId(productId: string): Promise<ProductCustomization | null>;
  list(): Promise<ProductCustomization[]>;
  save(customization: ProductCustomization): Promise<void>;
}

// ---------------------------------------------------------------------------
// Pricing. A generic, fully admin-defined rules engine -- direct correction
// from the shop owner after an earlier fixed-field design ("it isn't a flat
// per color count charge... fully customizeable across the entire board...
// our tool should basically allow us to build a formula and have a bunch of
// attributes for a product"). Nothing here hardcodes "colors cost $X" or
// "raised art is cheaper" as a named field -- every cost driver is an
// admin-defined PricingAttribute with its own rate, and a product's
// PricingRules is just a flat list of whichever attributes apply to it, plus
// per-specific-color markup and contrast rules (both also fully admin-
// editable, not fixed to any one product). The REAL slicer-time/wastage/
// reprint-risk data (dostal-3d-printing's estimates.json) is an input a
// human uses to DECIDE what rate to set for an attribute -- this package
// doesn't compute cost from slicer data itself, it just stores and sums
// whatever rates the admin set. See resolvePrice's own doc comment
// (src/pricing.ts) for exactly how a build's attribute counts are summed.
// ---------------------------------------------------------------------------

/** One line of an itemized price breakdown -- `amount` is the line's own additive cents, never cumulative. */
export interface PriceLine {
  id: string;
  label: string;
  amount: number;
}

/** The full priced result of one build. `total` is floored at `rules.basePriceCents[build.finish]` -- never let a discount attribute make the whole item cheaper than its own starting price. */
export interface PriceResult {
  lines: PriceLine[];
  total: number;
  /** True when `build.quoteOnly` named a request-only attribute (e.g. real metal hardware) -- quoted by request, never auto-priced. */
  quoteRequired: boolean;
}

/**
 * One admin-defined cost driver -- "extra color," "silk filament,"
 * "custom name," "chest straps differ from the body," a drop-ship
 * fulfillment surcharge, anything. Nothing about PricingAttribute is
 * specific to any one product or concept; what it means and how many
 * units apply is entirely up to the admin (via its `id`) and the caller
 * (via PriceBuild.attributeCounts) -- this package only sums
 * `count * perUnitCents` for whichever attributes a product's PricingRules
 * actually lists. `perUnitCents` can be negative (a discount, e.g. raised
 * art costs less on some products).
 */
export interface PricingAttribute {
  id: string;
  label: string;
  perUnitCents: number;
  /**
   * When true, this attribute is request-only -- its own units are never
   * added to the total (real metal hardware has no settled price yet);
   * PriceResult.quoteRequired is set instead whenever a build's
   * attributeCounts names this attribute at all. Same real business need
   * as the earlier `metal: true` flag, generalized to any attribute.
   */
  quoteOnly?: boolean;
}

/**
 * An admin-defined rule that contributes exactly one unit to a named
 * attribute's count whenever ANY of `regions` is given a color that
 * doesn't match ANY of `core`'s own colors -- the real, measured
 * mechanism behind e.g. a treasure chest's straps (matching the chest's
 * core color costs nothing extra; differing from it is real, significant
 * print time). Not specific to one product or one region pair -- a
 * product can define as many of these as it has real contrast-sensitive
 * region groups, each naming whichever `attributeId` the admin wants to
 * rate. Colors are compared by the resolved palette color id (via
 * PriceBuild.colors), case-insensitively if a raw hex is ever used
 * instead. PriceBuild.colors MUST be each region's EFFECTIVE color
 * (this package's own resolveEffectiveColor/resolveEffectiveColors
 * output), never the shopper's raw, as-submitted selection -- a real
 * bug caught in production use: under a finish/region combination
 * where a region is locked (follows a parent, or the whole piece
 * shares one color), its raw submitted value can still differ from a
 * sibling's raw value even though the two end up the SAME effective
 * color, which would falsely fire a contrast rule that should never
 * have applied. See PriceBuild.colors' own doc comment.
 */
export interface ContrastRule {
  attributeId: string;
  regions: string[];
  core: string[];
}

/**
 * One product's complete, admin-editable pricing configuration -- the
 * whole formula for this product lives here, nothing fixed in code.
 */
export interface PricingRules {
  /** Starting price per finish id (e.g. "solid", "ams") -- the floor every attribute's charge is added on top of. */
  basePriceCents: Record<string, number>;
  /** This product's own rate table -- which cost drivers apply here and what they cost. A product only lists the attributes that actually apply to it. */
  attributes: PricingAttribute[];
  /** This product's contrast rules, if it has any region pairs where color difference is a real, priced cost driver. */
  contrastRules?: ContrastRule[];
  /** Extra cents for using this SPECIFIC palette color on this product, keyed by PaletteColor.id -- e.g. a specialty filament that costs more to buy, independent of any attribute count. Admin-set, never computed. */
  colorMarkupCents?: Record<string, number>;
}

/**
 * The full pricing document -- one PricingRules per product, plus a shared
 * attribute library new products can start from (never required -- a
 * product's own `attributes` list is authoritative for itself). "suggested"
 * until a human approves it; this package never flips `status` itself, and
 * never treats any shipped number as an approved price.
 */
export interface PricingDocument {
  status: string;
  currency: string;
  products: Record<string, PricingRules>;
  /** Reusable attribute definitions a new product's own `attributes` list can copy from -- purely a convenience library, never consulted automatically by resolvePrice. */
  attributeLibrary?: PricingAttribute[];
}

/**
 * One shopper's concrete choices, priced by resolvePrice. `attributeCounts`
 * is supplied by the caller for whichever cost drivers it already knows how
 * to count (e.g. distinct colors beyond the first, distinct silk colors,
 * whether a custom name was entered) -- this package adds to it
 * automatically only for `rules.contrastRules` matches, since those need
 * `colors` to evaluate and nothing else can do it without duplicating that
 * logic. `colors` is also used for `colorMarkupCents` lookups.
 */
export interface PriceBuild {
  finish: string;
  attributeCounts?: Record<string, number>;
  /**
   * regionId -> the resolved palette color id (or raw hex, for a
   * free-picked color) actually used -- drives contrastRules and
   * colorMarkupCents. MUST be each region's EFFECTIVE color (this
   * package's own resolveEffectiveColor/CustomizationService.
   * resolveEffectiveColors output), never the shopper's raw
   * CustomizationSelection -- passing raw picks can misfire a contrast
   * rule for a locked region whose raw value happens to differ from a
   * sibling's even though both resolve to the same effective color
   * under the current finish (caught in a real integration; see
   * ContrastRule's own doc comment).
   */
  colors?: Record<string, string>;
}

/** Adapter pattern, as everywhere else in this codebase. Keyed by productId; one PricingRules document per product, no separate global/override layering -- "fully customizable across the board" means every product's formula stands on its own. */
export interface PricingRulesRepository {
  get(productId: string): Promise<PricingRules | null>;
  save(productId: string, rules: PricingRules): Promise<void>;
  list(): Promise<Record<string, PricingRules>>;
}

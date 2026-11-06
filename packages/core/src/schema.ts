/**
 * Core commerce schema. Types only -- see docs/subsystems/00-core-schema.md.
 * No subsystem may fork or duplicate these shapes; every subsystem's own entities
 * (Cart, Order, Category, ...) live in that subsystem's own package and reference
 * these types by id, never by re-declaring them.
 */

export type AttributeValue = string | number | boolean;

/** A single identifying-attribute key/value pair that, combined with others, defines a SKU. */
export interface IdentifyingAttribute {
  key: string;
  value: AttributeValue;
}

export type ProductStatus = "draft" | "active" | "archived";

/**
 * sku-availability-status epic: whether a specific purchasable unit (a Sku
 * today; shared here in core, not forked per-package, since
 * @mercatus-liber/customization's own PaletteColor/FinishTier need the
 * identical three-state concept for the same reason) can currently be
 * selected. Deliberately NOT the same concept as ProductStatus
 * (draft/active/archived) -- that's a catalog publishing-workflow state
 * ("is this listed at all"); AvailabilityStatus is "can a shopper pick
 * this specific thing right now," which an `active` (published) Sku can
 * independently be any of:
 * - "active" (the default -- a missing/undefined value means this, so
 *   every pre-existing Sku that predates this field needs no migration):
 *   offered normally.
 * - "discontinued": no longer offered -- a consumer must show it grayed
 *   out and NOT selectable (never simply hidden; a returning buyer who
 *   bought it before should still see it existed and why it's gone, not
 *   get a silent 404-shaped gap in a product's option list).
 * - "request": not currently stocked, but a shopper can still select it
 *   "on request" -- a consumer must capture that request with the order
 *   (e.g. a flag/note on the resulting OrderLineItem) rather than
 *   silently treating it the same as a normal in-stock selection.
 *
 * Ported from a real, live reference implementation (dostal-3d-printing's
 * color-regions.json manifest v2 and its reference editor), not invented
 * from scratch -- the exact three-state vocabulary and semantics above
 * are copied from that manifest's own `statuses`/`rules.status` blocks.
 */
export type AvailabilityStatus = "active" | "discontinued" | "request";

/**
 * A single product photo. `url` is the raw source reference (an external
 * URL, a CDN asset path, whatever the merchant's real image host uses) --
 * this schema deliberately does NOT bake in any provider's own delivery/
 * transform URL shape (Cloudinary, imgix, a plain file host, ...). Turning
 * `url` into an actual optimized delivery URL (resized, format-converted,
 * CDN-fronted) is the image-CDN epic's job: @mercatus-liber/media's
 * ImageAdapter.resolveUrl() is the one place that happens, mirroring how
 * PaymentAdapter/ShippingAdapter/etc. keep provider-specific shape out of
 * core (see this file's own header comment).
 */
export interface ProductImage {
  url: string;
  /** Required, not optional -- every rendered <img> needs real alt text; there's no honest default to fall back to. */
  alt: string;
}

/**
 * A single product video (e.g. a demo or teardown video). Same "raw source
 * reference, no provider delivery shape baked in" discipline as
 * ProductImage.url -- a direct file URL or a host's embeddable page URL
 * (YouTube, Vimeo, ...), left for a consumer to resolve/embed.
 */
export interface ProductVideo {
  url: string;
  /** Required, not optional -- same reasoning as ProductImage.alt: no honest default exists. */
  title: string;
}

export interface Product {
  id: string;
  slug: string;
  title: string;
  description: string;
  /**
   * Which attribute keys are "identifying" (combine to define a SKU) for this
   * product. Different products may use entirely different identifying-attribute
   * sets -- nothing here assumes a universal color/size schema.
   */
  identifyingAttributeKeys: string[];
  status: ProductStatus;
  /**
   * image-cdn epic: optional and additive -- absent (or an empty array) for
   * any product that predates this field or was never given photos, which
   * every existing call site (every seed file, every persistence adapter
   * row that predates this column) still produces, so this is zero
   * regression. `images[0]`, when present, is the primary/hero photo; any
   * further entries are additional gallery photos in display order.
   */
  images?: ProductImage[];
  /**
   * product-media-attribution epic: optional and additive, same zero-
   * regression discipline as images? above -- absent for every product
   * that predates this field or has no video. One-or-more, same
   * cardinality as images (a demo video, a teardown video, ... may all
   * apply to one product).
   */
  videos?: ProductVideo[];
  /**
   * product-media-attribution epic: optional and additive. A single
   * canonical 3D-model-viewer URL for this product -- a raw source
   * reference (a .glb/.gltf file, or any iframe-embeddable viewer page),
   * same "no provider delivery shape baked in" discipline as
   * ProductImage.url. Singular, not an array like images/videos -- nothing
   * has asked for more than one 3D model per product.
   */
  viewerUrl?: string;
  /**
   * product-media-attribution epic: optional and additive. A short,
   * free-text license/attribution line (e.g. "Self-modeled, owned --
   * OSS/CC-BY", "MakerWorld, personal use only"). Never defaulted/invented
   * by any seed or adapter -- absent until a real caller sets it.
   */
  license?: string;
}

export interface Sku {
  id: string;
  productId: string;
  /** Must contain exactly one entry per key in the parent product's identifyingAttributeKeys. */
  identifyingAttributes: IdentifyingAttribute[];
  price: Money;
  status: ProductStatus;
  /**
   * sku-images epic: optional and additive, same zero-regression discipline
   * as Product.images -- absent for every SKU that predates this field or
   * was never given its own photo. Only needed when a SKU's identifying
   * attribute is itself visual (lens color, fabric color, finish) and the
   * shopper needs to see the actual variant, not just the product's shared
   * gallery -- the common case (e.g. a size-only SKU) never sets this. A
   * consumer (e.g. a PDP's variant picker) falls back to the parent
   * Product's own images when a given SKU has none of its own; this field
   * never requires every SKU of a product to have one. `images[0]`, when
   * present, is this SKU's primary/hero photo, same convention as
   * Product.images[0].
   */
  images?: ProductImage[];
  /**
   * sku-availability-status epic: optional and additive, same zero-
   * regression discipline as images above -- absent (meaning "active")
   * for every SKU that predates this field. See AvailabilityStatus's own
   * doc comment for the full three-state contract. Deliberately separate
   * from `status` (ProductStatus) above -- a Sku can be ProductStatus
   * "active" (published, listed) while its AvailabilityStatus is
   * "discontinued" or "request" at the same time; the two axes are
   * independent.
   */
  availabilityStatus?: AvailabilityStatus;
  /** Shown to the shopper alongside a non-"active" availabilityStatus -- e.g. "Out of this filament until next restock." Never defaulted/invented; absent until a real caller sets it. */
  availabilityNote?: string;
}

export interface Money {
  /** Minor units (e.g. cents) -- never a float. */
  amount: number;
  /** ISO 4217 currency code. */
  currency: string;
}

/**
 * The full, descriptive attribute map -- separate from identifying attributes.
 * Feeds search/facet UIs (see docs/subsystems/03-search.md). A key may appear in
 * both this map and a product's identifyingAttributeKeys; the two concepts are
 * independent even when they share a namespace.
 */
/** One choice on a customized line that isn't stocked normally, so fulfillment must handle it by hand before the line can ship. */
export interface LineCustomizationRequest {
  kind: "option" | "color" | "finish" | "artStyle";
  /** The choice id, palette color id, finish id, or art style id requested. */
  id: string;
  /** Where it applies: the option id or region id. Absent for a finish or art style. */
  at?: string;
}

/**
 * What a shopper chose for one made-to-order cart or order line, as data rather
 * than display text, so an order can become a print job without parsing a note.
 * A snapshot: it stays correct if the product's options or palette change later.
 * Produced by @mercatus-liber/customization and carried by cart and
 * checkout-orders, which is why it lives here.
 */
export interface LineCustomization {
  finish: string;
  /** The finish's color mode when ordered, which decides how `colors` becomes a print job. */
  colorMode: "single" | "palette" | "any";
  /** Region id -> effective color: a palette id, or a lowercase hex for a free-picked color. Only regions this version has. */
  colors: Record<string, string>;
  /** The picks that applied, with inapplicable ones already removed. */
  picks?: Record<string, string>;
  variant?: string;
  artStyle?: string;
  /** The shopper's personalization text. */
  name?: string;
  font?: string;
  /** Lettering sizes, passed through to the print job, which validates them. */
  lettering?: Record<string, unknown>;
  /** Choices to handle by hand. See LineCustomizationRequest. */
  requests?: LineCustomizationRequest[];
  /** This line needs a quote, so checkout refuses it at its listed price. */
  quoteRequired?: boolean;
}

export interface ProductAttribute {
  productId: string;
  key: string;
  value: AttributeValue | AttributeValue[];
  /** Should search/filter UIs expose this attribute as a facet? */
  facetable: boolean;
}

/**
 * The minimal shape other subsystems need to reference a category by id, without
 * depending on marketing-catalog's full Category entity (which lives in that
 * subsystem's own package -- see docs/subsystems/02-marketing-catalog.md).
 */
export interface CategoryRef {
  id: string;
  slug: string;
}

export interface ProductFilter {
  status?: ProductStatus;
  slug?: string;
}

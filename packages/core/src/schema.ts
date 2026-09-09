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
}

export interface Sku {
  id: string;
  productId: string;
  /** Must contain exactly one entry per key in the parent product's identifyingAttributeKeys. */
  identifyingAttributes: IdentifyingAttribute[];
  price: Money;
  status: ProductStatus;
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

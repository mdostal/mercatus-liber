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

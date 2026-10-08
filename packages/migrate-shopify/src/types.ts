import type { Product, Sku } from "@mercatus-liber/core";
import type { ShopifyProductNode, ShopifyVariantNode } from "@mercatus-liber/adapter-shopify";
import type { ShopifyConnection } from "./pagination.js";

/**
 * Shopify's `InventoryLevel` (verified against shopify.dev's current
 * Admin GraphQL object reference, see inventory.ts for the full citation
 * and the multi-location decision this feeds into).
 */
export interface ShopifyInventoryLevelNode {
  location: { id: string; name: string };
  quantities: { name: string; quantity: number }[];
}

/** A `ProductVariant` node, extended with the inventory connection this tool also needs (adapter-shopify's own `ShopifyVariantNode` doesn't fetch inventory -- the live-wrapper adapter never needed a point-in-time snapshot of it). */
export interface ShopifyVariantNodeWithInventory extends ShopifyVariantNode {
  inventoryItem: {
    id: string;
    inventoryLevels: ShopifyConnection<ShopifyInventoryLevelNode>;
  };
}

/** A `Product` node, extended with its first page of variants (adapter-shopify fetches variants via a separate query; this tool's products query fetches them inline since a one-time bulk export wants fewer round trips). */
export interface ShopifyProductNodeWithVariants extends ShopifyProductNode {
  variants: ShopifyConnection<ShopifyVariantNodeWithInventory>;
}

export interface ShopifyCollectionNode {
  id: string;
  handle: string;
  title: string;
  description: string;
  descriptionHtml: string;
  products: ShopifyConnection<{ handle: string }>;
}

/**
 * Per-location inventory, never dropped even though the native model below
 * collapses to one number -- see inventory.ts's `summarizeInventory` for the
 * full rationale.
 */
export interface LocationInventory {
  locationId: string;
  locationName: string;
  /** Shopify's "on_hand" quantity state at this one location. */
  onHand: number;
  /** Shopify's "available" quantity state at this one location (on_hand minus committed/reserved/damaged/etc). */
  available: number;
}

export interface VariantInventorySnapshot {
  /** The value this tool recommends seeding into the native single-location `StockLevel.onHand` for this SKU -- see inventory.ts. */
  onHand: number;
  /** The real per-location breakdown behind that number, for review/disclosure -- not persisted by the native single-location inventory model, but never silently discarded either. */
  locations: LocationInventory[];
}

export interface ImportedVariant {
  /** Shopify's own GID for this variant, kept for traceability even though `sku.id` is what the mapped core shape uses (see adapter-shopify/mapping.ts's id-bridging convention, reused here). */
  shopifyVariantId: string;
  sku: Sku;
  inventory: VariantInventorySnapshot;
}

export interface ImportedProduct {
  shopifyProductId: string;
  product: Product;
  variants: ImportedVariant[];
}

export interface ImportedCollection {
  shopifyCollectionId: string;
  title: string;
  handle: string;
  description: string;
  descriptionHtml: string;
  /** Every product handle assigned to this collection, fully paginated -- the later write-path epic uses this to call marketing-catalog's assignProductToCategory. */
  productHandles: string[];
}

export interface ShopifyCatalogSnapshot {
  products: ImportedProduct[];
  collections: ImportedCollection[];
}

/**
 * @mercatus-liber/migrate-shopify -- the one-time Shopify-to-native
 * migration tool (epic shopify-migration-import-tool). Distinct from
 * @mercatus-liber/adapter-shopify, which is a LIVE WRAPPER that proxies
 * every catalog read/write through Shopify's API forever: a merchant using
 * that package is still fully hosted on Shopify. This package instead reads
 * a merchant's existing Shopify store exactly once and is meant to feed the
 * result into Mercatus Liber's own native persistence, so the merchant can
 * actually leave Shopify.
 *
 * This slice is the read side only: everything exported here reads from
 * Shopify and returns structured data. Nothing here writes to Shopify or to
 * Mercatus Liber's native persistence -- the write/import path is separate,
 * later work (see .pHive/epics/shopify-migration-import-tool/docs/
 * design-discussion.md).
 */

export { SHOPIFY_API_VERSION } from "./api-version.js";
export { readAllCollections, type ReadCollectionsOptions } from "./collections.js";
export { summarizeInventory } from "./inventory.js";
export { drainConnection, drainRemainingPages, type ShopifyConnection, type ShopifyPageInfo } from "./pagination.js";
export { readAllProducts, type ReadProductsOptions } from "./products.js";
export { readShopifyCatalog, type ReadShopifyCatalogOptions } from "./read-catalog.js";
export type {
  ImportedCollection,
  ImportedProduct,
  ImportedVariant,
  LocationInventory,
  ShopifyCatalogSnapshot,
  ShopifyCollectionNode,
  ShopifyInventoryLevelNode,
  ShopifyProductNodeWithVariants,
  ShopifyVariantNodeWithInventory,
  VariantInventorySnapshot,
} from "./types.js";

// Re-exported so a caller of this package never also has to depend directly
// on @mercatus-liber/adapter-shopify just to construct a client to pass in.
export { createGraphQLClient, type GraphQLClient, type ShopifyAdapterConfig } from "@mercatus-liber/adapter-shopify";

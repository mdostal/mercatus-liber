/**
 * @mercatus-liber/migrate-shopify -- the one-time Shopify-to-native
 * migration tool (epic shopify-migration-import-tool). Distinct from
 * @mercatus-liber/adapter-shopify, which is a LIVE WRAPPER that proxies
 * every catalog read/write through Shopify's API forever: a merchant using
 * that package is still fully hosted on Shopify. This package instead reads
 * a merchant's existing Shopify store exactly once (read-catalog.ts) and
 * writes the result into Mercatus Liber's own native persistence
 * (write-catalog.ts), through the real CatalogService/
 * MarketingCatalogService/InventoryAdapter only, so the merchant can
 * actually leave Shopify.
 *
 * `importShopifyCatalog` defaults to dry-run (reports what would happen,
 * writes nothing) and is safe to re-run (check-by-slug/check-by-
 * identifying-attributes before every create, mirroring apps/reference-
 * storefront/lib/idempotent-seed.ts's upsert pattern).
 *
 * Out of scope for this first pass, disclosed plainly rather than silently
 * dropped -- see this package's README:
 *   - Orders, customers, and historical sales data.
 *   - Images/media (Shopify product photos are read nowhere in
 *     read-catalog.ts and written nowhere in write-catalog.ts).
 *   - Shopify theme/storefront content.
 */

export { SHOPIFY_API_VERSION } from "./api-version.js";
export { readAllCollections, type ReadCollectionsOptions } from "./collections.js";
export { summarizeInventory } from "./inventory.js";
export { drainConnection, drainRemainingPages, type ShopifyConnection, type ShopifyPageInfo } from "./pagination.js";
export { readAllProducts, type ReadProductsOptions } from "./products.js";
export { readShopifyCatalog, type ReadShopifyCatalogOptions } from "./read-catalog.js";
export { createTargetPersistence, type MigrationTarget, type TargetPersistence } from "./targets.js";
export {
  importShopifyCatalog,
  type AttentionItem,
  type AttentionKind,
  type ImportCounts,
  type ImportReport,
  type ImportShopifyCatalogDeps,
  type ImportShopifyCatalogOptions,
} from "./write-catalog.js";
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

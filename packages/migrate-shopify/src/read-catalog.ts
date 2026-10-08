import type { GraphQLClient } from "@mercatus-liber/adapter-shopify";
import { readAllCollections, type ReadCollectionsOptions } from "./collections.js";
import { readAllProducts, type ReadProductsOptions } from "./products.js";
import type { ShopifyCatalogSnapshot } from "./types.js";

export type ReadShopifyCatalogOptions = ReadProductsOptions & ReadCollectionsOptions;

/**
 * Reads a merchant's entire Shopify catalog (products, variants, inventory,
 * collections) in one call. This is the one-time read side of the
 * Shopify-to-native migration tool -- it returns an in-memory snapshot and
 * writes nothing. Feeding that snapshot into Mercatus Liber's own
 * persistence (via CatalogService/MarketingCatalogService/the inventory
 * adapter, with dry-run and idempotent-upsert support) is separate, later
 * work -- see .pHive/epics/shopify-migration-import-tool/docs/
 * design-discussion.md.
 */
export async function readShopifyCatalog(client: GraphQLClient, options: ReadShopifyCatalogOptions = {}): Promise<ShopifyCatalogSnapshot> {
  const [products, collections] = await Promise.all([readAllProducts(client, options), readAllCollections(client, options)]);
  return { products, collections };
}

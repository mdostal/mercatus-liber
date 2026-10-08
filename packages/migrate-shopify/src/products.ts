import { productNodeToProduct, variantNodeToSku, type GraphQLClient } from "@mercatus-liber/adapter-shopify";
import { drainConnection, drainRemainingPages, type ShopifyConnection } from "./pagination.js";
import { summarizeInventory } from "./inventory.js";
import { INVENTORY_LEVELS_PAGE_QUERY, productVariantsPageQuery, productsQuery } from "./queries.js";
import type {
  ImportedProduct,
  ImportedVariant,
  ShopifyInventoryLevelNode,
  ShopifyProductNodeWithVariants,
  ShopifyVariantNodeWithInventory,
} from "./types.js";

export interface ReadProductsOptions {
  /**
   * Shop currency code. Shopify's `ProductVariant.price` field is a bare
   * decimal string with no currency of its own (a shop has exactly one
   * currency) -- mirrors adapter-shopify's own `currency` config
   * convention (see packages/adapter-shopify/src/index.ts) rather than
   * inventing a second one. Defaults to "USD".
   */
  currency?: string;
  /**
   * Page size for the top-level `products` connection. Defaults to 250,
   * Shopify's own max page size (matching adapter-shopify's convention of
   * requesting `first: 250`). Tests pass a small value to exercise real
   * multi-page cursor pagination against a small fixture.
   */
  productsPageSize?: number;
  /** Page size for each product's `variants` connection. Defaults to 250. */
  variantsPageSize?: number;
  /** Page size for each variant's `inventoryItem.inventoryLevels` connection. Defaults to 50 -- most stores have far fewer locations than that, but this is still fully paginated if a store ever exceeds it. */
  inventoryLevelsPageSize?: number;
}

const DEFAULTS = {
  currency: "USD",
  productsPageSize: 250,
  variantsPageSize: 250,
  inventoryLevelsPageSize: 50,
} as const;

/**
 * Reads every product -- and every one of its variants, and every variant's
 * current inventory across every Shopify location -- out of a Shopify
 * store. Fully cursor-paginated at all three levels (products, variants,
 * inventory levels), reusing adapter-shopify's real, already-tested
 * `productNodeToProduct`/`variantNodeToSku` field mapping rather than
 * duplicating it.
 *
 * Read-only: issues no mutations and writes nothing into Mercatus Liber's
 * own persistence. Returning structured data for a later, separate
 * write-path tool to consume is the entire point of this slice (see this
 * epic's design-discussion.md).
 */
export async function readAllProducts(client: GraphQLClient, options: ReadProductsOptions = {}): Promise<ImportedProduct[]> {
  const currency = options.currency ?? DEFAULTS.currency;
  const productsPageSize = options.productsPageSize ?? DEFAULTS.productsPageSize;
  const variantsPageSize = options.variantsPageSize ?? DEFAULTS.variantsPageSize;
  const inventoryLevelsPageSize = options.inventoryLevelsPageSize ?? DEFAULTS.inventoryLevelsPageSize;

  const query = productsQuery(variantsPageSize, inventoryLevelsPageSize);
  const variantsPageQuery = productVariantsPageQuery(inventoryLevelsPageSize);
  const productNodes = await drainConnection<ShopifyProductNodeWithVariants>((cursor) =>
    client
      .request<{ products: ShopifyConnection<ShopifyProductNodeWithVariants> }>(query, { first: productsPageSize, after: cursor })
      .then((data) => data.products),
  );

  const imported: ImportedProduct[] = [];
  for (const productNode of productNodes) {
    const product = productNodeToProduct(productNode);
    const parentStatus = product.status;

    const extraVariantNodes = await drainRemainingPages(productNode.variants.pageInfo, (cursor) =>
      client
        .request<{ product: { variants: ShopifyConnection<ShopifyVariantNodeWithInventory> } }>(variantsPageQuery, {
          id: productNode.id,
          first: variantsPageSize,
          after: cursor,
        })
        .then((data) => data.product.variants),
    );
    const allVariantNodes = [...productNode.variants.nodes, ...extraVariantNodes];

    const variants: ImportedVariant[] = [];
    for (const variantNode of allVariantNodes) {
      const sku = variantNodeToSku(variantNode, product.id, currency, parentStatus);

      const extraLevelNodes = await drainRemainingPages(variantNode.inventoryItem.inventoryLevels.pageInfo, (cursor) =>
        client
          .request<{ inventoryItem: { inventoryLevels: ShopifyConnection<ShopifyInventoryLevelNode> } }>(INVENTORY_LEVELS_PAGE_QUERY, {
            id: variantNode.inventoryItem.id,
            first: inventoryLevelsPageSize,
            after: cursor,
          })
          .then((data) => data.inventoryItem.inventoryLevels),
      );
      const allLevelNodes = [...variantNode.inventoryItem.inventoryLevels.nodes, ...extraLevelNodes];

      variants.push({
        shopifyVariantId: variantNode.id,
        sku,
        inventory: summarizeInventory(allLevelNodes),
      });
    }

    imported.push({ shopifyProductId: productNode.id, product, variants });
  }

  return imported;
}

import type { GraphQLClient } from "@mercatus-liber/adapter-shopify";
import { drainConnection, drainRemainingPages, type ShopifyConnection } from "./pagination.js";
import { COLLECTION_PRODUCTS_PAGE_QUERY, collectionsQuery } from "./queries.js";
import type { ImportedCollection, ShopifyCollectionNode } from "./types.js";

export interface ReadCollectionsOptions {
  /** Page size for the top-level `collections` connection. Defaults to 250. */
  collectionsPageSize?: number;
  /** Page size for each collection's `products` connection (its member products, by handle). Defaults to 250. */
  collectionProductsPageSize?: number;
}

const DEFAULTS = {
  collectionsPageSize: 250,
  collectionProductsPageSize: 250,
} as const;

/**
 * Reads every collection -- and the full, fully-paginated list of product
 * handles assigned to it -- out of a Shopify store. There is no existing
 * mapping for collections in adapter-shopify (that package's
 * CatalogPersistenceAdapter surface is products/SKUs/attributes only, with
 * no marketing-catalog awareness), so this returns a plain structured shape
 * rather than a core/marketing-catalog `Category` -- turning a
 * `ImportedCollection` into a real `Category` + `assignProductToCategory`
 * calls is the later write-path tool's job (see this epic's
 * design-discussion.md), not this read-only slice's.
 */
export async function readAllCollections(client: GraphQLClient, options: ReadCollectionsOptions = {}): Promise<ImportedCollection[]> {
  const collectionsPageSize = options.collectionsPageSize ?? DEFAULTS.collectionsPageSize;
  const collectionProductsPageSize = options.collectionProductsPageSize ?? DEFAULTS.collectionProductsPageSize;

  const query = collectionsQuery(collectionProductsPageSize);
  const collectionNodes = await drainConnection<ShopifyCollectionNode>((cursor) =>
    client
      .request<{ collections: ShopifyConnection<ShopifyCollectionNode> }>(query, { first: collectionsPageSize, after: cursor })
      .then((data) => data.collections),
  );

  const imported: ImportedCollection[] = [];
  for (const node of collectionNodes) {
    const extraProductNodes = await drainRemainingPages(node.products.pageInfo, (cursor) =>
      client
        .request<{ collection: { products: ShopifyConnection<{ handle: string }> } }>(COLLECTION_PRODUCTS_PAGE_QUERY, {
          id: node.id,
          first: collectionProductsPageSize,
          after: cursor,
        })
        .then((data) => data.collection.products),
    );
    const productHandles = [...node.products.nodes, ...extraProductNodes].map((p) => p.handle);

    imported.push({
      shopifyCollectionId: node.id,
      title: node.title,
      handle: node.handle,
      description: node.description,
      descriptionHtml: node.descriptionHtml,
      productHandles,
    });
  }

  return imported;
}

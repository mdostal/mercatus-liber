import { EXTERNAL_ID_KEY, EXTERNAL_ID_NAMESPACE } from "@mercatus-liber/adapter-shopify";

/**
 * GraphQL query strings against Shopify's Admin API, verified field-by-field
 * on 2026-10-07 directly against shopify.dev's current object references
 * for Product, ProductVariant, Collection, InventoryLevel and InventoryItem
 * (see api-version.ts and inventory.ts for the specific pages cited) -- not
 * assumed from training data. Field fragments are shared between a
 * connection's first page (fetched inline, nested under its parent) and that
 * connection's own follow-up pages (fetched standalone once `pageInfo.
 * hasNextPage` says there's more), so the exact same shape is always
 * requested regardless of which query issues it.
 *
 * Re-uses adapter-shopify's own `EXTERNAL_ID_NAMESPACE`/`EXTERNAL_ID_KEY`
 * metafield convention (rather than inventing a second one) so a product
 * that was previously round-tripped through the live-wrapper adapter -- or
 * will be migrated and later re-synced through it -- resolves to the same
 * caller-assigned id either way.
 */

const METAFIELD_FIELD = `metafield(namespace: "${EXTERNAL_ID_NAMESPACE}", key: "${EXTERNAL_ID_KEY}") { value }`;

export const INVENTORY_LEVEL_FIELDS = `
  location { id name }
  quantities(names: ["on_hand", "available"]) { name quantity }
`;

export const VARIANT_FIELDS = (inventoryLevelsPageSize: number) => `
  id
  price
  selectedOptions { name value }
  ${METAFIELD_FIELD}
  inventoryItem {
    id
    inventoryLevels(first: ${inventoryLevelsPageSize}) {
      nodes { ${INVENTORY_LEVEL_FIELDS} }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const PRODUCT_FIELDS = (variantsPageSize: number, inventoryLevelsPageSize: number) => `
  id
  handle
  title
  descriptionHtml
  status
  options { name }
  ${METAFIELD_FIELD}
  variants(first: ${variantsPageSize}) {
    nodes { ${VARIANT_FIELDS(inventoryLevelsPageSize)} }
    pageInfo { hasNextPage endCursor }
  }
`;

export const COLLECTION_PRODUCT_FIELDS = `handle`;

export const COLLECTION_FIELDS = (collectionProductsPageSize: number) => `
  id
  handle
  title
  description
  descriptionHtml
  products(first: ${collectionProductsPageSize}) {
    nodes { ${COLLECTION_PRODUCT_FIELDS} }
    pageInfo { hasNextPage endCursor }
  }
`;

export function productsQuery(variantsPageSize: number, inventoryLevelsPageSize: number): string {
  return `query MigrateShopifyProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      nodes { ${PRODUCT_FIELDS(variantsPageSize, inventoryLevelsPageSize)} }
      pageInfo { hasNextPage endCursor }
    }
  }`;
}

export function productVariantsPageQuery(inventoryLevelsPageSize: number): string {
  return `query MigrateShopifyProductVariantsPage($id: ID!, $first: Int!, $after: String) {
    product(id: $id) {
      variants(first: $first, after: $after) {
        nodes { ${VARIANT_FIELDS(inventoryLevelsPageSize)} }
        pageInfo { hasNextPage endCursor }
      }
    }
  }`;
}

export const INVENTORY_LEVELS_PAGE_QUERY = `query MigrateShopifyInventoryLevelsPage($id: ID!, $first: Int!, $after: String) {
  inventoryItem(id: $id) {
    inventoryLevels(first: $first, after: $after) {
      nodes { ${INVENTORY_LEVEL_FIELDS} }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

export function collectionsQuery(collectionProductsPageSize: number): string {
  return `query MigrateShopifyCollections($first: Int!, $after: String) {
    collections(first: $first, after: $after) {
      nodes { ${COLLECTION_FIELDS(collectionProductsPageSize)} }
      pageInfo { hasNextPage endCursor }
    }
  }`;
}

export const COLLECTION_PRODUCTS_PAGE_QUERY = `query MigrateShopifyCollectionProductsPage($id: ID!, $first: Int!, $after: String) {
  collection(id: $id) {
    products(first: $first, after: $after) {
      nodes { ${COLLECTION_PRODUCT_FIELDS} }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

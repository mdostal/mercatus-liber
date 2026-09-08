import type {
  CatalogPersistenceAdapter,
  Product,
  ProductAttribute,
  ProductAttributeRepository,
  ProductFilter,
  ProductRepository,
  Sku,
  SkuRepository,
} from "@mercatus-liber/core";
import { createGraphQLClient, ShopifyGraphQLError, type GraphQLClient, type ShopifyAdapterConfig } from "./graphql-client.js";
import {
  ATTRIBUTE_NAMESPACE,
  attributeToMetafieldValue,
  EXTERNAL_ID_KEY,
  EXTERNAL_ID_NAMESPACE,
  metafieldToAttribute,
  productNodeToProduct,
  productToShopifyInput,
  skuToShopifyVariantInput,
  variantNodeToSku,
  type ShopifyProductNode,
  type ShopifyVariantNode,
} from "./mapping.js";

export type { ShopifyAdapterConfig } from "./graphql-client.js";
export { ShopifyGraphQLError } from "./graphql-client.js";

export class ProductNotFoundInShopifyError extends Error {
  constructor(externalId: string) {
    super(`No Shopify product found for id "${externalId}" -- SKUs/attributes require an already-saved parent product`);
    this.name = "ProductNotFoundInShopifyError";
  }
}

const PRODUCT_FIELDS = `
  id
  handle
  title
  descriptionHtml
  status
  options { name }
  metafield(namespace: "${EXTERNAL_ID_NAMESPACE}", key: "${EXTERNAL_ID_KEY}") { value }
`;

const VARIANT_FIELDS = `
  id
  price
  selectedOptions { name value }
  metafield(namespace: "${EXTERNAL_ID_NAMESPACE}", key: "${EXTERNAL_ID_KEY}") { value }
`;

function assertNoUserErrors(userErrors: { field: string[] | null; message: string }[] | undefined): void {
  if (userErrors && userErrors.length > 0) {
    throw new ShopifyGraphQLError(userErrors.map((e) => e.message).join("; "));
  }
}

async function findShopifyProductNode(client: GraphQLClient, externalId: string): Promise<ShopifyProductNode | null> {
  const data = await client.request<{ products: { nodes: ShopifyProductNode[] } }>(
    `query($query: String!) { products(first: 1, query: $query) { nodes { ${PRODUCT_FIELDS} } } }`,
    { query: `metafields.${EXTERNAL_ID_NAMESPACE}.${EXTERNAL_ID_KEY}:'${externalId}'` },
  );
  return data.products.nodes[0] ?? null;
}

/** The inverse of findShopifyProductNode: given a real Shopify GID, resolves our external id (falling back to the GID itself if the product has no external_id metafield, e.g. a pre-existing Shopify product this adapter never created). */
async function resolveExternalProductId(client: GraphQLClient, shopifyGid: string): Promise<string> {
  const data = await client.request<{ product: { id: string; metafield: { value: string } | null } | null }>(
    `query($id: ID!) { product(id: $id) { id metafield(namespace: "${EXTERNAL_ID_NAMESPACE}", key: "${EXTERNAL_ID_KEY}") { value } } }`,
    { id: shopifyGid },
  );
  return data.product?.metafield?.value ?? shopifyGid;
}

/**
 * Third reference persistence adapter (subsystem 00), backed by Shopify's
 * Admin GraphQL API. Public surface is exactly CatalogPersistenceAdapter --
 * no Shopify-specific type is exported. See
 * .pHive/epics/adapter-shopify/docs/shopify-adapter-mapping.md for the full
 * field mapping and disclosed gaps, including how the caller-assigned
 * Product/Sku ids this interface expects are reconciled with Shopify's own
 * server-assigned GIDs via a reserved metafield.
 */
export function createShopifyAdapter(config: ShopifyAdapterConfig & { currency?: string }): CatalogPersistenceAdapter {
  const client = createGraphQLClient(config);
  const currency = config.currency ?? "USD";

  const products: ProductRepository = {
    async get(id: string): Promise<Product | null> {
      const node = await findShopifyProductNode(client, id);
      return node ? productNodeToProduct(node) : null;
    },

    async getBySlug(slug: string): Promise<Product | null> {
      const data = await client.request<{ productByHandle: ShopifyProductNode | null }>(
        `query($handle: String!) { productByHandle(handle: $handle) { ${PRODUCT_FIELDS} } }`,
        { handle: slug },
      );
      return data.productByHandle ? productNodeToProduct(data.productByHandle) : null;
    },

    async list(filter?: ProductFilter): Promise<Product[]> {
      const clauses: string[] = [];
      if (filter?.status) clauses.push(`status:${filter.status}`);
      if (filter?.slug) clauses.push(`handle:${filter.slug}`);
      const data = await client.request<{ products: { nodes: ShopifyProductNode[] } }>(
        `query($query: String) { products(first: 250, query: $query) { nodes { ${PRODUCT_FIELDS} } } }`,
        { query: clauses.length > 0 ? clauses.join(" ") : undefined },
      );
      return data.products.nodes.map(productNodeToProduct);
    },

    async save(product: Product): Promise<void> {
      const existing = await findShopifyProductNode(client, product.id);
      const input: Record<string, unknown> = { ...productToShopifyInput(product) };
      if (existing) input.id = existing.id;
      const data = await client.request<{ productSet: { userErrors: { field: string[] | null; message: string }[] } }>(
        `mutation($input: ProductSetInput!) { productSet(input: $input) { product { id } userErrors { field message } } }`,
        { input },
      );
      assertNoUserErrors(data.productSet.userErrors);
    },
  };

  const skus: SkuRepository = {
    async get(id: string): Promise<Sku | null> {
      const data = await client.request<{ productVariants: { nodes: (ShopifyVariantNode & { product: { id: string; status: ShopifyProductNode["status"] } })[] } }>(
        `query($query: String!) { productVariants(first: 1, query: $query) { nodes { ${VARIANT_FIELDS} product { id status } } } }`,
        { query: `metafields.${EXTERNAL_ID_NAMESPACE}.${EXTERNAL_ID_KEY}:'${id}'` },
      );
      const node = data.productVariants.nodes[0];
      if (!node) return null;
      const parentExternalId = await resolveExternalProductId(client, node.product.id);
      return variantNodeToSku(node, parentExternalId, currency, node.product.status.toLowerCase() as Product["status"]);
    },

    async listByProduct(productId: string): Promise<Sku[]> {
      const parent = await findShopifyProductNode(client, productId);
      if (!parent) return [];
      const data = await client.request<{ product: { status: ShopifyProductNode["status"]; variants: { nodes: ShopifyVariantNode[] } } | null }>(
        `query($id: ID!) { product(id: $id) { status variants(first: 250) { nodes { ${VARIANT_FIELDS} } } } }`,
        { id: parent.id },
      );
      if (!data.product) return [];
      const status = data.product.status.toLowerCase() as Product["status"];
      return data.product.variants.nodes.map((node) => variantNodeToSku(node, productId, currency, status));
    },

    async save(sku: Sku): Promise<void> {
      const parent = await findShopifyProductNode(client, sku.productId);
      if (!parent) throw new ProductNotFoundInShopifyError(sku.productId);

      const variantsData = await client.request<{ product: { variants: { nodes: ShopifyVariantNode[] } } }>(
        `query($id: ID!) { product(id: $id) { variants(first: 250) { nodes { ${VARIANT_FIELDS} } } } }`,
        { id: parent.id },
      );
      const existing = variantsData.product.variants.nodes.find((n) => n.metafield?.value === sku.id);

      const variantInput = skuToShopifyVariantInput(sku);
      if (existing) {
        const data = await client.request<{ productVariantsBulkUpdate: { userErrors: { field: string[] | null; message: string }[] } }>(
          `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) { productVariantsBulkUpdate(productId: $productId, variants: $variants) { productVariants { id } userErrors { field message } } }`,
          { productId: parent.id, variants: [{ id: existing.id, ...variantInput }] },
        );
        assertNoUserErrors(data.productVariantsBulkUpdate.userErrors);
      } else {
        const data = await client.request<{ productVariantsBulkCreate: { userErrors: { field: string[] | null; message: string }[] } }>(
          `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) { productVariantsBulkCreate(productId: $productId, variants: $variants) { productVariants { id } userErrors { field message } } }`,
          { productId: parent.id, variants: [variantInput] },
        );
        assertNoUserErrors(data.productVariantsBulkCreate.userErrors);
      }
    },
  };

  const attributes: ProductAttributeRepository = {
    async listByProduct(productId: string): Promise<ProductAttribute[]> {
      const parent = await findShopifyProductNode(client, productId);
      if (!parent) return [];
      const data = await client.request<{ product: { metafields: { nodes: { key: string; value: string }[] } } | null }>(
        `query($id: ID!) { product(id: $id) { metafields(namespace: "${ATTRIBUTE_NAMESPACE}", first: 250) { nodes { key value } } } }`,
        { id: parent.id },
      );
      if (!data.product) return [];
      return data.product.metafields.nodes.map((node) => metafieldToAttribute(productId, node.key, node));
    },

    async save(attribute: ProductAttribute): Promise<void> {
      const parent = await findShopifyProductNode(client, attribute.productId);
      if (!parent) throw new ProductNotFoundInShopifyError(attribute.productId);
      const data = await client.request<{ metafieldsSet: { userErrors: { field: string[] | null; message: string }[] } }>(
        `mutation($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { metafields { id } userErrors { field message } } }`,
        { metafields: [{ ownerId: parent.id, namespace: ATTRIBUTE_NAMESPACE, key: attribute.key, type: "json", value: attributeToMetafieldValue(attribute) }] },
      );
      assertNoUserErrors(data.metafieldsSet.userErrors);
    },

    async remove(productId: string, key: string): Promise<void> {
      const parent = await findShopifyProductNode(client, productId);
      if (!parent) return;
      const data = await client.request<{ metafieldsDelete: { userErrors: { field: string[] | null; message: string }[] } }>(
        `mutation($metafields: [MetafieldIdentifierInput!]!) { metafieldsDelete(metafields: $metafields) { deletedMetafields { key } userErrors { field message } } }`,
        { metafields: [{ ownerId: parent.id, namespace: ATTRIBUTE_NAMESPACE, key }] },
      );
      assertNoUserErrors(data.metafieldsDelete.userErrors);
    },
  };

  return { products, skus, attributes };
}

import type { AttributeValue, IdentifyingAttribute, Product, ProductAttribute, ProductStatus, Sku } from "@mercatus-liber/core";

/**
 * Field mapping between Shopify's Admin GraphQL shapes and core types --
 * see .pHive/epics/adapter-shopify/docs/shopify-adapter-mapping.md for the
 * full table and disclosed gaps. Pure functions only, no I/O.
 */

/** Reserved metafield namespace bridging Shopify's own GID assignment with our caller-assigned ids (see the mapping doc's "Product ↔ Shopify Product" design decision). */
export const EXTERNAL_ID_NAMESPACE = "mercatus_liber";
export const EXTERNAL_ID_KEY = "external_id";
/** A separate namespace for ProductAttribute data, distinct from the id-bookkeeping metafield above. */
export const ATTRIBUTE_NAMESPACE = "mercatus_liber_attr";

export interface ShopifyMetafieldValue {
  value: string;
}

export interface ShopifyProductNode {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string;
  status: "ACTIVE" | "ARCHIVED" | "DRAFT";
  options: { name: string }[];
  metafield: ShopifyMetafieldValue | null;
}

export interface ShopifyVariantNode {
  id: string;
  price: string;
  selectedOptions: { name: string; value: string }[];
  metafield: ShopifyMetafieldValue | null;
}

export function productNodeToProduct(node: ShopifyProductNode): Product {
  return {
    id: node.metafield?.value ?? node.id,
    slug: node.handle,
    title: node.title,
    description: node.descriptionHtml,
    identifyingAttributeKeys: node.options.map((o) => o.name.toLowerCase()),
    status: node.status.toLowerCase() as ProductStatus,
  };
}

export function productToShopifyInput(product: Product): Record<string, unknown> {
  return {
    title: product.title,
    handle: product.slug,
    descriptionHtml: product.description,
    status: product.status.toUpperCase(),
    productOptions: product.identifyingAttributeKeys.map((key) => ({ name: key })),
    metafields: [{ namespace: EXTERNAL_ID_NAMESPACE, key: EXTERNAL_ID_KEY, type: "single_line_text_field", value: product.id }],
  };
}

/** Variants inherit their parent product's status -- Shopify has no independent per-variant status (disclosed gap, see the mapping doc). */
export function variantNodeToSku(node: ShopifyVariantNode, productId: string, currency: string, parentStatus: ProductStatus): Sku {
  return {
    id: node.metafield?.value ?? node.id,
    productId,
    identifyingAttributes: node.selectedOptions.map((o): IdentifyingAttribute => ({ key: o.name.toLowerCase(), value: o.value })),
    price: { amount: Math.round(Number.parseFloat(node.price) * 100), currency },
    status: parentStatus,
  };
}

export function skuToShopifyVariantInput(sku: Sku): Record<string, unknown> {
  return {
    price: (sku.price.amount / 100).toFixed(2),
    optionValues: sku.identifyingAttributes.map((attr) => ({ optionName: attr.key, name: String(attr.value) })),
    metafields: [{ namespace: EXTERNAL_ID_NAMESPACE, key: EXTERNAL_ID_KEY, type: "single_line_text_field", value: sku.id }],
  };
}

interface StoredAttributePayload {
  value: AttributeValue | AttributeValue[];
  facetable: boolean;
}

export function metafieldToAttribute(productId: string, key: string, metafield: ShopifyMetafieldValue): ProductAttribute {
  const payload = JSON.parse(metafield.value) as StoredAttributePayload;
  return { productId, key, value: payload.value, facetable: payload.facetable };
}

export function attributeToMetafieldValue(attribute: ProductAttribute): string {
  const payload: StoredAttributePayload = { value: attribute.value, facetable: attribute.facetable };
  return JSON.stringify(payload);
}

import type { AttributeValue, IdentifyingAttribute, Product, Sku } from "@mercatus-liber/core";

/**
 * The narrowest read dependency this package has on catalog data -- a
 * structural interface, not an import of @mercatus-liber/catalog.
 * @mercatus-liber/catalog's CatalogService satisfies this shape already.
 */
export interface ProductLookup {
  getProductBySlug(slug: string): Promise<Product | null>;
  listSkusByProduct(productId: string): Promise<Sku[]>;
  resolveVariant(productId: string, selection: IdentifyingAttribute[]): Promise<Sku | null>;
}

export interface OptionValues {
  key: string;
  /** Distinct values actually present across the product's real SKUs -- never a theoretical cartesian product. */
  values: AttributeValue[];
}

export interface PdpViewModel {
  product: Product;
  skus: Sku[];
  optionValues: OptionValues[];
  templateKey: string | null;
}

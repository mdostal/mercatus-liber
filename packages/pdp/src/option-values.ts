import type { AttributeValue, Product, Sku } from "@mercatus-liber/core";
import type { OptionValues } from "./types.js";

/**
 * Derives the distinct available values per identifying-attribute key from
 * the product's REAL SKUs -- not every value that theoretically could exist.
 * A product with SKUs only in {red,large} and {blue,large} yields
 * color: [red, blue], size: [large], even if "small" is a plausible size the
 * catalog just never generated a SKU for.
 */
export function computeOptionValues(product: Product, skus: Sku[]): OptionValues[] {
  return product.identifyingAttributeKeys.map((key) => {
    const seen = new Set<AttributeValue>();
    for (const sku of skus) {
      const attr = sku.identifyingAttributes.find((a) => a.key === key);
      if (attr) seen.add(attr.value);
    }
    return { key, values: [...seen] };
  });
}

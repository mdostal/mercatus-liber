import type { IdentifyingAttribute, Sku } from "@mercatus-liber/core";
import type { ThemingService } from "@mercatus-liber/theming";
import { computeOptionValues } from "./option-values.js";
import type { PdpViewModel, ProductLookup } from "./types.js";

export interface PdpService {
  getViewModel(slug: string, templateOverride?: string): Promise<PdpViewModel | null>;
  /** Delegates entirely to catalog's own resolveVariant -- never reimplements variant matching. */
  resolveSelection(productId: string, selection: IdentifyingAttribute[]): Promise<Sku | null>;
}

export function createPdpService(deps: { catalog: ProductLookup; theming: ThemingService }): PdpService {
  const { catalog, theming } = deps;

  return {
    async getViewModel(slug, templateOverride) {
      const product = await catalog.getProductBySlug(slug);
      if (!product) return null;

      const skus = await catalog.listSkusByProduct(product.id);
      const optionValues = computeOptionValues(product, skus);
      const templateKey = theming.resolveTemplate("pdp", templateOverride);

      return { product, skus, optionValues, templateKey };
    },

    async resolveSelection(productId, selection) {
      return catalog.resolveVariant(productId, selection);
    },
  };
}

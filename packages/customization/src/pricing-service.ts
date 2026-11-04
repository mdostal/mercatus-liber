import { resolvePrice } from "./pricing.js";
import type { PriceBuild, PriceResult, PricingRules, PricingRulesRepository } from "./types.js";

/** Thrown when pricing a build for a product that has no PricingRules configured at all -- never silently priced at $0. */
export class MissingPricingRulesError extends Error {
  constructor(productId: string) {
    super(`No pricing rules configured for product: ${productId}`);
    this.name = "MissingPricingRulesError";
  }
}

/**
 * Admin-facing pricing surface, deliberately separate from
 * CustomizationService -- a storefront's admin screen reads/writes just
 * this (one product's full formula at a time), while priceOf is the one
 * real-time path both a price preview and the real charge call, so they
 * can never drift apart. See PricingRules' own doc comment for why
 * there's no global/override layering here: each product's document is
 * the complete, standalone source of truth for itself.
 */
export interface PricingService {
  getRules(productId: string): Promise<PricingRules | null>;
  saveRules(productId: string, rules: PricingRules): Promise<void>;
  listRules(): Promise<Record<string, PricingRules>>;
  /** Throws MissingPricingRulesError when the product has no PricingRules saved yet -- never prices at an invented $0. */
  priceOf(productId: string, build: PriceBuild): Promise<PriceResult>;
}

export function createPricingService(deps: { rules: PricingRulesRepository }): PricingService {
  const { rules } = deps;
  return {
    async getRules(productId: string): Promise<PricingRules | null> {
      return rules.get(productId);
    },
    async saveRules(productId: string, value: PricingRules): Promise<void> {
      await rules.save(productId, value);
    },
    async listRules(): Promise<Record<string, PricingRules>> {
      return rules.list();
    },
    async priceOf(productId: string, build: PriceBuild): Promise<PriceResult> {
      const productRules = await rules.get(productId);
      if (!productRules) throw new MissingPricingRulesError(productId);
      return resolvePrice(productRules, build);
    },
  };
}

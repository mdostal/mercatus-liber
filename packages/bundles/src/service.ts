import { randomUUID } from "node:crypto";
import type {
  Bundle,
  BundleRepository,
  BundleTier,
  CreateBundleInput,
  SkuPriceLookup,
  TierPricing,
} from "./types.js";
import { BundleCurrencyMismatchError, BundleSkuNotFoundError } from "./types.js";

export interface BundlesService {
  createBundle(input: CreateBundleInput): Promise<Bundle>;
  getBundle(id: string): Promise<Bundle | null>;
  /**
   * The PDP-facing read: returns the first active bundle attached to
   * `productId`, or null. v1 simplifying assumption -- documented, not
   * silently baked in: at most one active bundle exists per product (see
   * design-discussion.md §3 and docs/subsystems/17-bundles.md). If that
   * invariant is ever violated (e.g. by a repository written to directly),
   * this returns whichever active bundle sorts first, not an error.
   */
  getBundleForProduct(productId: string): Promise<Bundle | null>;
  listBundles(): Promise<Bundle[]>;
  /** Merges the given fields into an existing bundle; null if no bundle has this id. Id is never overwritten. Re-validates the merged tiers exactly as createBundle does. */
  updateBundle(id: string, input: Partial<CreateBundleInput>): Promise<Bundle | null>;
  deactivateBundle(id: string): Promise<Bundle | null>;
  /**
   * Live sum-of-parts price of one tier, recomputed from current
   * SkuPriceLookup data on every call (never cached into the Bundle record
   * -- see TierPricing's doc comment). Returns null only when the bundle or
   * tier itself isn't found; throws BundleSkuNotFoundError /
   * BundleCurrencyMismatchError for a resolvable-bundle-but-bad-data case
   * (a constituent SKU has since vanished, or spans multiple currencies).
   */
  computeTierPricing(bundleId: string, tierId: string): Promise<TierPricing | null>;
}

/**
 * Validates a full set of tiers against the shared write-time rules: at
 * least one tier, every tier has at least one skuId, and every skuId
 * resolves via SkuPriceLookup. Shared by createBundle and updateBundle so
 * the two never drift -- see the story's "Validation on createBundle/
 * updateBundle" requirement.
 */
async function validateTiers(tiers: BundleTier[], skuLookup: SkuPriceLookup): Promise<void> {
  if (tiers.length === 0) {
    throw new Error("A bundle must have at least one tier");
  }
  for (const tier of tiers) {
    if (tier.skuIds.length === 0) {
      throw new Error(`Tier "${tier.label}" (${tier.id}) must have at least one skuId`);
    }
    for (const skuId of tier.skuIds) {
      const sku = await skuLookup.getSku(skuId);
      if (!sku) {
        throw new BundleSkuNotFoundError(skuId);
      }
    }
  }
}

export function createBundlesService(deps: { repository: BundleRepository; skuLookup: SkuPriceLookup }): BundlesService {
  const { repository, skuLookup } = deps;

  return {
    async createBundle(input: CreateBundleInput): Promise<Bundle> {
      await validateTiers(input.tiers, skuLookup);
      const bundle: Bundle = {
        ...input,
        id: randomUUID(),
        status: input.status ?? "active",
      };
      await repository.save(bundle);
      return bundle;
    },

    async getBundle(id: string): Promise<Bundle | null> {
      return repository.get(id);
    },

    async getBundleForProduct(productId: string): Promise<Bundle | null> {
      const bundles = await repository.list();
      return bundles.find((bundle) => bundle.productId === productId && bundle.status === "active") ?? null;
    },

    async listBundles(): Promise<Bundle[]> {
      return repository.list();
    },

    async updateBundle(id: string, input: Partial<CreateBundleInput>): Promise<Bundle | null> {
      const existing = await repository.get(id);
      if (!existing) return null;
      const updated: Bundle = { ...existing, ...input, id: existing.id };
      await validateTiers(updated.tiers, skuLookup);
      await repository.save(updated);
      return updated;
    },

    async deactivateBundle(id: string): Promise<Bundle | null> {
      const bundle = await repository.get(id);
      if (!bundle) return null;
      const deactivated: Bundle = { ...bundle, status: "inactive" };
      await repository.save(deactivated);
      return deactivated;
    },

    async computeTierPricing(bundleId: string, tierId: string): Promise<TierPricing | null> {
      const bundle = await repository.get(bundleId);
      if (!bundle) return null;
      const tier = bundle.tiers.find((t) => t.id === tierId);
      if (!tier) return null;

      const lines = [];
      for (const skuId of tier.skuIds) {
        const sku = await skuLookup.getSku(skuId);
        if (!sku) {
          throw new BundleSkuNotFoundError(skuId);
        }
        lines.push({ skuId: sku.id, title: sku.title ?? sku.id, unitAmount: sku.price });
      }

      // A tier's price is a single Money total -- reject clearly on a
      // currency mismatch rather than silently summing incompatible
      // amounts (see BundleCurrencyMismatchError's doc comment).
      const currencies = new Set(lines.map((line) => line.unitAmount.currency));
      if (currencies.size > 1) {
        throw new BundleCurrencyMismatchError(tierId);
      }

      const total = lines.reduce((sum, line) => sum + line.unitAmount.amount, 0);
      return {
        total: { amount: total, currency: lines[0]!.unitAmount.currency },
        lines,
      };
    },
  };
}

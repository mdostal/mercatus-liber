import { MANUAL_FULFILLMENT_PROVIDER, type FulfillmentProviderKey } from "./types.js";

/**
 * skuId -> provider-key mapping, owned by this subsystem itself -- the same
 * "adapters reference catalog by id, never fork its types" discipline
 * bundles/promotions/recommendations already follow (design-discussion.md
 * §1c). Every SKU implicitly routes to MANUAL_FULFILLMENT_PROVIDER unless
 * explicitly mapped otherwise.
 */
export interface FulfillmentRoutingRepository {
  /** Never throws/returns undefined for an unmapped SKU -- resolves MANUAL_FULFILLMENT_PROVIDER by default. */
  getProviderForSku(skuId: string): Promise<FulfillmentProviderKey>;
  setProviderForSku(skuId: string, provider: FulfillmentProviderKey): Promise<void>;
  /** Every explicit mapping this repository holds -- unmapped SKUs (implicitly "manual") are never included. */
  listMappings(): Promise<{ skuId: string; provider: FulfillmentProviderKey }[]>;
}

/**
 * Default in-memory FulfillmentRoutingRepository -- structured exactly like
 * internal-bi's in-memory-repository.ts (structuredClone in/out so callers
 * can never mutate stored state through a returned reference where the
 * stored value is itself an object; a plain string mapping needs no cloning
 * but the read-out array is defensively copied all the same). A durable
 * adapter is a later, separate concern.
 */
export function createInMemoryFulfillmentRoutingRepository(): FulfillmentRoutingRepository {
  const mapping = new Map<string, FulfillmentProviderKey>();

  return {
    async getProviderForSku(skuId: string): Promise<FulfillmentProviderKey> {
      return mapping.get(skuId) ?? MANUAL_FULFILLMENT_PROVIDER;
    },
    async setProviderForSku(skuId: string, provider: FulfillmentProviderKey): Promise<void> {
      mapping.set(skuId, provider);
    },
    async listMappings(): Promise<{ skuId: string; provider: FulfillmentProviderKey }[]> {
      return Array.from(mapping.entries()).map(([skuId, provider]) => ({ skuId, provider }));
    },
  };
}

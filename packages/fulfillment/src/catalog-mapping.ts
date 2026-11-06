import type { FulfillmentProviderKey } from "./types.js";

/**
 * Which product in a provider's own catalog a SKU is made from -- e.g. a
 * Printify product and variant, or a Printful catalog variant. `target` is
 * shaped by the provider's adapter, which validates it when an order is sent,
 * so this subsystem stays provider-neutral.
 */
export interface ProviderCatalogMapping {
  skuId: string;
  provider: FulfillmentProviderKey;
  target: Record<string, unknown>;
}

export interface ProviderCatalogMappingRepository {
  get(skuId: string, provider: FulfillmentProviderKey): Promise<ProviderCatalogMapping | null>;
  /** Replaces any mapping for the same SKU and provider. */
  save(mapping: ProviderCatalogMapping): Promise<void>;
  remove(skuId: string, provider: FulfillmentProviderKey): Promise<void>;
  /** Every mapping, or only one provider's. Ordered by SKU id. */
  list(provider?: FulfillmentProviderKey): Promise<ProviderCatalogMapping[]>;
}

/** Thrown when an order needs a SKU's provider product and none is mapped. */
export class MissingCatalogMappingError extends Error {
  constructor(
    readonly skuId: string,
    readonly provider: FulfillmentProviderKey,
  ) {
    super(`SKU "${skuId}" has no ${provider} product mapped. Map it before routing this SKU to ${provider}.`);
    this.name = "MissingCatalogMappingError";
  }
}

/** Thrown when a stored mapping isn't the shape its provider needs. */
export class InvalidCatalogMappingError extends Error {
  constructor(skuId: string, provider: FulfillmentProviderKey, reason: string) {
    super(`SKU "${skuId}"'s ${provider} mapping is invalid: ${reason}`);
    this.name = "InvalidCatalogMappingError";
  }
}

/** Looks up a SKU's mapping for one provider, throwing MissingCatalogMappingError if there is none. */
export async function requireCatalogTarget(repository: ProviderCatalogMappingRepository, skuId: string, provider: FulfillmentProviderKey): Promise<Record<string, unknown>> {
  const mapping = await repository.get(skuId, provider);
  if (!mapping) throw new MissingCatalogMappingError(skuId, provider);
  return mapping.target;
}

export function createInMemoryProviderCatalogMappingRepository(): ProviderCatalogMappingRepository {
  const mappings = new Map<string, ProviderCatalogMapping>();
  const key = (skuId: string, provider: string): string => JSON.stringify([skuId, provider]);
  return {
    async get(skuId, provider) {
      const found = mappings.get(key(skuId, provider));
      return found ? structuredClone(found) : null;
    },
    async save(mapping) {
      mappings.set(key(mapping.skuId, mapping.provider), structuredClone(mapping));
    },
    async remove(skuId, provider) {
      mappings.delete(key(skuId, provider));
    },
    async list(provider) {
      return [...mappings.values()]
        .filter((m) => provider === undefined || m.provider === provider)
        .sort((a, b) => (a.skuId < b.skuId ? -1 : a.skuId > b.skuId ? 1 : a.provider < b.provider ? -1 : 1))
        .map((m) => structuredClone(m));
    },
  };
}

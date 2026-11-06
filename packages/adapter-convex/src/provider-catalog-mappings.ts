import type { ProviderCatalogMapping, ProviderCatalogMappingRepository } from "@mercatus-liber/fulfillment";
import type { ConvexClientLike } from "./index.js";

interface MappingDoc {
  skuId: string;
  provider: string;
  target: string;
}

const toMapping = (doc: MappingDoc): ProviderCatalogMapping => ({ skuId: doc.skuId, provider: doc.provider, target: JSON.parse(doc.target) as Record<string, unknown> });

/** Convex-backed ProviderCatalogMappingRepository. Deploy convex-functions/providerCatalogMappings.ts first. */
export function createConvexProviderCatalogMappingRepository(client: ConvexClientLike): ProviderCatalogMappingRepository {
  return {
    async get(skuId, provider) {
      const doc = (await client.query("providerCatalogMappings:get", { skuId, provider })) as MappingDoc | null;
      return doc ? toMapping(doc) : null;
    },
    async save(mapping) {
      await client.mutation("providerCatalogMappings:save", { skuId: mapping.skuId, provider: mapping.provider, target: JSON.stringify(mapping.target) });
    },
    async remove(skuId, provider) {
      await client.mutation("providerCatalogMappings:remove", { skuId, provider });
    },
    async list(provider) {
      const docs = (await client.query("providerCatalogMappings:list", provider === undefined ? {} : { provider })) as MappingDoc[];
      return docs.map(toMapping);
    },
  };
}

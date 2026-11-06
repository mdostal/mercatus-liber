import type { ProviderCatalogMapping, ProviderCatalogMappingRepository } from "@mercatus-liber/fulfillment";
import type { DbLike } from "./index.js";

/** `target` is replaced whole on save, so a field dropped from a mapping really goes away. */
interface MappingDoc {
  _id: string;
  skuId: string;
  provider: string;
  target: Record<string, unknown>;
}

const idOf = (skuId: string, provider: string): string => JSON.stringify([skuId, provider]);
const toMapping = (doc: MappingDoc): ProviderCatalogMapping => ({ skuId: doc.skuId, provider: doc.provider, target: doc.target });
const bySku = (a: MappingDoc, b: MappingDoc): number => (a.skuId < b.skuId ? -1 : a.skuId > b.skuId ? 1 : a.provider < b.provider ? -1 : 1);

/** MongoDB-backed ProviderCatalogMappingRepository. */
export function createMongoProviderCatalogMappingRepository(db: DbLike): ProviderCatalogMappingRepository {
  const collection = db.collection<MappingDoc>("provider_catalog_mappings");
  return {
    async get(skuId, provider) {
      const doc = await collection.findOne({ _id: idOf(skuId, provider) });
      return doc ? toMapping(doc) : null;
    },
    async save(mapping) {
      await collection.updateOne({ _id: idOf(mapping.skuId, mapping.provider) }, { $set: { skuId: mapping.skuId, provider: mapping.provider, target: mapping.target } }, { upsert: true });
    },
    async remove(skuId, provider) {
      await collection.deleteOne({ _id: idOf(skuId, provider) });
    },
    async list(provider) {
      const docs = await collection.find(provider === undefined ? {} : { provider }).toArray();
      return docs.sort(bySku).map(toMapping);
    },
  };
}

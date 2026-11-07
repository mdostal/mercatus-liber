import type { StoreApiKey, StoreApiKeyRepository } from "@mercatus-liber/store-api";
import type { ConvexClientLike } from "./index.js";

interface KeyDoc {
  value: string;
}

const parse = (doc: unknown): StoreApiKey | null => (doc ? (JSON.parse((doc as KeyDoc).value) as StoreApiKey) : null);

/** Convex-backed StoreApiKeyRepository. Deploy convex-functions/storeApiKeys.ts first. */
export function createConvexStoreApiKeyRepository(client: ConvexClientLike): StoreApiKeyRepository {
  return {
    get: async (id) => parse(await client.query("storeApiKeys:get", { externalId: id })),
    getByPrefix: async (prefix) => parse(await client.query("storeApiKeys:getByPrefix", { prefix })),
    async list() {
      const docs = (await client.query("storeApiKeys:list", {})) as KeyDoc[];
      return docs.map((d) => parse(d)!);
    },
    async save(key) {
      await client.mutation("storeApiKeys:save", { externalId: key.id, prefix: key.prefix, createdAt: key.createdAt, value: JSON.stringify(key) });
    },
  };
}

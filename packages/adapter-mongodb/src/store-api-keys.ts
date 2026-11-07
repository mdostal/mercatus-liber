import type { StoreApiKey, StoreApiKeyRepository } from "@mercatus-liber/store-api";
import type { DbLike } from "./index.js";

interface KeyDoc {
  _id: string;
  prefix: string;
  createdAt: string;
  value: StoreApiKey;
}

/** MongoDB-backed StoreApiKeyRepository. Holds only key hashes. */
export function createMongoStoreApiKeyRepository(db: DbLike): StoreApiKeyRepository {
  const collection = db.collection<KeyDoc>("store_api_keys");
  return {
    async get(id) {
      return (await collection.findOne({ _id: id }))?.value ?? null;
    },
    async getByPrefix(prefix) {
      return (await collection.findOne({ prefix }))?.value ?? null;
    },
    async list() {
      const docs = await collection.find({}).toArray();
      return docs.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a._id < b._id ? -1 : 1)).map((d) => d.value);
    },
    async save(key) {
      await collection.updateOne({ _id: key.id }, { $set: { prefix: key.prefix, createdAt: key.createdAt, value: key } }, { upsert: true });
    },
  };
}

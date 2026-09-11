import type { CollectionLike, DbLike } from "../src/index.js";

/**
 * A stateful fake `DbLike` double -- NOT a real MongoDB connection. No live
 * MongoDB instance exists in this environment (same disclosed gap as
 * @mercatus-liber/adapter-postgres's own fake-pool.ts). Implements real
 * findOne/find/updateOne-upsert/deleteOne/createIndex semantics over
 * plain in-memory Maps, keyed by a JSON-stringified `_id` (so both string
 * ids and the attributes collection's compound object `_id` work
 * uniformly) -- exercises this adapter's own query-construction logic
 * genuinely, but does NOT validate against MongoDB's real wire protocol or
 * query-operator semantics beyond plain equality, which is all this
 * adapter ever actually sends.
 */
export function createFakeDb(): DbLike {
  const collections = new Map<string, Map<string, unknown>>();

  function getStore(name: string): Map<string, unknown> {
    let store = collections.get(name);
    if (!store) {
      store = new Map();
      collections.set(name, store);
    }
    return store;
  }

  function keyOf(id: unknown): string {
    return JSON.stringify(id);
  }

  function matches(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
    return Object.entries(filter).every(([key, value]) => {
      // Supports the one dotted-path filter this adapter actually uses:
      // "_id.productId" against an AttributeDoc's compound object _id.
      if (key.includes(".")) {
        const [outer, inner] = key.split(".") as [string, string];
        const outerValue = doc[outer] as Record<string, unknown> | undefined;
        return outerValue?.[inner] === value;
      }
      // MongoDB itself does real deep-equality matching against an
      // embedded/compound _id (e.g. { productId, key }), not reference
      // equality -- JSON.stringify comparison is a sufficient proxy for
      // this fake's scope (every value this adapter's own filters ever
      // carry is plain, key-order-stable JSON-serializable data).
      const docValue = doc[key];
      if (typeof value === "object" && value !== null) {
        return JSON.stringify(docValue) === JSON.stringify(value);
      }
      return docValue === value;
    });
  }

  return {
    collection<TDoc extends { _id: unknown }>(name: string): CollectionLike<TDoc> {
      const store = getStore(name);

      return {
        async findOne(filter: Record<string, unknown>): Promise<TDoc | null> {
          for (const doc of store.values()) {
            if (matches(doc as Record<string, unknown>, filter)) return doc as TDoc;
          }
          return null;
        },
        find(filter: Record<string, unknown>) {
          return {
            async toArray(): Promise<TDoc[]> {
              return Array.from(store.values()).filter((doc) => matches(doc as Record<string, unknown>, filter)) as TDoc[];
            },
          };
        },
        async updateOne(filter: Record<string, unknown>, update: { $set: Partial<TDoc> }, _options: { upsert: true }) {
          const existing = Array.from(store.entries()).find(([, doc]) => matches(doc as Record<string, unknown>, filter));
          if (existing) {
            const [key, doc] = existing;
            store.set(key, { ...(doc as Record<string, unknown>), ...update.$set });
          } else {
            // Real upsert-with-no-match behavior: the new document's _id
            // comes from the filter's own equality condition on _id.
            const newId = filter._id;
            const newDoc = { _id: newId, ...update.$set } as TDoc;
            store.set(keyOf(newId), newDoc);
          }
          return {};
        },
        async deleteOne(filter: Record<string, unknown>) {
          const existing = Array.from(store.entries()).find(([, doc]) => matches(doc as Record<string, unknown>, filter));
          if (existing) store.delete(existing[0]);
          return {};
        },
        async createIndex() {
          return "ok";
        },
      };
    },
  };
}

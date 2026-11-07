import { describeStoreApiKeyContract } from "../../store-api/test/key-repository-contract.js";
import { createMongoStoreApiKeyRepository } from "../src/store-api-keys.js";
import { createFakeDb } from "./fake-db.js";

describeStoreApiKeyContract("MongoDB (fake)", async () => {
  const db = createFakeDb();
  return { open: () => createMongoStoreApiKeyRepository(db) };
});

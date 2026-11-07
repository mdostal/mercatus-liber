import { createInMemoryStoreApiKeyRepository } from "../src/keys.js";
import { describeStoreApiKeyContract } from "./key-repository-contract.js";

describeStoreApiKeyContract("in-memory", async () => {
  const repo = createInMemoryStoreApiKeyRepository();
  return { open: () => repo };
});

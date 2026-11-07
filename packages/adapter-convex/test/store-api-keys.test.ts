// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { describeStoreApiKeyContract } from "../../store-api/test/key-repository-contract.js";
import schema from "../convex-functions/schema.js";
import { createConvexStoreApiKeyRepository } from "../src/store-api-keys.js";
import type { ConvexClientLike } from "../src/index.js";

const modules = {
  "../convex-functions/_generated/server.js": async () => ({}),
  "../convex-functions/storeApiKeys.ts": () => import("../convex-functions/storeApiKeys.js"),
};

describeStoreApiKeyContract("Convex", async () => {
  const t = convexTest(schema, modules);
  const reference = (name: string) => {
    const [file, fn] = name.split(":") as [string, string];
    return anyApi[file]![fn]! as never;
  };
  const client: ConvexClientLike = {
    query: (name, args) => t.query(reference(name), args as never),
    mutation: (name, args) => t.mutation(reference(name), args as never),
  };
  return { open: () => createConvexStoreApiKeyRepository(client) };
});

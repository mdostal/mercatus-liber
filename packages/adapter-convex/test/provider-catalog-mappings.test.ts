// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { describeCatalogMappingContract } from "../../fulfillment/test/catalog-mapping-contract.js";
import schema from "../convex-functions/schema.js";
import { createConvexProviderCatalogMappingRepository } from "../src/provider-catalog-mappings.js";
import type { ConvexClientLike } from "../src/index.js";

const modules = {
  "../convex-functions/_generated/server.js": async () => ({}),
  "../convex-functions/providerCatalogMappings.ts": () => import("../convex-functions/providerCatalogMappings.js"),
};

describeCatalogMappingContract("Convex", async () => {
  const t = convexTest(schema, modules);
  const reference = (name: string) => {
    const [file, fn] = name.split(":") as [string, string];
    return anyApi[file]![fn]! as never;
  };
  const client: ConvexClientLike = {
    query: (name, args) => t.query(reference(name), args as never),
    mutation: (name, args) => t.mutation(reference(name), args as never),
  };
  return { open: () => createConvexProviderCatalogMappingRepository(client) };
});

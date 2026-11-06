// @vitest-environment edge-runtime
/**
 * Runs the real functions in convex-functions/customization.ts against the real
 * schema through convex-test, Convex's own in-process mock backend, rather than
 * this package's fake client, which can only repeat what the functions are
 * meant to do. It is still not a deployed Convex backend.
 */
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import { describeCustomizationRepositoryContract } from "../../customization/test/repository-contract.js";
import schema from "../convex-functions/schema.js";
import { createConvexCustomizationRepositories } from "../src/customization.js";
import type { ConvexClientLike } from "../src/index.js";

const modules = {
  "../convex-functions/_generated/server.js": async () => ({}),
  "../convex-functions/customization.ts": () => import("../convex-functions/customization.js"),
};

describeCustomizationRepositoryContract("Convex", async () => {
  const t = convexTest(schema, modules);
  const reference = (name: string) => {
    const [file, fn] = name.split(":") as [string, string];
    return anyApi[file]![fn]! as never;
  };
  const client: ConvexClientLike = {
    query: (name, args) => t.query(reference(name), args as never),
    mutation: (name, args) => t.mutation(reference(name), args as never),
  };
  return { open: () => createConvexCustomizationRepositories(client) };
});

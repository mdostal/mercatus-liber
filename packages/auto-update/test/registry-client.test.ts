import { describe, expect, it, vi } from "vitest";
import { createNpmRegistryClient, PackageNotFoundError } from "../src/registry-client.js";

describe("createNpmRegistryClient", () => {
  it("getLatestVersion returns the version from the registry's /latest response", async () => {
    const fakeFetch = vi.fn(async () => ({ status: 200, json: async () => ({ version: "1.2.3" }) })) as unknown as typeof fetch;
    const client = createNpmRegistryClient(fakeFetch);

    expect(await client.getLatestVersion("@mercatus-liber/catalog")).toBe("1.2.3");
    expect(fakeFetch).toHaveBeenCalledWith("https://registry.npmjs.org/%40mercatus-liber%2Fcatalog/latest");
  });

  it("throws PackageNotFoundError for a 404 response", async () => {
    const fakeFetch = vi.fn(async () => ({ status: 404, json: async () => ({}) })) as unknown as typeof fetch;
    const client = createNpmRegistryClient(fakeFetch);

    await expect(client.getLatestVersion("@mercatus-liber/not-published-yet")).rejects.toThrow(PackageNotFoundError);
  });
});

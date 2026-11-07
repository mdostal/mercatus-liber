import { describe, expect, it } from "vitest";
import { authenticateStoreApiKey, createStoreApiKey, revokeStoreApiKey, type StoreApiKeyRepository } from "../src/keys.js";

/** What every storage backend's API key repository must do. `open` returns a repository on a fresh store, a second call a new one on the same store. */
export function describeStoreApiKeyContract(name: string, setup: () => Promise<{ open(): StoreApiKeyRepository }>, options: { timeout?: number } = {}): void {
  describe(`${name}: store API key repository contract`, { timeout: options.timeout ?? 5_000 }, () => {
    it("round-trips a key and finds it by id and prefix", async () => {
      const repo = (await setup()).open();
      const { key } = await createStoreApiKey(repo, { name: "flayr", scopes: ["products:read", "promotions:write"] });
      expect(await repo.get(key.id)).toEqual(key);
      expect(await repo.getByPrefix(key.prefix)).toEqual(key);
      expect(await repo.get("missing")).toBeNull();
      expect(await repo.getByPrefix("000000000000")).toBeNull();
    });

    it("lists keys oldest first and records a revocation", async () => {
      const repo = (await setup()).open();
      const first = await createStoreApiKey(repo, { name: "a", scopes: ["products:read"] });
      await new Promise((r) => setTimeout(r, 5));
      await createStoreApiKey(repo, { name: "b", scopes: ["products:read"] });
      expect((await repo.list()).map((k) => k.name)).toEqual(["a", "b"]);
      await revokeStoreApiKey(repo, first.key.id);
      expect((await repo.get(first.key.id))!.revokedAt).not.toBeNull();
      expect(await authenticateStoreApiKey(repo, first.secret)).toBeNull();
    });

    it("🔍 authenticates across a restart", async () => {
      const store = await setup();
      const { key, secret } = await createStoreApiKey(store.open(), { name: "flayr", scopes: ["products:read"] });
      expect((await authenticateStoreApiKey(store.open(), secret))!.id).toBe(key.id);
    });
  });
}

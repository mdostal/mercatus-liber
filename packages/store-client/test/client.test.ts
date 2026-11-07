import { createHmac } from "node:crypto";
import { createStoreApiHandler, createInMemoryStoreApiKeyRepository, createStoreApiKey, type StoreApiDeps, type StoreApiPromotion } from "@mercatus-liber/store-api";
import { describe, expect, it } from "vitest";
import { createMercatusStoreClient, MercatusApiError, verifyMercatusWebhook } from "../src/index.js";

// Runs the client against the real handler, with fetch routed in memory.
async function setup(productCount = 0) {
  const products = Array.from({ length: productCount }, (_, i) => ({ id: `p${String(i).padStart(3, "0")}`, slug: `s${i}`, title: `T${i}`, description: "", identifyingAttributeKeys: [], status: "active" as const }));
  const promotions: StoreApiPromotion[] = [];
  const deps: StoreApiDeps = {
    store: { name: "Shop", currency: "USD", url: "https://shop.example" },
    catalog: { listProducts: async () => products, getProduct: async (id) => products.find((p) => p.id === id) ?? null, listSkusByProduct: async () => [] },
    promotions: {
      listPromotions: async () => promotions,
      getPromotion: async (id) => promotions.find((p) => p.id === id) ?? null,
      createPromotion: async (input) => {
        const p = { ...input, id: `x${promotions.length}`, redemptionCount: 0, status: input.status ?? "active" } as StoreApiPromotion;
        promotions.push(p);
        return p;
      },
      updatePromotion: async (id, input) => {
        const p = promotions.find((q) => q.id === id)!;
        Object.assign(p, input);
        return p;
      },
    },
  };
  const keys = createInMemoryStoreApiKeyRepository();
  const { secret } = await createStoreApiKey(keys, { name: "t", scopes: ["products:read", "promotions:read", "promotions:write"] });
  const handler = createStoreApiHandler({ deps, keys, basePath: "/api/store/v1" });
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => handler(new Request(input, init))) as typeof fetch;
  return createMercatusStoreClient({ baseUrl: "https://shop.example/api/store/v1/", apiKey: secret, fetchImpl });
}

describe("createMercatusStoreClient", () => {
  it("reads the store and pages through every product", async () => {
    const client = await setup(250);
    expect((await client.getStore()).name).toBe("Shop");
    const all = await client.listAllProducts();
    expect(all).toHaveLength(250);
    expect(new Set(all.map((p) => p.id)).size).toBe(250);
  });

  it("creates a promotion inactive, then turns it on", async () => {
    const client = await setup();
    const promo = await client.createPromotion({ code: "HOLIDAY20", kind: "percentage", value: 20 });
    expect(promo.status).toBe("inactive");
    expect((await client.updatePromotion(promo.id, { status: "active" })).live).toBe(true);
  });

  it("🔍 turns API errors into MercatusApiError with the status and code", async () => {
    const client = await setup();
    await expect(client.getProduct("missing")).rejects.toMatchObject({ status: 404, code: "not_found" });
    await expect(client.listWebhooks()).rejects.toBeInstanceOf(MercatusApiError);
    const bad = createMercatusStoreClient({ baseUrl: "https://shop.example/api/store/v1", apiKey: "wrong", fetchImpl: (async () => new Response(JSON.stringify({ error: { code: "unauthorized", message: "no" } }), { status: 401 })) as unknown as typeof fetch });
    await expect(bad.getStore()).rejects.toMatchObject({ status: 401, code: "unauthorized" });
  });
});

describe("verifyMercatusWebhook", () => {
  // Signed the way @mercatus-liber/webhooks signs a delivery.
  const sign = (secret: string, body: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  it("accepts a correctly signed body", async () => {
    const body = JSON.stringify({ type: "catalog.product.updated", data: { productId: "p1" } });
    expect(await verifyMercatusWebhook(body, sign("s", body), "s")).toBe(true);
  });

  it("🔍 rejects a changed body, wrong secret, missing or malformed header", async () => {
    const body = '{"a":1}';
    expect(await verifyMercatusWebhook('{"a":2}', sign("s", body), "s")).toBe(false);
    expect(await verifyMercatusWebhook(body, sign("other", body), "s")).toBe(false);
    expect(await verifyMercatusWebhook(body, null, "s")).toBe(false);
    expect(await verifyMercatusWebhook(body, "md5=abc", "s")).toBe(false);
  });
});

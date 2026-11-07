import type { Product, Sku } from "@mercatus-liber/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createStoreApiHandler } from "../src/handler.js";
import { authenticateStoreApiKey, createInMemoryStoreApiKeyRepository, createStoreApiKey, revokeStoreApiKey, type StoreApiKeyRepository } from "../src/keys.js";
import type { StoreApiDeps, StoreApiPromotion, StoreApiWebhookSubscription } from "../src/types.js";

const NOW = new Date("2026-11-27T12:00:00Z");
const product = (id: string, status: Product["status"] = "active"): Product => ({ id, slug: `p-${id}`, title: `Product ${id}`, description: "d", identifyingAttributeKeys: ["size"], status, images: [{ url: `https://img.example/${id}.jpg`, alt: id }] });
const sku = (id: string, productId: string, amount: number): Sku => ({ id, productId, identifyingAttributes: [{ key: "size", value: id.endsWith("L") ? "L" : "S" }], price: { amount, currency: "USD" }, status: "active" });

function makeDeps() {
  const products = [product("a"), product("b"), product("c"), product("d", "draft")];
  const skus = [sku("a-S", "a", 2000), sku("a-L", "a", 2500), sku("b-S", "b", 1000)];
  const promotions: StoreApiPromotion[] = [];
  const hooks: StoreApiWebhookSubscription[] = [];
  let n = 0;
  const deps: StoreApiDeps = {
    store: { name: "Test Shop", currency: "USD", url: "https://shop.example" },
    catalog: {
      async listProducts(filter) {
        return products.filter((p) => !filter?.status || p.status === filter.status);
      },
      async getProduct(id) {
        return products.find((p) => p.id === id) ?? null;
      },
      async listSkusByProduct(productId) {
        return skus.filter((s) => s.productId === productId);
      },
    },
    categories: {
      async listCategories() {
        return [{ id: "c1", slug: "tees", title: "Tees", description: "", parentId: null }];
      },
      async listCategoriesForProduct(id) {
        return id === "a" ? [{ id: "c1", slug: "tees", title: "Tees", description: "", parentId: null }] : [];
      },
    },
    promotions: {
      async listPromotions() {
        return promotions;
      },
      async getPromotion(id) {
        return promotions.find((p) => p.id === id) ?? null;
      },
      async createPromotion(input) {
        const p: StoreApiPromotion = { ...input, id: `promo${++n}`, redemptionCount: 0, status: input.status ?? "active" };
        promotions.push(p);
        return p;
      },
      async updatePromotion(id, input) {
        const i = promotions.findIndex((p) => p.id === id);
        if (i < 0) return null;
        promotions[i] = { ...promotions[i]!, ...input };
        return promotions[i]!;
      },
    },
    webhooks: {
      async create(input) {
        const h = { id: `wh${++n}`, ...input, secret: "s3cret", active: true, createdAt: NOW.toISOString() };
        hooks.push(h);
        return h;
      },
      async list() {
        return hooks;
      },
      async delete(id) {
        const i = hooks.findIndex((h) => h.id === id);
        if (i >= 0) hooks.splice(i, 1);
      },
    },
    now: () => NOW,
  };
  return { deps, promotions, hooks };
}

describe("store API", () => {
  let keys: StoreApiKeyRepository;
  let ctx: ReturnType<typeof makeDeps>;
  let handle: (r: Request) => Promise<Response>;
  let full: string;

  beforeEach(async () => {
    keys = createInMemoryStoreApiKeyRepository();
    ctx = makeDeps();
    handle = createStoreApiHandler({ deps: ctx.deps, keys, basePath: "/api/store/v1" });
    full = (await createStoreApiKey(keys, { name: "flayr", scopes: ["products:read", "promotions:read", "promotions:write", "webhooks:manage"] })).secret;
  });

  const call = async (method: string, path: string, opts: { key?: string | null; body?: unknown } = {}) => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    const key = opts.key === undefined ? full : opts.key;
    if (key) headers.authorization = `Bearer ${key}`;
    const res = await handle(new Request(`https://shop.example/api/store/v1${path}`, { method, headers, ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}) }));
    return { status: res.status, body: res.status === 204 ? null : ((await res.json()) as any) };
  };

  describe("auth", () => {
    it("🔍 refuses a missing, malformed, wrong, or revoked key", async () => {
      expect((await call("GET", "/store", { key: null })).status).toBe(401);
      expect((await call("GET", "/store", { key: "nope" })).status).toBe(401);
      expect((await call("GET", "/store", { key: full.slice(0, -2) + "xx" })).status).toBe(401);
      const { key } = (await keys.list()).map((k) => ({ key: k }))[0]!;
      await revokeStoreApiKey(keys, key.id);
      expect((await call("GET", "/store")).status).toBe(401);
    });

    it("🔍 enforces scopes per endpoint", async () => {
      const readOnly = (await createStoreApiKey(keys, { name: "ro", scopes: ["products:read"] })).secret;
      expect((await call("GET", "/products", { key: readOnly })).status).toBe(200);
      expect((await call("GET", "/promotions", { key: readOnly })).status).toBe(403);
      expect((await call("POST", "/promotions", { key: readOnly, body: { kind: "percentage", value: 10 } })).status).toBe(403);
      expect((await call("POST", "/webhooks", { key: readOnly, body: {} })).status).toBe(403);
    });

    it("stores only a hash, and refuses unknown scopes", async () => {
      const [stored] = await keys.list();
      expect(JSON.stringify(stored)).not.toContain(full);
      expect(await authenticateStoreApiKey(keys, full)).not.toBeNull();
      await expect(createStoreApiKey(keys, { name: "x", scopes: ["orders:write"] })).rejects.toThrow(/orders:write/);
    });
  });

  it("describes the store and the key's scopes", async () => {
    const { body } = await call("GET", "/store");
    expect(body).toMatchObject({ name: "Test Shop", currency: "USD", url: "https://shop.example" });
    expect(body.scopes).toContain("products:read");
  });

  describe("products", () => {
    it("lists active products with variants, categories, images, URL, and price range", async () => {
      const { body } = await call("GET", "/products");
      expect(body.total).toBe(3);
      const a = body.data.find((p: any) => p.id === "a");
      expect(a).toMatchObject({ url: "https://shop.example/products/p-a", images: [{ url: "https://img.example/a.jpg", alt: "a" }], categories: [{ id: "c1", slug: "tees", title: "Tees" }], priceRange: { min: { amount: 2000 }, max: { amount: 2500 } } });
      expect(a.variants.map((v: any) => v.options.size)).toEqual(["S", "L"]);
    });

    it("🔍 pages with a cursor until every product is seen once", async () => {
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const { body } = await call("GET", `/products?limit=2${cursor ? `&cursor=${cursor}` : ""}`);
        seen.push(...body.data.map((p: any) => p.id));
        cursor = body.nextCursor;
      } while (cursor);
      expect(seen).toEqual(["a", "b", "c"]);
      expect((await call("GET", "/products?status=all")).body.total).toBe(4);
      expect((await call("GET", "/products?cursor=%%%")).status).toBe(400);
    });

    it("🔍 shows a sale price from a live automatic product promotion, not from a coded or expired one", async () => {
      ctx.promotions.push(
        { id: "auto", code: null, kind: "percentage", scope: "product", value: 20, currency: "USD", targetSkuIds: ["a-S"], minCartAmount: null, startsAt: "2026-11-27T00:00:00Z", endsAt: "2026-12-01T00:00:00Z", usageLimit: null, redemptionCount: 0, status: "active" },
        { id: "coded", code: "BF30", kind: "percentage", scope: "product", value: 30, currency: "USD", targetSkuIds: ["a-L"], minCartAmount: null, startsAt: null, endsAt: null, usageLimit: null, redemptionCount: 0, status: "active" },
        { id: "over", code: null, kind: "fixed", scope: "product", value: 500, currency: "USD", targetSkuIds: ["b-S"], minCartAmount: null, startsAt: null, endsAt: "2026-11-01T00:00:00Z", usageLimit: null, redemptionCount: 0, status: "active" },
      );
      const a = (await call("GET", "/products/a")).body.data;
      expect(a.variants[0]).toMatchObject({ salePrice: { amount: 1600, currency: "USD" }, salePromotionId: "auto" });
      expect(a.variants[1].salePrice).toBeUndefined();
      expect(a.priceRange.min.amount).toBe(1600);
      expect((await call("GET", "/products/b")).body.data.variants[0].salePrice).toBeUndefined();
    });

    it("404s an unknown product", async () => {
      expect((await call("GET", "/products/zzz")).status).toBe(404);
    });
  });

  describe("promotions", () => {
    it("creates a holiday code inactive by default, then activates it", async () => {
      const created = await call("POST", "/promotions", { body: { code: "BF20", kind: "percentage", value: 20, startsAt: "2026-11-27T00:00:00Z", endsAt: "2026-12-01T00:00:00Z" } });
      expect(created.status).toBe(201);
      expect(created.body.data).toMatchObject({ code: "BF20", scope: "cart", status: "inactive", live: false, currency: "USD" });
      const activated = await call("PATCH", `/promotions/${created.body.data.id}`, { body: { status: "active" } });
      expect(activated.body.data).toMatchObject({ status: "active", live: true });
    });

    it("🔍 refuses bad input and duplicate codes", async () => {
      expect((await call("POST", "/promotions", { body: { kind: "percentage", value: 120 } })).status).toBe(400);
      expect((await call("POST", "/promotions", { body: { kind: "fixed", value: 9.5 } })).status).toBe(400);
      expect((await call("POST", "/promotions", { body: { kind: "percentage", value: 10, code: "bad code!" } })).status).toBe(400);
      expect((await call("POST", "/promotions", { body: { kind: "percentage", value: 10, startsAt: "2026-12-02T00:00:00Z", endsAt: "2026-12-01T00:00:00Z" } })).status).toBe(400);
      await call("POST", "/promotions", { body: { kind: "percentage", value: 10, code: "HOLIDAY" } });
      expect((await call("POST", "/promotions", { body: { kind: "percentage", value: 15, code: "holiday" } })).status).toBe(409);
    });

    it("🔍 a PATCH can't move the end before the existing start", async () => {
      const { body } = await call("POST", "/promotions", { body: { kind: "percentage", value: 10, startsAt: "2026-12-01T00:00:00Z" } });
      expect((await call("PATCH", `/promotions/${body.data.id}`, { body: { endsAt: "2026-11-30T00:00:00Z" } })).status).toBe(400);
    });

    it("targets SKUs as a product promotion", async () => {
      const { body } = await call("POST", "/promotions", { body: { kind: "fixed", value: 500, targetSkuIds: ["a-S"] } });
      expect(body.data.scope).toBe("product");
    });
  });

  describe("webhooks", () => {
    it("🔍 returns the signing secret once on create, never in the list", async () => {
      const created = await call("POST", "/webhooks", { body: { url: "https://flayr.example/api/webhooks/mercatus", eventTypes: ["catalog.product.updated"] } });
      expect(created.status).toBe(201);
      expect(created.body.data.secret).toBe("s3cret");
      const listed = await call("GET", "/webhooks");
      expect(listed.body.data[0].secret).toBeUndefined();
      expect((await call("DELETE", `/webhooks/${created.body.data.id}`)).status).toBe(204);
    });

    it("🔍 refuses a non-https URL or an empty event list", async () => {
      expect((await call("POST", "/webhooks", { body: { url: "http://x.example/h", eventTypes: ["a"] } })).status).toBe(400);
      expect((await call("POST", "/webhooks", { body: { url: "https://x.example/h", eventTypes: [] } })).status).toBe(400);
    });
  });

  it("🔍 answers 404 for unknown routes and paths outside the mount, and 400 for a non-JSON body", async () => {
    expect((await call("GET", "/orders")).status).toBe(404);
    const outside = await handle(new Request("https://shop.example/other", { headers: { authorization: `Bearer ${full}` } }));
    expect(outside.status).toBe(404);
    const res = await handle(new Request("https://shop.example/api/store/v1/promotions", { method: "POST", headers: { authorization: `Bearer ${full}` }, body: "not json" }));
    expect(res.status).toBe(400);
  });
});

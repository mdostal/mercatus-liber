import { describe, expect, it } from "vitest";
import type { CatalogService } from "@mercatus-liber/catalog";
import { authenticateStoreApiKey, createInMemoryStoreApiKeyRepository, createStoreApiKey, revokeStoreApiKey } from "@mercatus-liber/store-api";
import { resolveStoreImage, scopeCatalogToStore, scopeStoreApiKeys } from "../lib/store-api";

describe("scopeStoreApiKeys", () => {
  it("accepts a key only in the store it was created for", async () => {
    const shared = createInMemoryStoreApiKeyRepository();
    const printShop = scopeStoreApiKeys(shared, "print-shop");
    const northline = scopeStoreApiKeys(shared, "northline");
    const { secret } = await createStoreApiKey(printShop, { name: "flayr", scopes: ["products:read"] });

    expect(await authenticateStoreApiKey(printShop, secret)).not.toBeNull();
    expect(await authenticateStoreApiKey(northline, secret)).toBeNull();
  });

  it("lists and revokes only the store's own keys", async () => {
    const shared = createInMemoryStoreApiKeyRepository();
    const printShop = scopeStoreApiKeys(shared, "print-shop");
    const northline = scopeStoreApiKeys(shared, "northline");
    const { secret } = await createStoreApiKey(printShop, { name: "flayr", scopes: ["products:read"] });
    await createStoreApiKey(northline, { name: "other", scopes: ["products:read"] });

    const ours = await printShop.list();
    expect(ours.map((key) => key.name)).toEqual(["flayr"]);
    expect(await revokeStoreApiKey(northline, ours[0]!.id)).toBeNull();
    expect(await authenticateStoreApiKey(printShop, secret)).not.toBeNull();
    expect(await revokeStoreApiKey(printShop, ours[0]!.id)).not.toBeNull();
    expect(await authenticateStoreApiKey(printShop, secret)).toBeNull();
  });

  it("refuses a key saved without a store prefix", async () => {
    const shared = createInMemoryStoreApiKeyRepository();
    const { secret } = await createStoreApiKey(shared, { name: "legacy", scopes: ["products:read"] });
    expect(await authenticateStoreApiKey(scopeStoreApiKeys(shared, "print-shop"), secret)).toBeNull();
  });
});

describe("scopeCatalogToStore", () => {
  const product = (id: string, status: "active" | "draft" = "active") => ({ id, slug: id, title: id, status });
  const byCatalog: Record<string, ReturnType<typeof product>[]> = {
    "cat-print": [product("poster"), product("mug", "draft")],
    "cat-north": [product("tv-install")],
  };
  const catalog = {
    getCatalogBySlug: async (slug: string) => (slug === "the-print-shop" ? { id: "cat-print" } : slug === "northline-home-tech" ? { id: "cat-north" } : null),
    listProductsInCatalog: async (catalogId: string) => byCatalog[catalogId] ?? [],
    listSkusByProduct: async () => [],
  } as unknown as CatalogService;

  it("lists only the store's own products, with the status filter applied", async () => {
    const scoped = scopeCatalogToStore(catalog, "the-print-shop");
    expect((await scoped.listProducts()).map((p) => p.id)).toEqual(["poster", "mug"]);
    expect((await scoped.listProducts({ status: "active" })).map((p) => p.id)).toEqual(["poster"]);
  });

  it("doesn't return another store's product by id", async () => {
    const scoped = scopeCatalogToStore(catalog, "the-print-shop");
    expect((await scoped.getProduct("poster"))?.id).toBe("poster");
    expect(await scoped.getProduct("tv-install")).toBeNull();
  });

  it("returns nothing when the store has no catalog", async () => {
    const scoped = scopeCatalogToStore(catalog, "missing");
    expect(await scoped.listProducts()).toEqual([]);
    expect(await scoped.getProduct("poster")).toBeNull();
  });
});

describe("resolveStoreImage", () => {
  const catalog = {
    getProduct: async (id: string) => (id === "poster" ? { id: "poster", images: [{ url: "https://img.example/poster.jpg", alt: "" }] } : null),
    listSkusByProduct: async () => [{ id: "sku-1", images: [{ url: "https://img.example/sku.jpg", alt: "" }] }],
    listProducts: async () => [],
  } as unknown as Parameters<typeof resolveStoreImage>[0];

  it("resolves a product image and a variant image", async () => {
    expect(await resolveStoreImage(catalog, "poster", "product", 0)).toBe("https://img.example/poster.jpg");
    expect(await resolveStoreImage(catalog, "poster", "sku-1", 0)).toBe("https://img.example/sku.jpg");
  });

  it("returns null for an unknown product, variant or index", async () => {
    expect(await resolveStoreImage(catalog, "other-store-product", "product", 0)).toBeNull();
    expect(await resolveStoreImage(catalog, "poster", "sku-2", 0)).toBeNull();
    expect(await resolveStoreImage(catalog, "poster", "product", 3)).toBeNull();
    expect(await resolveStoreImage(catalog, "poster", "product", Number("x"))).toBeNull();
  });
});

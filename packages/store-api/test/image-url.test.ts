import { describe, expect, it } from "vitest";
import type { Product, Sku } from "@mercatus-liber/core";
import { toApiProduct, type StoreApiDeps } from "../src/index.js";

const product = { id: "a", slug: "p-a", title: "A", description: "", identifyingAttributeKeys: [], status: "active", images: [{ url: "https://img.example/a.jpg", alt: "a" }] } as unknown as Product;
const sku = { id: "s1", productId: "a", identifyingAttributes: [], price: { amount: 1000, currency: "USD" }, status: "active", images: [{ url: "https://img.example/s1.jpg", alt: "s" }] } as unknown as Sku;

const deps = (imageUrl?: StoreApiDeps["store"]["imageUrl"]): StoreApiDeps => ({
  store: { name: "Shop", currency: "USD", url: "https://shop.example", ...(imageUrl ? { imageUrl } : {}) },
  catalog: { listProducts: async () => [product], getProduct: async () => product, listSkusByProduct: async () => [sku] },
});

describe("store.imageUrl", () => {
  it("gives out stored image URLs by default", async () => {
    const api = await toApiProduct(deps(), product, []);
    expect(api.images[0]!.url).toBe("https://img.example/a.jpg");
    expect(api.variants[0]!.images[0]!.url).toBe("https://img.example/s1.jpg");
  });

  it("lets the store give out its own URL for product and variant images", async () => {
    const api = await toApiProduct(deps(({ productId, skuId, index }) => `https://shop.example/img/${productId}/${skuId ?? "product"}/${index}`), product, []);
    expect(api.images[0]).toEqual({ url: "https://shop.example/img/a/product/0", alt: "a" });
    expect(api.variants[0]!.images[0]!.url).toBe("https://shop.example/img/a/s1/0");
  });
});

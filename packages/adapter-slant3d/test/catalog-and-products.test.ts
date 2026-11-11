import { createInMemoryProviderCatalogMappingRepository } from "@mercatus-liber/fulfillment";
import { describe, expect, it } from "vitest";
import {
  applySlant3dProduct,
  createSlant3dCatalogClient,
  estimateSlant3dUnitCosts,
  InvalidSlant3dWebhookSecretError,
  planSlant3dProduct,
  SLANT3D_PROVIDER,
  slant3dUsdToCents,
  type Slant3dCatalogWriter,
  type Slant3dFilament,
  type Slant3dProductSpec,
} from "../src/index.js";
import { fakeFetch, ok } from "./fake-fetch.js";

const PLATFORM = "11111111-1111-1111-1111-111111111111";
const filament = (publicId: string, profile: string, color: string, available?: boolean): Slant3dFilament => ({ publicId, name: `${profile} ${color}`, provider: "Slant", profile, color, hexValue: "#000000", ...(available === undefined ? {} : { available }) });
const FILAMENTS = [filament("fil-black", "PLA", "black", true), filament("fil-red", "PETG", "red"), filament("fil-gone", "PLA", "gold", false)];

describe("slant3dUsdToCents", () => {
  it.each([
    [17.75, 1775],
    [3.55, 355],
    [0.29, 29],
    [0.57, 57],
    [1.15, 115],
    [4.35, 435],
    [8.2, 820],
    [1.1, 110],
    [19.99, 1999],
    [1005.01, 100501],
    [12, 1200],
    [0, 0],
    [0.1 + 0.2, 30],
    [2.675, 268],
    [1.005, 101],
    [2.994, 299],
    [-1.5, -150],
    ["4.06", 406],
    ["12.72", 1272],
    ["0.07", 7],
    ["5", 500],
    ["5.5", 550],
    [" 4.79 ", 479],
  ])("converts %s to %i cents", (amount, cents) => {
    expect(slant3dUsdToCents(amount)).toBe(cents);
  });

  it("refuses something that isn't an amount", () => {
    expect(() => slant3dUsdToCents("abc")).toThrow();
    expect(() => slant3dUsdToCents("")).toThrow();
    expect(() => slant3dUsdToCents(Number.NaN)).toThrow();
    expect(() => slant3dUsdToCents(Number.POSITIVE_INFINITY)).toThrow();
  });
});

describe("createSlant3dCatalogClient", () => {
  it("returns an estimate in whole cents", async () => {
    const { fetchImpl, calls } = fakeFetch({ "POST /files/file-1/estimate": ok({ subtotal: 3.55, pricePerUnit: 3.55, quantity: 5, total: 17.75, totalMaterial: 10.43, estimatedPrintTime: 0.72, bodyChargeCost: 0, oversizeSurcharge: 0 }) });
    const estimate = await createSlant3dCatalogClient({ apiKey: "k", fetchImpl }).estimate({ fileId: "file-1", filamentId: "fil-black", quantity: 5 });
    expect(calls[0]?.body).toEqual({ options: { filamentId: "fil-black", quantity: 5 } });
    expect(estimate).toMatchObject({ quantity: 5, totalCents: 1775, unitCents: 355, subtotalCents: 355, currency: "USD" });
  });

  it("converts amounts that drift as floats", async () => {
    const { fetchImpl, calls } = fakeFetch({ "POST /files/file-1/estimate": ok({ subtotal: 1.15, pricePerUnit: 0.57, quantity: 1, total: 4.35 }) });
    const estimate = await createSlant3dCatalogClient({ apiKey: "k", fetchImpl }).estimate({ fileId: "file-1" });
    // 1.15 * 100, 0.57 * 100 and 4.35 * 100 are 114.99999999999999, 56.99999999999999 and 434.99999999999994 as floats.
    expect([estimate.subtotalCents, estimate.unitCents, estimate.totalCents]).toEqual([115, 57, 435]);
    expect(calls[0]?.body).toBeUndefined();
  });

  it("uploads a file: asks for a URL, PUTs the bytes, confirms", async () => {
    const placeholder = { id: 9999, name: "ducky", type: "stl", platformId: PLATFORM, publicFileServiceId: "file-1" };
    const { fetchImpl, calls } = fakeFetch({
      "POST /files/direct-upload": ok({ presignedUrl: "https://bucket.example/upload?sig=abc", key: "k", filePlaceholder: placeholder }),
      "PUT https://bucket.example/upload?sig=abc": { status: 200, text: "" },
      "POST /files/confirm-upload": ok({ ...placeholder, metrics: { weight: 10.43 } }),
    });
    const bytes = new Uint8Array([115, 111, 108, 105, 100]);
    const file = await createSlant3dCatalogClient({ apiKey: "sl-test", platformId: PLATFORM, fetchImpl }).uploadFile({ name: "ducky", bytes, ownerId: "store" });

    expect(calls.map((c) => c.method)).toEqual(["POST", "PUT", "POST"]);
    expect(calls[0]?.body).toEqual({ name: "ducky", platformId: PLATFORM, ownerId: "store" });
    expect(calls[1]?.body).toBe(bytes);
    expect(calls[1]?.headers).toEqual({ "Content-Type": "application/octet-stream" });
    expect(calls[2]?.body).toEqual({ filePlaceholder: placeholder });
    expect(file.publicFileServiceId).toBe("file-1");
  });

  it("does not confirm an upload whose PUT failed", async () => {
    const { fetchImpl, calls } = fakeFetch({
      "POST /files/direct-upload": ok({ presignedUrl: "https://bucket.example/upload", key: "k", filePlaceholder: { publicFileServiceId: "file-1" } }),
      "PUT https://bucket.example/upload": { status: 403, text: "<Error><Code>AccessDenied</Code></Error>" },
    });
    await expect(createSlant3dCatalogClient({ apiKey: "k", platformId: PLATFORM, fetchImpl }).uploadFile({ name: "ducky", bytes: new ArrayBuffer(4) })).rejects.toMatchObject({ name: "Slant3dApiError", status: 403 });
    expect(calls).toHaveLength(2);
  });

  it("needs a platform id to upload", async () => {
    const { fetchImpl, calls } = fakeFetch({});
    await expect(createSlant3dCatalogClient({ apiKey: "k", fetchImpl }).uploadFile({ name: "ducky", bytes: new Uint8Array(1) })).rejects.toThrow(/platform id/);
    expect(calls).toEqual([]);
  });

  it("lists filaments", async () => {
    const { fetchImpl } = fakeFetch({ "GET /filaments": { json: { success: true, message: "ok", data: FILAMENTS, count: 3 } } });
    expect(await createSlant3dCatalogClient({ apiKey: "k", fetchImpl }).listFilaments()).toEqual(FILAMENTS);
  });

  it("sets the webhook URL and reads the webhook secret", async () => {
    const platform = { id: PLATFORM, name: "Store", webhookURL: "https://store.example/hooks/slant3d", webhookSecret: "s".repeat(40) };
    const { fetchImpl, calls } = fakeFetch({ [`PATCH /platforms/${PLATFORM}`]: ok(platform), [`GET /platforms/${PLATFORM}`]: ok(platform) });
    const client = createSlant3dCatalogClient({ apiKey: "k", platformId: PLATFORM, fetchImpl });
    expect((await client.setWebhookUrl("https://store.example/hooks/slant3d")).webhookURL).toBe("https://store.example/hooks/slant3d");
    expect(calls[0]?.body).toEqual({ webhookURL: "https://store.example/hooks/slant3d" });
    expect(await client.getWebhookSecret()).toBe("s".repeat(40));
  });

  it("refuses a webhook secret Slant would reject", async () => {
    const { fetchImpl, calls } = fakeFetch({ [`PATCH /platforms/${PLATFORM}`]: ok({ id: PLATFORM, name: "Store" }) });
    const client = createSlant3dCatalogClient({ apiKey: "k", platformId: PLATFORM, fetchImpl });
    await expect(client.setWebhookSecret("too-short")).rejects.toThrow(InvalidSlant3dWebhookSecretError);
    await expect(client.setWebhookSecret(`${"a".repeat(40)} `)).rejects.toThrow(InvalidSlant3dWebhookSecretError);
    expect(calls).toEqual([]);
    await client.setWebhookSecret("a".repeat(32));
    expect(calls[0]?.body).toEqual({ webhookSecret: "a".repeat(32) });
  });

  it("rotates the secret, sends a test webhook, and creates a platform", async () => {
    const { fetchImpl, calls } = fakeFetch({
      [`PATCH /platforms/${PLATFORM}/webhook-secret`]: ok({ id: PLATFORM, name: "Store", webhookSecret: "n".repeat(64) }),
      [`POST /platforms/${PLATFORM}/webhook/dummy`]: ok({ success: false, response: { status: 401 } }),
      "POST /platforms": ok({ id: "new", name: "Store" }, 201),
    });
    const client = createSlant3dCatalogClient({ apiKey: "k", platformId: PLATFORM, fetchImpl });
    expect((await client.rotateWebhookSecret()).webhookSecret).toBe("n".repeat(64));
    expect(await client.sendTestWebhook()).toEqual({ success: false, response: { status: 401 } });
    expect((await client.createPlatform({ name: "Store", url: "https://store.example" })).id).toBe("new");
    expect(calls[0]?.body).toBeUndefined();
  });
});

describe("planSlant3dProduct", () => {
  const spec: Slant3dProductSpec = { slug: "ducky", title: "Ducky", description: "A duck.", fileId: "file-1", variants: [{ filamentId: "fil-black", retailCents: 1500 }, { filamentId: "fil-red", retailCents: 400 }, { filamentId: "fil-gone", retailCents: 1500 }, { filamentId: "fil-unknown", retailCents: 1500 }] };

  it("prices one unit per filament through the estimate endpoint", async () => {
    const { fetchImpl, calls } = fakeFetch({ "POST /files/file-1/estimate": (call) => ok({ subtotal: 3.55, pricePerUnit: 3.55, quantity: 1, total: (call.body as { options: { filamentId: string } }).options.filamentId === "fil-red" ? 4.35 : 3.55 }) });
    const costs = await estimateSlant3dUnitCosts(createSlant3dCatalogClient({ apiKey: "k", fetchImpl }), "file-1", ["fil-black", "fil-red", "fil-black"]);
    expect(costs).toEqual({ "fil-black": 355, "fil-red": 435 });
    expect(calls.map((c) => c.body)).toEqual([{ options: { filamentId: "fil-black", quantity: 1 } }, { options: { filamentId: "fil-red", quantity: 1 } }]);
  });

  it("works out each SKU's cost and margin, and sets aside filaments Slant can't print", () => {
    const plan = planSlant3dProduct(spec, FILAMENTS, { "fil-black": 355, "fil-red": 435 });
    expect(plan.skus).toEqual([
      { filamentId: "fil-black", material: "PLA", color: "black", price: { amount: 1500, currency: "USD" }, costCents: 355, marginCents: 1145 },
      { filamentId: "fil-red", material: "PETG", color: "red", price: { amount: 400, currency: "USD" }, costCents: 435, marginCents: -35 },
    ]);
    expect(plan.unavailable).toEqual(["fil-gone", "fil-unknown"]);
  });

  it("refuses to plan without a cost, or with two filaments of the same material and colour", () => {
    expect(() => planSlant3dProduct(spec, FILAMENTS, { "fil-black": 355 })).toThrow(/fil-red/);
    const twins = [filament("a", "PLA", "black"), filament("b", "PLA", "black")];
    expect(() => planSlant3dProduct({ ...spec, variants: [{ filamentId: "a", retailCents: 1 }, { filamentId: "b", retailCents: 1 }] }, twins, { a: 1, b: 1 })).toThrow(/only one/);
  });

  function memoryCatalog() {
    type Sku = Awaited<ReturnType<Slant3dCatalogWriter["createSku"]>> & { productId: string };
    const products: { id: string; slug: string }[] = [];
    const skus: Sku[] = [];
    const catalog: Slant3dCatalogWriter = {
      getProductBySlug: async (slug) => products.find((p) => p.slug === slug) ?? null,
      async createProduct(input) {
        const product = { id: `prod-${products.length + 1}`, slug: input.slug };
        products.push(product);
        return product;
      },
      listSkusByProduct: async (productId) => skus.filter((s) => s.productId === productId),
      async createSku(input) {
        const sku = { id: `sku-${skus.length + 1}`, ...input };
        skus.push(sku);
        return sku;
      },
      async updateSku(id, patch) {
        const sku = skus.find((s) => s.id === id);
        if (sku && patch.price) sku.price = patch.price;
        return sku ?? null;
      },
    };
    return { catalog, products, skus };
  }

  it("creates the product, SKUs, mappings and routing, and is safe to run again", async () => {
    const { catalog, products, skus } = memoryCatalog();
    const mappings = createInMemoryProviderCatalogMappingRepository();
    const routed: [string, string][] = [];
    const deps = { catalog, mappings, routing: { setProviderForSku: async (skuId: string, provider: string) => void routed.push([skuId, provider]) } };
    const plan = planSlant3dProduct(spec, FILAMENTS, { "fil-black": 355, "fil-red": 435 });

    expect(await applySlant3dProduct(deps, plan)).toEqual({ productId: "prod-1", created: ["sku-1", "sku-2"], updated: [] });
    expect(await mappings.list(SLANT3D_PROVIDER)).toEqual([
      { skuId: "sku-1", provider: "slant3d", target: { fileId: "file-1", filamentId: "fil-black" } },
      { skuId: "sku-2", provider: "slant3d", target: { fileId: "file-1", filamentId: "fil-red" } },
    ]);
    expect(routed).toEqual([["sku-1", "slant3d"], ["sku-2", "slant3d"]]);

    const repriced = planSlant3dProduct({ ...spec, variants: [{ filamentId: "fil-black", retailCents: 1800 }, { filamentId: "fil-red", retailCents: 400 }] }, FILAMENTS, { "fil-black": 355, "fil-red": 435 });
    expect(await applySlant3dProduct(deps, repriced)).toEqual({ productId: "prod-1", created: [], updated: [] });
    expect(skus[0]?.price.amount).toBe(1500);
    expect(await applySlant3dProduct(deps, repriced, { updatePrices: true })).toEqual({ productId: "prod-1", created: [], updated: ["sku-1"] });
    expect(skus[0]?.price.amount).toBe(1800);
    expect(products).toHaveLength(1);
    expect(skus).toHaveLength(2);
  });
});

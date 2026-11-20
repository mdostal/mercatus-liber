import { readFileSync } from "node:fs";
import type { Sku } from "@mercatus-liber/core";
import { createInMemoryProviderCatalogMappingRepository } from "@mercatus-liber/fulfillment";
import { describe, expect, it, vi } from "vitest";
import {
  createPrintfulCatalogCache,
  createPrintfulCatalogClient,
  filterPrintfulCatalog,
  printfulFetch,
  printfulProductsInStore,
  PrintfulRateLimitError,
  templateFor,
  type PrintfulCatalogCategory,
  type PrintfulCatalogListing,
} from "../src/index.js";

const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/printful-v2-catalog-2026-11-20.json", import.meta.url), "utf8"));

function fakePrintful(routes: Record<string, unknown>) {
  const calls: string[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const key = url.pathname + url.search;
    calls.push(key);
    const match = Object.keys(routes).find((route) => key === route || key.startsWith(route + (route.includes("?") ? "&" : "?")) || url.pathname === route);
    if (!match) return new Response(JSON.stringify({ error: "no route" }), { status: 404 });
    return new Response(JSON.stringify(routes[match]), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("catalog browsing", () => {
  it("lists a page of the catalog with filters sent comma separated", async () => {
    const { fetchImpl, calls } = fakePrintful({ "/v2/catalog-products": FIXTURE.list });
    const client = createPrintfulCatalogClient({ apiToken: "t", fetchImpl });
    const page = await client.listCatalogProducts({ categoryIds: [24, 1], techniques: ["dtg"], limit: 500 });
    expect(page.total).toBe(575);
    expect(page.products[0]).toMatchObject({ id: 1, name: "Enhanced Matte Paper Poster (in)", techniques: [{ key: "digital" }] });
    expect(calls[0]).toBe("/v2/catalog-products?category_ids=24%2C1&techniques=dtg&limit=100&offset=0");
  });

  it("follows paging to list everything", async () => {
    const product = (id: number) => ({ ...FIXTURE.list.data[0], id });
    const pages = [Array.from({ length: 100 }, (_, i) => product(i)), [product(100), product(101)]];
    let n = 0;
    const fetchImpl = (async () => new Response(JSON.stringify({ data: pages[n++] ?? [], paging: { total: 102, offset: 0, limit: 100 } }), { status: 200 })) as unknown as typeof fetch;
    const all = await createPrintfulCatalogClient({ apiToken: "t", fetchImpl }).listAllCatalogProducts();
    expect(all).toHaveLength(102);
    expect(n).toBe(2);
  });

  it("reads print areas in inches and dpi, with the pixel size a print file should be", async () => {
    const { fetchImpl, calls } = fakePrintful({ "/v2/catalog-products/71/mockup-styles": FIXTURE.mockupStyles });
    const areas = await createPrintfulCatalogClient({ apiToken: "t", fetchImpl }).getPrintAreas(71, { placements: ["front", "sleeve_left"] });
    expect(calls[0]).toBe("/v2/catalog-products/71/mockup-styles?placements=front,sleeve_left&limit=100&offset=0");
    expect(areas[0]).toMatchObject({ placement: "front", technique: "dtg", widthInches: 12, heightInches: 16, dpi: 150, widthPx: 1800, heightPx: 2400, areaType: "simple" });
    expect(areas.find((a) => a.placement === "sleeve_left")).toMatchObject({ widthPx: 600, heightPx: 525 });
    expect(areas[0]!.mockupStyles[0]).toMatchObject({ id: expect.any(Number), view: "Front" });
  });

  it("reads templates and picks the one for a variant and placement", async () => {
    const { fetchImpl } = fakePrintful({ "/v2/catalog-products/71/mockup-templates": FIXTURE.mockupTemplates });
    const templates = await createPrintfulCatalogClient({ apiToken: "t", fetchImpl }).getMockupTemplates(71, { placements: ["front", "back"] });
    const front = templateFor(templates, 4025, "front");
    expect(front).toMatchObject({ placement: "front", positioning: "overlay", printArea: { top: expect.any(Number), left: expect.any(Number) } });
    expect(front!.printArea.width).toBeGreaterThan(0);
    expect(templateFor(templates, 4025, "sleeve_left")).toBeNull();
  });

  it("reads availability by technique and region", async () => {
    const { fetchImpl } = fakePrintful({ "/v2/catalog-products/71/availability": FIXTURE.availability });
    const availability = await createPrintfulCatalogClient({ apiToken: "t", fetchImpl }).getAvailability(71);
    expect(availability[0]).toMatchObject({ catalogVariantId: 4025, techniques: expect.arrayContaining([{ technique: "dtg", regions: [{ name: "usa", availability: "in stock" }] }]) });
  });
});

describe("printfulFetch", () => {
  it("waits out a short Retry-After once, then throws PrintfulRateLimitError", async () => {
    const sleep = vi.fn(async () => {});
    let n = 0;
    const limited = (async () => (n++ < 1 ? new Response("{}", { status: 429, headers: { "Retry-After": "2" } }) : new Response("{}", { status: 200 }))) as unknown as typeof fetch;
    expect((await printfulFetch(limited, "https://api.printful.com/v2/x", {}, { sleep })).status).toBe(200);
    expect(sleep).toHaveBeenCalledWith(2000);
    const always = (async () => new Response("{}", { status: 429, headers: { "Retry-After": "2" } })) as unknown as typeof fetch;
    await expect(printfulFetch(always, "https://api.printful.com/v2/x", {}, { sleep })).rejects.toThrow(PrintfulRateLimitError);
    const long = (async () => new Response("{}", { status: 429, headers: { "Retry-After": "60" } })) as unknown as typeof fetch;
    await expect(printfulFetch(long, "https://api.printful.com/v2/x", { method: "POST" }, { sleep })).rejects.toMatchObject({ retryAfterSeconds: 60, method: "POST", path: "/v2/x" });
  });
});

const listing = (over: Partial<PrintfulCatalogListing>): PrintfulCatalogListing => ({
  id: 1,
  type: "T-SHIRT",
  main_category_id: 24,
  name: "Unisex Staple T-Shirt",
  brand: "Bella + Canvas",
  model: "3001",
  image: "",
  variant_count: 1,
  is_discontinued: false,
  description: "",
  sizes: ["S"],
  colors: [{ name: "Black", value: "#000" }],
  techniques: [{ key: "dtg", display_name: "DTG printing", is_default: true }],
  placements: [{ placement: "front", technique: "dtg" }],
  ...over,
});
const CATEGORIES: PrintfulCatalogCategory[] = [
  { id: 1, parent_id: null, image_url: "", title: "Men's clothing" },
  { id: 24, parent_id: 1, image_url: "", title: "T-shirts" },
  { id: 55, parent_id: null, image_url: "", title: "Posters" },
];

describe("filterPrintfulCatalog", () => {
  const products = [
    listing({ id: 71 }),
    listing({ id: 1, name: "Enhanced Matte Paper Poster", brand: null, model: "", type: "POSTER", main_category_id: 55, techniques: [{ key: "digital", display_name: "Digital", is_default: true }], placements: [{ placement: "default", technique: "digital" }] }),
    listing({ id: 9, name: "Old Tee", is_discontinued: true }),
  ];
  const ids = (f: Parameters<typeof filterPrintfulCatalog>[1]) => filterPrintfulCatalog({ products, categories: CATEGORIES }, f).map((p) => p.id);
  it("searches every word across name, brand, model and type, and hides discontinued products", () => {
    expect(ids({ search: "bella 3001" })).toEqual([71]);
    expect(ids({ search: "poster" })).toEqual([1]);
    expect(ids({})).toEqual([71, 1]);
    expect(ids({ includeDiscontinued: true })).toEqual([71, 1, 9]);
  });
  it("filters by a category and the categories under it, technique and placement", () => {
    expect(ids({ categoryId: 1 })).toEqual([71]);
    expect(ids({ technique: "digital" })).toEqual([1]);
    expect(ids({ placement: "front" })).toEqual([71]);
  });
});

describe("createPrintfulCatalogCache", () => {
  const snapshotOf = (at: string) => ({ fetchedAt: at, products: [listing({})], categories: CATEGORIES });
  it("reads Printful once, serves memory until the TTL passes, and saves each fresh copy", async () => {
    let clock = new Date("2026-11-20T00:00:00Z");
    const fetch = vi.fn(async () => ({ products: [listing({})], categories: CATEGORIES }));
    const save = vi.fn(async () => {});
    const cache = createPrintfulCatalogCache({ fetch, save, ttlMs: 1000, now: () => clock });
    await cache.get();
    await cache.get();
    expect(fetch).toHaveBeenCalledTimes(1);
    clock = new Date(clock.getTime() + 2000);
    await cache.get();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("serves a saved snapshot without a token, and a stale copy when Printful fails", async () => {
    const noToken = createPrintfulCatalogCache({ load: async () => snapshotOf("2020-01-01T00:00:00Z") });
    expect((await noToken.get()).fetchedAt).toBe("2020-01-01T00:00:00Z");
    const failing = createPrintfulCatalogCache({ load: async () => snapshotOf("2020-01-01T00:00:00Z"), fetch: async () => { throw new Error("down"); } });
    expect((await failing.get()).fetchedAt).toBe("2020-01-01T00:00:00Z");
    await expect(createPrintfulCatalogCache({}).get()).rejects.toThrow(/No Printful catalog/);
  });
});

describe("printfulProductsInStore", () => {
  const sku = (id: string, productId: string): Sku => ({ id, productId, identifyingAttributes: [], price: { amount: 1, currency: "USD" }, status: "active" });
  it("maps Printful products to this store's products only, resolving older mappings by variant", async () => {
    const mappings = createInMemoryProviderCatalogMappingRepository();
    await mappings.save({ skuId: "a", provider: "printful", target: { catalogVariantId: 4025, catalogProductId: 71 } });
    await mappings.save({ skuId: "b", provider: "printful", target: { catalogVariantId: 4026, catalogProductId: 71 } });
    await mappings.save({ skuId: "c", provider: "printful", target: { catalogVariantId: 474 } });
    await mappings.save({ skuId: "other-store", provider: "printful", target: { catalogVariantId: 1, catalogProductId: 1 } });
    await mappings.save({ skuId: "x3d", provider: "x3d", target: { catalogProductId: 5 } });
    const skus: Record<string, Sku> = { a: sku("a", "tee"), b: sku("b", "tee"), c: sku("c", "gildan"), "other-store": sku("other-store", "poster"), x3d: sku("x3d", "box") };
    const variantProductId = vi.fn(async (id: number) => (id === 474 ? 12 : null));
    const found = await printfulProductsInStore({ mappings, getSku: async (id) => skus[id] ?? null, productIds: ["tee", "gildan", "box"], variantProductId });
    expect([...found]).toEqual([
      [71, ["tee"]],
      [12, ["gildan"]],
    ]);
    expect(variantProductId).toHaveBeenCalledTimes(1);
  });
});

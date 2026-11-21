import type { Product } from "@mercatus-liber/core";
import { describe, expect, it } from "vitest";
import { createInMemoryStoreApiKeyRepository, createStoreApiHandler, createStoreApiKey, type StoreApiDeps, type StoreApiLine } from "../src/index.js";

const NOW = new Date("2026-11-29T00:00:00Z");
const product = (id: string, over: Partial<Product> = {}): Product => ({ id, slug: id, title: id, description: "", identifyingAttributeKeys: [], status: "active", ...over });
const LINES: StoreApiLine[] = [
  { id: "l2", slug: "ember", name: "Ember", description: "", activeFrom: "2026-12-07T18:00:00Z", activeTo: "2026-12-14T18:00:00Z", sections: [] },
  { id: "l1", slug: "frost", name: "Frost", description: "Week 1", activeFrom: "2026-11-30T18:00:00Z", activeTo: "2026-12-07T18:00:00Z", hero: { title: "Frost" }, sections: [{ slug: "desk", title: "Desk", productIds: ["mat", "gone"] }, { slug: "hats", title: "Hats", productIds: ["draft-hat"] }] },
  { id: "l0", slug: "always", name: "Always", description: "" },
  { id: "lx", slug: "secret", name: "Secret", description: "", status: "draft" },
];

async function setup() {
  const products = [product("mat", { activeFrom: "2026-11-30T18:00:00Z", activeTo: "2026-12-07T18:00:00Z" }), product("draft-hat", { status: "draft" })];
  const deps: StoreApiDeps = {
    store: { name: "Shop", currency: "USD", url: "https://shop.example" },
    catalog: { listProducts: async () => products, getProduct: async (id) => products.find((p) => p.id === id) ?? null, listSkusByProduct: async () => [] },
    lines: { listLines: async () => LINES, getLine: async (key) => LINES.find((l) => l.id === key || l.slug === key) ?? null },
    now: () => NOW,
  };
  const keys = createInMemoryStoreApiKeyRepository();
  const secret = (await createStoreApiKey(keys, { name: "flayr", scopes: ["products:read"] })).secret;
  const handle = createStoreApiHandler({ deps, keys, basePath: "/v1" });
  return async (path: string) => {
    const res = await handle(new Request(`https://shop.example/v1${path}`, { headers: { authorization: `Bearer ${secret}` } }));
    return { status: res.status, body: (await res.json()) as any };
  };
}

describe("lines in the store API", () => {
  it("lists lines soonest first with their window and state, hiding drafts, and filters by state", async () => {
    const get = await setup();
    const { body } = await get("/lines");
    expect(body.data.map((l: any) => [l.slug, l.saleWindow.state])).toEqual([["always", "active"], ["frost", "upcoming"], ["ember", "upcoming"]]);
    expect(body.data[1]).toMatchObject({ url: "https://shop.example/lines/frost", hero: { title: "Frost" }, saleWindow: { activeFrom: "2026-11-30T18:00:00.000Z", nextChangeAt: "2026-11-30T18:00:00.000Z" } });
    expect((await get("/lines?state=active")).body.data.map((l: any) => l.slug)).toEqual(["always"]);
    expect((await get("/lines?state=soon")).status).toBe(400);
  });

  it("returns one line with its active products and their sale windows, and 404 for drafts and unknowns", async () => {
    const get = await setup();
    const { status, body } = await get("/lines/frost");
    expect(status).toBe(200);
    expect(body.data.products.map((p: any) => [p.id, p.saleWindow.state])).toEqual([["mat", "upcoming"]]);
    expect(body.data.sections[0]).toEqual({ slug: "desk", title: "Desk", productIds: ["mat", "gone"] });
    expect((await get("/lines/l1")).status).toBe(200);
    expect((await get("/lines/secret")).status).toBe(404);
    expect((await get("/lines/nope")).status).toBe(404);
  });

  it("gives every product its sale window", async () => {
    const get = await setup();
    expect((await get("/products/mat")).body.data.saleWindow).toEqual({ activeFrom: "2026-11-30T18:00:00.000Z", activeTo: "2026-12-07T18:00:00.000Z", state: "upcoming", nextChangeAt: "2026-11-30T18:00:00.000Z" });
  });
});

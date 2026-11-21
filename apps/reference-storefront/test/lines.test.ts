import { afterEach, describe, expect, it, vi } from "vitest";

async function servicesFor(slug: "print-shop" | "northline") {
  for (const key of ["DATABASE_URL", "MONGODB_URL", "MONGODB_URI", "CONVEX_URL", "SQLITE_FILE_PATH", "SANITY_PROJECT_ID"]) vi.stubEnv(key, "");
  vi.resetModules();
  const { getServicesForDemo, __resetServicesCacheForTests } = await import("../lib/services");
  __resetServicesCacheForTests();
  return getServicesForDemo(slug);
}

describe("lines in the demo", { timeout: 60_000 }, () => {
  afterEach(() => vi.unstubAllEnvs());

  it("lists print-shop's lines soonest first with their state, and only in print-shop", async () => {
    const { listLinesForDemo } = await import("../lib/lines");
    const s = await servicesFor("print-shop");
    const lines = await listLinesForDemo(s.catalog, "print-shop", new Date("2026-11-29T00:00:00Z"));
    expect(lines.map((l) => [l.line.slug, l.lifecycle.state])).toEqual([
      ["fleece-favorites", "active"],
      ["holiday-week-one", "upcoming"],
    ]);
    expect(await listLinesForDemo(s.catalog, "northline")).toEqual([]);
  });

  it("gives a line its landing page by section, and none for another demo", async () => {
    const { getLineForDemo } = await import("../lib/lines");
    const s = await servicesFor("print-shop");
    const landing = (await getLineForDemo(s.catalog, "print-shop", "holiday-week-one", new Date("2026-12-01T00:00:00Z")))!;
    expect(landing.lifecycle.state).toBe("active");
    expect(landing.sections.map((x) => [x.slug, x.products.length])).toEqual([["drinkware", 2], ["coasters", 2], ["accessories", 2]]);
    expect(await getLineForDemo(s.catalog, "northline", "holiday-week-one")).toBeNull();
    expect(await getLineForDemo(s.catalog, "print-shop", "the-print-shop")).toBeNull();
  });
});

describe("search scoped to a line or category", { timeout: 60_000 }, () => {
  afterEach(() => vi.unstubAllEnvs());

  it("limits search to a line's products, to a category's, and ignores another demo's line", async () => {
    const { searchScope } = await import("../lib/search-scope");
    const s = await servicesFor("print-shop");
    const line = (await searchScope(s, "print-shop", { line: "holiday-week-one" }))!;
    expect(line).toMatchObject({ kind: "line", slug: "holiday-week-one", title: "Holiday Week One" });
    expect(line.ids).toHaveLength(6);
    const all = await s.search.query({ text: "embroidered" });
    const inLine = await s.search.query({ text: "embroidered", ids: line.ids });
    expect(all.length).toBeGreaterThan(inLine.length);
    expect(inLine.map((d) => d.title).sort()).toEqual(["Embroidered Luggage Tag", "Embroidered Zip Pouch"].sort());
    expect(await searchScope(s, "northline", { line: "holiday-week-one" })).toBeNull();
    expect(await searchScope(s, "print-shop", {})).toBeNull();
  });
});

describe("a promotion on a whole line", { timeout: 60_000 }, () => {
  afterEach(() => vi.unstubAllEnvs());

  it("discounts the line's items and leaves the rest of the cart alone", async () => {
    const s = await servicesFor("print-shop");
    const line = (await s.catalog.getCatalogBySlug("holiday-week-one"))!;
    const mug = (await s.catalog.getProductBySlug("custom-printed-ceramic-mug"))!;
    const hoodie = (await s.catalog.getProductBySlug("embroidered-fleece-hoodie"))!;
    const mugSku = (await s.catalog.listSkusByProduct(mug.id))[0]!;
    const hoodieSku = (await s.catalog.listSkusByProduct(hoodie.id))[0]!;
    await s.promotions.createPromotion({ code: `WEEK1-${Date.now()}`, kind: "percentage", scope: "product", value: 25, currency: "USD", targetSkuIds: [], targetCollectionIds: [line.id], minCartAmount: null, startsAt: null, endsAt: null, usageLimit: null, demoSlug: "print-shop" });
    const code = (await s.promotions.listPromotions({ demoSlug: "print-shop" })).find((p) => p.targetCollectionIds?.includes(line.id))!.code!;
    const result = await s.promotions.evaluate({ items: [{ skuId: mugSku.id, quantity: 1, priceSnapshot: mugSku.price }, { skuId: hoodieSku.id, quantity: 1, priceSnapshot: hoodieSku.price }], couponCode: code, demoSlug: "print-shop" });
    expect(result.items.find((i) => i.skuId === mugSku.id)!.unitAmount.amount).toBe(Math.max(0, mugSku.price.amount - Math.round(mugSku.price.amount * 0.25)));
    expect(result.items.find((i) => i.skuId === hoodieSku.id)!.unitAmount.amount).toBe(hoodieSku.price.amount);
  });
});

describe("marketing tiles", { timeout: 60_000 }, () => {
  afterEach(() => vi.unstubAllEnvs());

  it("links tiles to lines, categories, products and safe URLs only", async () => {
    const { marketingTileHref } = await import("../components/cms-sections");
    expect(marketingTileHref("print-shop", "line", "holiday-week-one")).toBe("/demo/print-shop/lines/holiday-week-one");
    expect(marketingTileHref("print-shop", "category", "embroidery")).toBe("/demo/print-shop/category/embroidery");
    expect(marketingTileHref("print-shop", "url", "javascript:alert(1)")).toBeNull();
    expect(marketingTileHref("print-shop", "url", "http://insecure.example")).toBeNull();
    expect(marketingTileHref("print-shop", "url", "/demo/print-shop/search?q=mug")).toBe("/demo/print-shop/search?q=mug");
    expect(marketingTileHref("print-shop", "banner", "x")).toBeNull();
  });

  it("seeds the print-shop home page with one tile into the holiday line, once", async () => {
    const s = await servicesFor("print-shop");
    const home = (await s.cms.getPageBySlug("home-print-shop"))!;
    const tiles = home.sections.filter((x) => x.componentType === "marketing-tile");
    expect(tiles).toEqual([{ componentType: "marketing-tile", config: expect.objectContaining({ targetKind: "line", target: "holiday-week-one", placement: "hp" }) }]);
    expect(home.sections[1]!.componentType).toBe("marketing-tile");
  });
});

describe("sales by line in the demo's BI", { timeout: 60_000 }, () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reports each print-shop line, and none for a demo without lines", async () => {
    const s = await servicesFor("print-shop");
    const report = await s.bi.getSalesByCollection();
    expect(report.map((r) => r.name).sort()).toEqual(["Fleece Favorites", "Holiday Week One"]);
    expect(report.find((r) => r.name === "Holiday Week One")).toMatchObject({ kind: "line", productCount: 6, period: { from: "2026-11-30T18:00:00.000Z", to: "2026-12-07T18:00:00.000Z" } });
    const n = await servicesFor("northline");
    expect(await n.bi.getSalesByCollection()).toEqual([]);
  });
});

describe("lines in the demo's Store API", { timeout: 60_000 }, () => {
  afterEach(() => vi.unstubAllEnvs());

  it("lists print-shop's lines and returns one with its products", async () => {
    const { createStoreApiKey } = await import("@mercatus-liber/store-api");
    const s = await servicesFor("print-shop");
    const { secret } = await createStoreApiKey(s.storeApiKeys, { name: "test", scopes: ["products:read"] });
    const get = async (path: string) => {
      const res = await s.storeApi(new Request(`https://commerce.example/api/store/v1/print-shop${path}`, { headers: { authorization: `Bearer ${secret}` } }));
      return { status: res.status, body: (await res.json()) as { data: any } };
    };
    const lines = await get("/lines");
    expect(lines.body.data.map((l: { slug: string }) => l.slug).sort()).toEqual(["fleece-favorites", "holiday-week-one"]);
    const line = await get("/lines/holiday-week-one");
    expect(line.status).toBe(200);
    expect(line.body.data.products).toHaveLength(6);
    expect(line.body.data.url).toMatch(/\/demo\/print-shop\/lines\/holiday-week-one$/);
  });
});

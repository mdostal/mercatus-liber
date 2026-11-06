import { createInMemoryProviderCatalogMappingRepository, createInMemoryFulfillmentRoutingRepository } from "@mercatus-liber/fulfillment";
import { describe, expect, it, vi } from "vitest";
import { createPrintfulCatalogClient, printfulPriceToCents, printfulUnitCostCents, type PrintfulCatalogVariant, type PrintfulPrices } from "../src/catalog.js";
import { assertShippableRecipient, IncompleteRecipientError, mapPrintfulOrderStatus } from "../src/mapping.js";
import { applyPrintfulProduct, planPrintfulProduct, type PrintfulCatalogWriter, type PrintfulProductSpec } from "../src/products.js";

// Shapes and numbers from live v2 responses for product 12 (Gildan 64000), 2026-11-06.
const PRICES: PrintfulPrices = {
  currency: "USD",
  product: { id: 12, placements: [{ id: "front", title: "Front print", technique_key: "dtg", price: "5.95", discounted_price: "5.95" }, { id: "back", title: "Back print", technique_key: "dtg", price: "5.95", discounted_price: "5.95" }] },
  variants: [
    { id: 474, techniques: [{ technique_key: "dtg", price: "9.63", discounted_price: "9.63" }] },
    { id: 598, techniques: [{ technique_key: "dtg", price: "11.63", discounted_price: "11.63" }] },
  ],
};
const VARIANTS: PrintfulCatalogVariant[] = [
  { id: 474, catalog_product_id: 12, name: "Black / S", size: "S", color: "Black", color_code: "#0e0e0e", image: "" },
  { id: 598, catalog_product_id: 12, name: "Black / 2XL", size: "2XL", color: "Black", color_code: "#0e0e0e", image: "" },
];
const SPEC: PrintfulProductSpec = {
  slug: "dt-tee",
  title: "DT Tee",
  description: "Tee",
  printfulProductId: 12,
  technique: "dtg",
  files: [{ placement: "front", url: "https://example.com/front.png" }],
  colors: ["Black"],
  pricing: { retailCents: 2800, sizeUpchargeCents: { "2XL": 300 } },
};

describe("prices", () => {
  it("converts dollar strings to cents exactly", () => {
    expect(printfulPriceToCents("9.63")).toBe(963);
    expect(printfulPriceToCents("5")).toBe(500);
    expect(printfulPriceToCents("0.5")).toBe(50);
  });

  it("🔍 includes one placement in the variant price, matching real draft-order costs (9.63 front, 15.58 front and back)", () => {
    expect(printfulUnitCostCents(PRICES, 474, "dtg", ["front"])).toBe(963);
    expect(printfulUnitCostCents(PRICES, 474, "dtg", ["back"])).toBe(963);
    expect(printfulUnitCostCents(PRICES, 474, "dtg", ["front", "back"])).toBe(1558);
    expect(() => printfulUnitCostCents(PRICES, 474, "dtg", ["sleeve"])).toThrow(/sleeve/);
  });
});

describe("planPrintfulProduct", () => {
  it("prices every size, including upcharges, with cost and margin", () => {
    const plan = planPrintfulProduct(SPEC, VARIANTS, PRICES);
    expect(plan.skus.map((s) => [s.size, s.catalogVariantId, s.price.amount, s.costCents, s.marginCents])).toEqual([
      ["S", 474, 2800, 963, 1837],
      ["2XL", 598, 3100, 1163, 1937],
    ]);
  });

  it("🔍 lists a requested size Printful doesn't make instead of inventing a variant", () => {
    const plan = planPrintfulProduct({ ...SPEC, sizes: ["S", "5XL"] }, VARIANTS, PRICES);
    expect(plan.skus.map((s) => s.size)).toEqual(["S"]);
    expect(plan.unavailable).toEqual([{ color: "Black", size: "5XL" }]);
  });

  it("🔍 reports a negative margin rather than hiding it", () => {
    expect(planPrintfulProduct({ ...SPEC, pricing: { retailCents: 900 } }, VARIANTS, PRICES).skus[0]!.marginCents).toBe(-63);
  });
});

function fakeCatalog(): PrintfulCatalogWriter & { skus: Map<string, import("@mercatus-liber/core").Sku> } {
  const products = new Map<string, import("@mercatus-liber/core").Product>();
  const skus = new Map<string, import("@mercatus-liber/core").Sku>();
  let n = 0;
  return {
    skus,
    async getProductBySlug(slug) {
      return [...products.values()].find((p) => p.slug === slug) ?? null;
    },
    async createProduct(input) {
      const product = { id: `p${++n}`, status: "draft" as const, ...input };
      products.set(product.id, product);
      return product;
    },
    async listSkusByProduct(productId) {
      return [...skus.values()].filter((s) => s.productId === productId);
    },
    async createSku(input) {
      const sku = { id: `s${++n}`, status: "active" as const, ...input };
      skus.set(sku.id, sku);
      return sku;
    },
    async updateSku(id, patch) {
      const sku = skus.get(id);
      if (!sku) return null;
      const next = { ...sku, ...patch };
      skus.set(id, next);
      return next;
    },
  };
}

describe("applyPrintfulProduct", () => {
  it("creates the product and SKUs, stores mappings, and routes each SKU to Printful", async () => {
    const catalog = fakeCatalog();
    const mappings = createInMemoryProviderCatalogMappingRepository();
    const routing = createInMemoryFulfillmentRoutingRepository();
    const result = await applyPrintfulProduct({ catalog, mappings, routing }, planPrintfulProduct(SPEC, VARIANTS, PRICES));
    expect(result.created).toHaveLength(2);
    for (const id of result.created) expect(await routing.getProviderForSku(id)).toBe("printful");
    const target = (await mappings.get(result.created[0]!, "printful"))!.target;
    expect(target).toEqual({ catalogVariantId: 474, placements: [{ placement: "front", technique: "dtg", layers: [{ type: "file", url: "https://example.com/front.png" }] }] });
  });

  it("🔍 running again creates nothing and keeps an admin's price, unless told to update prices", async () => {
    const catalog = fakeCatalog();
    const deps = { catalog, mappings: createInMemoryProviderCatalogMappingRepository(), routing: createInMemoryFulfillmentRoutingRepository() };
    const first = await applyPrintfulProduct(deps, planPrintfulProduct(SPEC, VARIANTS, PRICES));
    await catalog.updateSku(first.created[0]!, { price: { amount: 3500, currency: "USD" } });
    const again = await applyPrintfulProduct(deps, planPrintfulProduct(SPEC, VARIANTS, PRICES));
    expect(again.created).toEqual([]);
    expect(catalog.skus.get(first.created[0]!)!.price.amount).toBe(3500);
    const forced = await applyPrintfulProduct(deps, planPrintfulProduct(SPEC, VARIANTS, PRICES), { updatePrices: true });
    expect(forced.updated).toEqual([first.created[0]]);
    expect(catalog.skus.get(first.created[0]!)!.price.amount).toBe(2800);
  });
});

describe("recipient and status", () => {
  it("🔍 refuses an address without a street line, city, country, or postal code before calling Printful", () => {
    expect(() => assertShippableRecipient({ name: "A", address1: "1 Main", city: "C", country_code: "US", zip: "60601" })).not.toThrow();
    expect(() => assertShippableRecipient({ name: "A", city: "C", country_code: "US", zip: "60601" })).toThrow(IncompleteRecipientError);
    expect(() => assertShippableRecipient({ name: "A", address1: " ", city: "C" })).toThrow(/address1, country_code, zip/);
  });

  it("maps a draft to held, and other unshipped states to submitted", () => {
    expect(mapPrintfulOrderStatus("draft", [])).toBe("held");
    expect(mapPrintfulOrderStatus("pending", [])).toBe("submitted");
  });
});

describe("createPrintfulCatalogClient", () => {
  it("follows variant pagination and sends the store header", async () => {
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      expect((init.headers as Record<string, string>)["X-PF-Store-Id"]).toBe("19");
      const offset = Number(new URL(url).searchParams.get("offset"));
      const data = offset === 0 ? Array.from({ length: 100 }, (_, i) => ({ ...VARIANTS[0], id: i })) : [{ ...VARIANTS[1] }];
      return new Response(JSON.stringify({ data, paging: { total: 101, limit: 100, offset } }), { status: 200 });
    });
    const client = createPrintfulCatalogClient({ apiToken: "t", storeId: "19", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await client.listVariants(12)).toHaveLength(101);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("🔍 follows price pagination, which defaults to 20 variants a page", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const offset = Number(new URL(url).searchParams.get("offset"));
      const variants = offset === 0 ? Array.from({ length: 100 }, (_, i) => ({ id: i, techniques: [] })) : [{ id: 505, techniques: [] }];
      return new Response(JSON.stringify({ data: { currency: "USD", product: { id: 12, placements: [] }, variants }, paging: { total: 101, limit: 100, offset } }), { status: 200 });
    });
    const prices = await createPrintfulCatalogClient({ apiToken: "t", fetchImpl: fetchImpl as unknown as typeof fetch }).getPrices(12);
    expect(prices!.variants).toHaveLength(101);
    expect(prices!.variants.at(-1)!.id).toBe(505);
  });

  it("builds the shipping-rate request in Printful's field names", async () => {
    let sent: unknown;
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ data: [{ shipping: "STANDARD", rate: "4.95" }] }), { status: 200 });
    });
    const client = createPrintfulCatalogClient({ apiToken: "t", fetchImpl: fetchImpl as unknown as typeof fetch });
    const rates = await client.getShippingRates({ recipient: { countryCode: "US", stateCode: "IL", postalCode: "60601" }, items: [{ catalogVariantId: 474, quantity: 1 }] });
    expect(sent).toEqual({ recipient: { country_code: "US", state_code: "IL", zip: "60601" }, order_items: [{ source: "catalog", catalog_variant_id: 474, quantity: 1 }] });
    expect(rates[0]!.rate).toBe("4.95");
  });
});

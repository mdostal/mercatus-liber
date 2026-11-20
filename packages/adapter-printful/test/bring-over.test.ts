import type { Product, Sku } from "@mercatus-liber/core";
import { createInMemoryFulfillmentRoutingRepository, createInMemoryProviderCatalogMappingRepository } from "@mercatus-liber/fulfillment";
import { describe, expect, it } from "vitest";
import {
  applyPrintfulProduct,
  planPrintfulProduct,
  printfulMockupImages,
  printfulMockupRequest,
  printfulReadiness,
  PrintfulProductNotReadyError,
  publishPrintfulProduct,
  setPrintfulArt,
  type PrintfulCatalogVariant,
  type PrintfulPrices,
  type PrintfulProductSpec,
} from "../src/index.js";

// Product 12 (Gildan 64000) prices as read live on 2026-11-06.
const PRICES: PrintfulPrices = {
  currency: "USD",
  product: { id: 12, placements: [{ id: "front", title: "Front print", technique_key: "dtg", price: "5.95", discounted_price: "5.95" }, { id: "back", title: "Back print", technique_key: "dtg", price: "5.95", discounted_price: "5.95" }] },
  variants: [{ id: 474, techniques: [{ technique_key: "dtg", price: "9.63", discounted_price: "9.63" }] }],
};
const VARIANTS: PrintfulCatalogVariant[] = [{ id: 474, catalog_product_id: 12, name: "Black / S", size: "S", color: "Black", color_code: "#0e0e0e", image: "" }];
const SPEC: PrintfulProductSpec = { slug: "tee", title: "Tee", description: "", printfulProductId: 12, technique: "dtg", files: [], colors: ["Black"], sizes: ["S"], pricing: { retailCents: 1200 } };

function store() {
  const products = new Map<string, Product>();
  const skus = new Map<string, Sku>();
  let n = 0;
  const catalog = {
    products,
    skus,
    async getProductBySlug(slug: string) {
      return [...products.values()].find((p) => p.slug === slug) ?? null;
    },
    async getProduct(id: string) {
      return products.get(id) ?? null;
    },
    async createProduct(input: { slug: string; title: string; description: string; identifyingAttributeKeys: string[] }) {
      const p = { id: `p${++n}`, status: "draft", ...input } as Product;
      products.set(p.id, p);
      return p;
    },
    async publishProduct(id: string) {
      const p = { ...products.get(id)!, status: "active" as const };
      products.set(id, p);
      return p;
    },
    async listSkusByProduct(productId: string) {
      return [...skus.values()].filter((s) => s.productId === productId);
    },
    async createSku(input: { productId: string; identifyingAttributes: Sku["identifyingAttributes"]; price: Sku["price"]; status?: "draft" | "active" }) {
      const sku: Sku = { id: `s${++n}`, ...input, status: input.status ?? "active" };
      skus.set(sku.id, sku);
      return sku;
    },
    async updateSku(id: string, patch: Partial<Sku>) {
      const next = { ...skus.get(id)!, ...patch };
      skus.set(id, next);
      return next;
    },
  };
  return { catalog, mappings: createInMemoryProviderCatalogMappingRepository(), routing: createInMemoryFulfillmentRoutingRepository() };
}

describe("bringing a Printful product over before its art exists", () => {
  it("creates draft SKUs with no print file, then keeps art added later when applied again", async () => {
    const deps = store();
    const { productId, created } = await applyPrintfulProduct(deps, planPrintfulProduct(SPEC, VARIANTS, PRICES));
    expect(deps.catalog.skus.get(created[0]!)!.status).toBe("draft");
    await setPrintfulArt(deps, productId, [{ placement: "front", technique: "dtg", url: "https://art.example/front.png" }]);
    await applyPrintfulProduct(deps, planPrintfulProduct(SPEC, VARIANTS, PRICES));
    const target = (await deps.mappings.get(created[0]!, "printful"))!.target as { placements: { placement: string; layers: { url: string }[] }[] };
    expect(target.placements).toEqual([{ placement: "front", technique: "dtg", layers: [{ type: "file", url: "https://art.example/front.png" }] }]);
    // New files in the spec replace that placement only.
    await applyPrintfulProduct(deps, planPrintfulProduct({ ...SPEC, files: [{ placement: "back", url: "https://art.example/back.png" }] }, VARIANTS, PRICES));
    const after = (await deps.mappings.get(created[0]!, "printful"))!.target as { placements: { placement: string }[] };
    expect(after.placements.map((p) => p.placement)).toEqual(["front", "back"]);
  });

  it("is not ready until every SKU has art, sells above Printful's cost with its placements, and the product has an image", async () => {
    const deps = store();
    const prices = async () => PRICES;
    const { productId, created } = await applyPrintfulProduct(deps, planPrintfulProduct(SPEC, VARIANTS, PRICES));
    let readiness = await printfulReadiness({ ...deps, prices }, productId);
    expect(readiness.problems.map((p) => p.code)).toEqual(["no-art", "no-image"]);

    // Front and back cost 9.63 + 5.95 = 15.58, more than the 12.00 price.
    await setPrintfulArt(deps, productId, [{ placement: "front", technique: "dtg", url: "https://a/f.png" }, { placement: "back", technique: "dtg", url: "https://a/b.png" }]);
    deps.catalog.products.set(productId, { ...deps.catalog.products.get(productId)!, images: [{ url: "https://a/mockup.jpg", alt: "Tee" }] });
    readiness = await printfulReadiness({ ...deps, prices }, productId);
    expect(readiness.problems.map((p) => p.code)).toEqual(["below-cost"]);
    expect(readiness.skus[0]).toMatchObject({ priceCents: 1200, costCents: 1558, hasArt: true, status: "draft" });
    await expect(publishPrintfulProduct({ ...deps, prices }, productId)).rejects.toThrow(PrintfulProductNotReadyError);
    expect(deps.catalog.skus.get(created[0]!)!.status).toBe("draft");

    await deps.catalog.updateSku(created[0]!, { price: { amount: 2400, currency: "USD" } });
    const published = await publishPrintfulProduct({ ...deps, prices }, productId);
    expect(published.ready).toBe(true);
    expect(deps.catalog.skus.get(created[0]!)!.status).toBe("active");
    expect(deps.catalog.products.get(productId)!.status).toBe("active");
  });

  it("puts a SKU back to draft when its last print file is removed", async () => {
    const deps = store();
    const { productId, created } = await applyPrintfulProduct(deps, planPrintfulProduct({ ...SPEC, files: [{ placement: "front", url: "https://a/f.png" }] }, VARIANTS, PRICES));
    expect(deps.catalog.skus.get(created[0]!)!.status).toBe("active");
    await setPrintfulArt(deps, productId, [], { remove: ["front"] });
    expect(deps.catalog.skus.get(created[0]!)!.status).toBe("draft");
  });
});

describe("mockups", () => {
  it("asks for the chosen SKUs' variants with their print files, and lists the images Printful made", async () => {
    const deps = store();
    const { created } = await applyPrintfulProduct(deps, planPrintfulProduct({ ...SPEC, files: [{ placement: "front", url: "https://a/f.png" }] }, VARIANTS, PRICES));
    expect(await printfulMockupRequest(deps, created)).toEqual({ productId: 12, variantIds: [474], files: [{ placement: "front", technique: "dtg", url: "https://a/f.png" }] });
    const bare = store();
    const blank = await applyPrintfulProduct(bare, planPrintfulProduct(SPEC, VARIANTS, PRICES));
    await expect(printfulMockupRequest(bare, blank.created)).rejects.toThrow(/no print file/);
    // The shape of a real task Printful finished on 2026-11-20.
    const images = printfulMockupImages([{ catalog_variant_mockups: [{ catalog_variant_id: 4025, mockups: [{ placement: "front", mockup_url: "https://printful-upload.s3-accelerate.amazonaws.com/tmp/f787/unisex-staple-t-shirt-aqua-front.jpg", style_id: 1120, view: "Front" }] }] }]);
    expect(images).toEqual([{ catalogVariantId: 4025, placement: "front", styleId: 1120, view: "Front", url: expect.stringContaining("/tmp/") }]);
  });
});

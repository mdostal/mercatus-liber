/**
 * The Printful admin actions against the storefront's real in-memory
 * services: bring a product over, see it in the demo's catalog with draft
 * SKUs, add art, and publish once ready. Printful itself is a stand-in
 * answering with prices read live for product 12 on 2026-11-06.
 */
import type { PrintfulCatalogClient, PrintfulPrices } from "@mercatus-liber/adapter-printful";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const PRICES: PrintfulPrices = {
  currency: "USD",
  product: { id: 12, placements: [{ id: "front", title: "Front print", technique_key: "dtg", price: "5.95", discounted_price: "5.95" }] },
  variants: [
    { id: 474, techniques: [{ technique_key: "dtg", price: "9.63", discounted_price: "9.63" }] },
    { id: 598, techniques: [{ technique_key: "dtg", price: "11.63", discounted_price: "11.63" }] },
  ],
};
const fakePrintful = {
  listVariants: async () => [
    { id: 474, catalog_product_id: 12, name: "Black / S", size: "S", color: "Black", color_code: "#0e0e0e", image: "" },
    { id: 598, catalog_product_id: 12, name: "Black / 2XL", size: "2XL", color: "Black", color_code: "#0e0e0e", image: "" },
  ],
  getPrices: async () => PRICES,
  getVariant: async () => null,
  createMockupTasks: vi.fn(async () => [{ id: 1010402307, status: "pending" }]),
  getMockupTasks: async () => [
    { id: 1010402307, status: "completed", catalog_variant_mockups: [{ catalog_variant_id: 474, mockups: [{ placement: "front", style_id: 1120, view: "Front", mockup_url: "https://printful-upload.s3-accelerate.amazonaws.com/tmp/f787/tee-black-front.jpg" }] }] },
  ],
} as unknown as PrintfulCatalogClient & { createMockupTasks: ReturnType<typeof vi.fn> };

async function setup(slug: "print-shop" | "northline") {
  for (const key of ["DATABASE_URL", "MONGODB_URL", "MONGODB_URI", "CONVEX_URL", "SQLITE_FILE_PATH", "SANITY_PROJECT_ID", "PRINTFUL_API_TOKEN", "CLERK_SECRET_KEY"]) vi.stubEnv(key, "");
  vi.resetModules();
  const servicesModule = await import("../lib/services");
  servicesModule.__resetServicesCacheForTests();
  const services = await servicesModule.getServicesForDemo(slug);
  Object.assign(services, { printfulCatalog: fakePrintful });
  services.adminAuth.getCurrentSession = async () => ({ userId: "u", email: "owner@example.com", role: "owner" });
  const actions = await import("../lib/printful-actions");
  const admin = await import("../lib/printful-admin");
  return { services, actions, admin };
}

const SELECTION = { title: "DT Tee", slug: "dt-tee-test", description: "", technique: "dtg", colors: ["Black"], sizes: ["S", "2XL"], retailCents: 2400, sizeUpchargeCents: { "2XL": 300 }, files: [] };

describe("Printful bring-over in the demo admin", { timeout: 60_000 }, () => {
  afterEach(() => vi.unstubAllEnvs());

  it("works out costs, brings a product into this demo as drafts, and publishes once it has art and an image", async () => {
    const { services, actions, admin } = await setup("print-shop");
    const plan = await actions.planPrintfulBringOverAction("print-shop", 12, SELECTION);
    expect(plan).toEqual({ ok: true, rows: [expect.objectContaining({ size: "S", priceCents: 2400, costCents: 963, marginCents: 1437 }), expect.objectContaining({ size: "2XL", priceCents: 2700, costCents: 1163 })], unavailable: [] });

    const result = await actions.bringOverPrintfulAction("print-shop", 12, SELECTION);
    expect(result).toMatchObject({ ok: true, message: expect.stringContaining("as drafts") });
    const product = (await services.catalog.getProductBySlug("dt-tee-test"))!;
    const skus = await services.catalog.listSkusByProduct(product.id);
    expect(skus.map((s) => s.status)).toEqual(["draft", "draft"]);
    // In this demo's catalog, marked as in the store, and nowhere else.
    expect((await admin.printfulInStore(services, "print-shop")).get(12)?.map((p) => p.id)).toEqual([product.id]);
    // A draft SKU can't go in a cart.
    const cart = await services.cart.createCart();
    await expect(services.cart.addItem(cart.id, skus[0]!.id, 1)).rejects.toThrow();

    const form = new FormData();
    form.set("demoSlug", "print-shop");
    form.set("productId", product.id);
    form.set("printfulProductId", "12");
    await expect(actions.publishPrintfulProductAction(form)).rejects.toThrow(/no print file.*no image/);

    expect(await actions.setPrintfulArtAction("print-shop", product.id, { placement: "front", technique: "dtg", url: "http://not-https.example/a.png" })).toMatchObject({ ok: false });
    expect(await actions.setPrintfulArtAction("print-shop", product.id, { placement: "front", technique: "dtg", url: "https://art.example/front.png" })).toEqual({ ok: true });
    await services.catalog.updateProduct(product.id, { images: [{ url: "https://art.example/mockup.jpg", alt: "DT Tee" }] });
    await actions.publishPrintfulProductAction(form);
    expect((await services.catalog.getProduct(product.id))!.status).toBe("active");
    expect((await services.catalog.listSkusByProduct(product.id)).map((s) => s.status)).toEqual(["active", "active"]);
    await services.cart.addItem(cart.id, skus[0]!.id, 1);
  });

  it("makes mockups with the product's art, and keeps chosen ones as copies in the store", async () => {
    const { services, actions } = await setup("print-shop");
    await actions.bringOverPrintfulAction("print-shop", 12, { ...SELECTION, slug: "dt-tee-mockups", files: [{ placement: "front", url: "https://art.example/front.png" }] });
    const product = (await services.catalog.getProductBySlug("dt-tee-mockups"))!;
    const request = await actions.requestPrintfulMockupsAction("print-shop", product.id, ["474"]);
    expect(request).toEqual({ ok: true, taskId: "1010402307" });
    expect(fakePrintful.createMockupTasks).toHaveBeenLastCalledWith({ productId: 12, variantIds: [474], files: [{ placement: "front", technique: "dtg", url: "https://art.example/front.png" }] });
    const poll = await actions.printfulMockupStatusAction("print-shop", product.id, "1010402307");
    expect(poll).toEqual({ status: "completed", images: [{ key: "474-front-1120", url: expect.stringContaining("/tmp/"), label: "Black / S, Front" }] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([255, 216, 255]), { headers: { "content-type": "image/jpeg" } })));
    try {
      const images = poll.status === "completed" ? poll.images : [];
      expect(await actions.savePrintfulMockupsAction("print-shop", product.id, images)).toEqual({ ok: true, message: "Saved 1 image to the product." });
      expect(await actions.savePrintfulMockupsAction("print-shop", product.id, [{ key: "x", url: "https://evil.example/a.jpg", label: "x" }])).toMatchObject({ ok: false, error: expect.stringContaining("Not a Printful mockup") });
    } finally {
      vi.unstubAllGlobals();
    }
    const saved = (await services.catalog.getProduct(product.id))!.images![0]!;
    expect(saved).toMatchObject({ url: expect.stringMatching(/^\/media\/[0-9a-f-]{36}$/), alt: "DT Tee, Black / S, Front" });
    const file = await services.mediaStore.get(saved.url.split("/").pop()!);
    expect([...file!.bytes]).toEqual([255, 216, 255]);
  });

  it("uploads art into the store's media and sets it on every SKU, refusing anything but PNG or JPEG", async () => {
    const { services, actions } = await setup("print-shop");
    vi.stubEnv("APP_ORIGIN", "https://commerce.example");
    await actions.bringOverPrintfulAction("print-shop", 12, { ...SELECTION, slug: "dt-tee-upload" });
    const product = (await services.catalog.getProductBySlug("dt-tee-upload"))!;
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
    const form = new FormData();
    form.set("file", new Blob([png], { type: "image/png" }), "art.png");
    const result = await actions.uploadPrintfulArtAction("print-shop", product.id, "front", "dtg", form);
    expect(result).toMatchObject({ ok: true, url: expect.stringMatching(/^https:\/\/commerce\.example\/media\/[0-9a-f-]{36}$/) });
    const sku = (await services.catalog.listSkusByProduct(product.id))[0]!;
    const target = (await services.providerCatalogMappings.get(sku.id, "printful"))!.target as { placements: { layers: { url: string }[] }[] };
    expect(target.placements[0]!.layers[0]!.url).toBe(result.ok ? result.url : "");
    const stored = await services.mediaStore.get(result.ok ? result.url.split("/").pop()! : "");
    expect(stored).toMatchObject({ contentType: "image/png", name: "dt-tee-upload-front.png" });
    const html = new FormData();
    html.set("file", new Blob(["<svg onload=alert(1)>"], { type: "image/png" }), "x.png");
    expect(await actions.uploadPrintfulArtAction("print-shop", product.id, "front", "dtg", html)).toEqual({ ok: false, error: "Upload a PNG or JPEG." });
  });

  it("gives agents search, lookup and draft-only bring-over", async () => {
    const { services, admin } = await setup("print-shop");
    const ops = admin.printfulProviderCatalogOps(services, "print-shop");
    const found = (await ops.search({ text: "bella canvas 3001", limit: 5 })) as { productId: string; inStore: unknown[] }[];
    expect(found.some((p) => p.productId === "71")).toBe(true);
    const created = (await ops.bringOver({ productId: "12", title: "Agent Tee", slug: "agent-tee-test", technique: "dtg", colors: ["Black"], sizes: ["S"], retailCents: 2400 })) as { productId: string; published: boolean; drafts: boolean };
    expect(created).toMatchObject({ skuCount: 1, drafts: true, published: false });
    expect((await services.catalog.getProduct(created.productId))!.status).toBe("draft");
  });

  it("refuses a slug another demo's product already uses, and refuses without an admin session", async () => {
    const { services, actions } = await setup("print-shop");
    const someone = (await services.catalog.listProducts())[0]!;
    const northlineCatalog = await services.catalog.createCatalog({ slug: `other-${Date.now()}`, name: "Other", description: "" });
    await services.catalog.unassignProductFromCatalog(someone.id, (await services.catalog.listCatalogIdsForProduct(someone.id))[0]!);
    await services.catalog.assignProductToCatalog(someone.id, northlineCatalog.id);
    expect(await actions.bringOverPrintfulAction("print-shop", 12, { ...SELECTION, slug: someone.slug })).toMatchObject({ ok: false, error: expect.stringContaining("already used by another store") });
    services.adminAuth.getCurrentSession = async () => null;
    expect(await actions.planPrintfulBringOverAction("print-shop", 12, SELECTION)).toMatchObject({ ok: false, error: expect.stringContaining("Not authorized") });
  });
});

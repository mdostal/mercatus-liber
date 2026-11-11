import { createInMemoryProviderCatalogMappingRepository } from "@mercatus-liber/fulfillment";
import { describe, expect, it } from "vitest";
import {
  applyDapiProduct,
  createDapiCatalogClient,
  createDapiHttpClient,
  DAPI_PROVIDER,
  DapiApiError,
  DapiQuoteNotReadyError,
  dapiQuoteUnitCostCents,
  DapiUploadError,
  planDapiProduct,
  type DapiCatalogWriter,
  type DapiProductSpec,
} from "../src/index.js";
import { apiError, fakeFetch, json, list, MAT_BLACK, MAT_WHITE, order, quote, QUOTE_A, QUOTE_B } from "./helpers.js";

describe("createDapiHttpClient", () => {
  it("sends the API key, and an Idempotency-Key on every POST but no GET", async () => {
    const { fetchImpl, calls } = fakeFetch(() => json(200, order()));
    const client = createDapiHttpClient({ apiKey: "key-1", fetchImpl, baseUrl: "https://example.test/" });
    await client.getOrder("ord_1");
    await client.cancelOrder("ord_1", "cancel-1");
    await client.cancelOrder("ord_1");

    expect(calls[0]!.url.href).toBe("https://example.test/v2/integrator/orders/ord_1");
    expect(calls[0]!.headers).toEqual({ Accept: "application/json", "x-api-key": "key-1" });
    expect(calls[1]!.url.pathname).toBe("/v2/integrator/orders/ord_1/cancel");
    expect(calls[1]!.headers["Idempotency-Key"]).toBe("cancel-1");
    expect(calls[2]!.headers["Idempotency-Key"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("maps 3DAPI's error body to DapiApiError with status, code, message and details", async () => {
    const details = { expected_slots: [1, 2] };
    const { fetchImpl } = fakeFetch(() => json(422, apiError(422, "material_slots_mismatch", "The slots sent are not the slots the file uses.", details)));
    const error = await createDapiHttpClient({ apiKey: "k", fetchImpl })
      .createOrder({ mode: "wallet", items: [], shipping_address: { line1: "x", city: "y", country_code: "GB" }, customer: { name: "n", email: "e@example.com" } }, "key")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DapiApiError);
    expect(error).toMatchObject({ method: "POST", path: "/v2/integrator/orders", status: 422, code: "material_slots_mismatch", apiMessage: "The slots sent are not the slots the file uses.", details });
    expect((error as Error).message).toContain("material_slots_mismatch");
  });

  it("reports a response that is not 3DAPI's error body under the code unknown", async () => {
    const { fetchImpl } = fakeFetch(() => new Response("<html>Bad gateway</html>", { status: 502 }));
    const client = createDapiHttpClient({ apiKey: "k", fetchImpl });
    await expect(client.request("GET", "/v2/wallet")).rejects.toMatchObject({ status: 502, code: "unknown", apiMessage: "<html>Bad gateway</html>" });
  });

  it("getOrder returns null on 404 and throws on other errors", async () => {
    const missing = fakeFetch(() => json(404, apiError(404, "order_not_found", "You have no order with this id.")));
    expect(await createDapiHttpClient({ apiKey: "k", fetchImpl: missing.fetchImpl }).getOrder("ord_x")).toBeNull();
    const refused = fakeFetch(() => json(403, apiError(403, "actor_not_allowed", "This endpoint is for integrators.")));
    await expect(createDapiHttpClient({ apiKey: "k", fetchImpl: refused.fetchImpl }).getOrder("ord_x")).rejects.toMatchObject({ code: "actor_not_allowed" });
  });

  it("listOrdersByReference follows next_cursor", async () => {
    const { fetchImpl, calls } = fakeFetch((call) => (call.url.searchParams.get("cursor") === "c2" ? json(200, list([order({ id: "ord_2" })])) : json(200, list([order({ id: "ord_1" })], "c2"))));
    const orders = await createDapiHttpClient({ apiKey: "k", fetchImpl }).listOrdersByReference("order-1");
    expect(orders.map((o) => o.id)).toEqual(["ord_1", "ord_2"]);
    expect(calls).toHaveLength(2);
  });
});

describe("createDapiCatalogClient", () => {
  it("lists every page of materials without sending the API key", async () => {
    const black = { id: MAT_BLACK, object: "material", name: "PLA Black", custom: false, technology: "fdm", color: "Black", color_hex: "#000000", filament_type: "pla" };
    const white = { ...black, id: MAT_WHITE, name: "PLA White", color: "White", color_hex: "#FFFFFF" };
    const { fetchImpl, calls } = fakeFetch((call) => (call.url.searchParams.get("cursor") ? json(200, list([white])) : json(200, list([black], "next"))));
    const materials = await createDapiCatalogClient({ apiKey: "key-1", fetchImpl }).listMaterials();
    expect(materials.map((m) => m.name)).toEqual(["PLA Black", "PLA White"]);
    expect(calls[0]!.url.pathname).toBe("/v2/materials");
    expect(calls.every((c) => !("x-api-key" in c.headers))).toBe(true);
    expect(calls[1]!.url.searchParams.get("cursor")).toBe("next");
  });

  it("uploads a file, quotes it and returns the unit price in cents", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    let reads = 0;
    const { fetchImpl, calls } = fakeFetch((call) => {
      if (call.url.pathname === "/v2/uploads") return json(201, { id: "upl_1", object: "upload", purpose: "quote_file", upload_url: "https://storage.example/put/abc", method: "PUT", headers: { "Content-Type": "model/stl", "x-signed": "yes" }, expires_at: "2026-11-11T10:00:00Z" });
      if (call.url.host === "storage.example") return new Response(null, { status: 200 });
      if (call.method === "POST" && call.url.pathname === "/v2/quotes") return json(201, quote({ status: "processing", price: null, suggested_materials: null, finished_at: null }));
      if (call.url.pathname === `/v2/quotes/${QUOTE_A}`) return json(200, ++reads < 3 ? quote({ status: "processing", price: null }) : quote());
      return undefined;
    });
    const sleeps: number[] = [];
    const result = await createDapiCatalogClient({ apiKey: "key-1", fetchImpl }).quoteFile({ fileName: "bracket.stl", contentType: "model/stl", bytes, name: "Bracket" }, { intervalMs: 5, sleep: async (ms) => void sleeps.push(ms) });

    expect(result.unitCostCents).toBe(912);
    expect(result.currency).toBe("usd");
    expect(result.quote.suggested_materials?.[0]?.match).toBe("approximate");
    expect(sleeps).toEqual([5, 5]);

    expect(calls[0]!.body).toEqual({ purpose: "quote_file", file_name: "bracket.stl", content_type: "model/stl", size_bytes: 3 });
    expect(calls[1]!.method).toBe("PUT");
    expect(calls[1]!.headers).toEqual({ "Content-Type": "model/stl", "x-signed": "yes" }); // exactly the headers 3DAPI gave: no API key
    expect(calls[1]!.rawBody).toBe(bytes);
    expect(calls[2]!.body).toEqual({ file: { upload: "upl_1" }, name: "Bracket" });
    expect(calls[2]!.headers["Idempotency-Key"]).toBeTruthy();
  });

  it("stops when the storage PUT is refused, the quote fails, or it never finishes", async () => {
    const upload = { id: "upl_1", object: "upload", purpose: "quote_file", upload_url: "https://storage.example/put", method: "PUT", headers: {}, expires_at: "" };
    const refused = fakeFetch((call) => (call.url.host === "storage.example" ? new Response("expired", { status: 403 }) : json(201, upload)));
    await expect(createDapiCatalogClient({ apiKey: "k", fetchImpl: refused.fetchImpl }).uploadFile({ fileName: "a.stl", contentType: "model/stl", bytes: new Uint8Array(1) })).rejects.toThrow(DapiUploadError);

    const failed = fakeFetch(() => json(200, quote({ status: "failed", price: null, failure_reason: "The model is empty." })));
    await expect(createDapiCatalogClient({ apiKey: "k", fetchImpl: failed.fetchImpl }).waitForQuote(QUOTE_A)).rejects.toThrow("The model is empty.");

    const stuck = fakeFetch(() => json(200, quote({ status: "processing", price: null })));
    await expect(createDapiCatalogClient({ apiKey: "k", fetchImpl: stuck.fetchImpl }).waitForQuote(QUOTE_A, { intervalMs: 10, timeoutMs: 20, sleep: async () => {} })).rejects.toThrow(DapiQuoteNotReadyError);
    expect(stuck.calls).toHaveLength(3);
    expect(() => dapiQuoteUnitCostCents(quote({ status: "processing", price: null }))).toThrow(DapiQuoteNotReadyError);
    expect(dapiQuoteUnitCostCents(quote())).toBe(912);
  });

  it("getQuote returns null on 404, and a pre-approval quota refusal keeps its code", async () => {
    const missing = fakeFetch(() => json(404, apiError(404, "quote_not_found", "You have no quote with this id.")));
    expect(await createDapiCatalogClient({ apiKey: "k", fetchImpl: missing.fetchImpl }).getQuote("qte_x")).toBeNull();
    const limited = fakeFetch(() => json(409, apiError(409, "upload_limit_reached", "You used the 25 uploads of this round.")));
    await expect(createDapiCatalogClient({ apiKey: "k", fetchImpl: limited.fetchImpl }).createQuote({ uploadId: "upl_1" })).rejects.toMatchObject({ status: 409, code: "upload_limit_reached" });
  });

  it("estimates shipping in cents and reads the wallet and the key's account", async () => {
    const { fetchImpl, calls } = fakeFetch((call) => {
      if (call.url.pathname === "/v2/integrator/orders/shipping-estimate") return json(200, { object: "shipping_estimate", country_code: "DE", zone: { code: "eu-core", name: "EU Core" }, tier: "medium", additional_items: 2, total: { amount: 1150, currency: "usd" } });
      if (call.url.pathname === "/v2/wallet") return json(200, { object: "wallet", balance: { amount: 5000, currency: "usd" }, sample_credit: { amount: 1500, currency: "usd" }, sample_credit_expires_at: "2026-12-10T00:00:00Z", pending_withdrawals: { amount: 0, currency: "usd" }, updated_at: "2026-11-10T10:00:00Z" });
      if (call.url.pathname === "/v2/me") return json(200, { object: "actor", user_id: "u", kind: "integrator", authenticated_with: "api_key", scopes: ["orders:write"], effective_scopes: ["orders:write"], approval: "approved" });
      return undefined;
    });
    const client = createDapiCatalogClient({ apiKey: "key-1", fetchImpl });

    const estimate = await client.estimateShipping({ country: "de", items: [{ quoteId: QUOTE_A, quantity: 3, extras: [{ extra: "xtr_Magnet", quantityPerUnit: 2 }] }, { quoteId: QUOTE_B, quantity: 1 }] });
    expect(estimate).toMatchObject({ totalCents: 1150, currency: "usd", estimate: { zone: { code: "eu-core" }, tier: "medium", additional_items: 2 } });
    expect(calls[0]!.body).toEqual({ country: "DE", items: [{ quote: QUOTE_A, quantity: 3, extras: [{ extra: "xtr_Magnet", quantity_per_unit: 2 }] }, { quote: QUOTE_B, quantity: 1 }] });

    const wallet = await client.getWallet();
    expect([wallet.balance.amount, wallet.sample_credit.amount]).toEqual([5000, 1500]);
    expect((await client.whoAmI()).approval).toBe("approved");
    expect(calls[1]!.headers["x-api-key"]).toBe("key-1");
  });
});

describe("planDapiProduct and applyDapiProduct", () => {
  const spec: DapiProductSpec = {
    slug: "desk-bracket",
    title: "Desk bracket",
    description: "A printed bracket.",
    variants: [
      { attributes: { color: "Black" }, quoteId: QUOTE_A, materials: [MAT_BLACK], retailCents: 2400 },
      { attributes: { color: "White" }, quoteId: QUOTE_A, materials: [MAT_WHITE], retailCents: 800 },
      { attributes: { color: "As designed" }, quoteId: QUOTE_B, useSuggestedMaterials: true, retailCents: 3000 },
      { attributes: { color: "Pending" }, quoteId: "qte_Pending", useSuggestedMaterials: true, retailCents: 3000 },
      { attributes: { color: "Unset" }, quoteId: QUOTE_A, retailCents: 3000 },
      { attributes: { color: "Ghost" }, quoteId: "qte_Missing", useSuggestedMaterials: true, retailCents: 3000 },
    ],
  };
  const quotes = [quote(), quote({ id: QUOTE_B, price: { amount: 1500, currency: "usd" }, suggested_materials: null }), quote({ id: "qte_Pending", status: "processing", price: null })];

  it("gives each variant its quote's cost and the margin, and says why others were skipped", () => {
    const plan = planDapiProduct(spec, quotes);
    expect(plan.skus).toEqual([
      { attributes: { color: "Black" }, target: { quoteId: QUOTE_A, materials: [MAT_BLACK] }, price: { amount: 2400, currency: "USD" }, costCents: 912, marginCents: 1488 },
      { attributes: { color: "White" }, target: { quoteId: QUOTE_A, materials: [MAT_WHITE] }, price: { amount: 800, currency: "USD" }, costCents: 912, marginCents: -112 },
    ]);
    expect(plan.skipped.map((s) => [s.attributes.color, s.reason])).toEqual([
      ["As designed", "the quote has no suggested materials, so list materials instead"],
      ["Pending", "the quote is processing"],
      ["Unset", "set materials or useSuggestedMaterials"],
      ["Ghost", "no such quote was passed in"],
    ]);
    expect(planDapiProduct(spec, quotes, { [QUOTE_A]: 700 }).skus[0]).toMatchObject({ costCents: 700, marginCents: 1700 });
  });

  it("creates the product, SKUs, mappings and routing once, and keeps prices on a second run", async () => {
    const skus: { id: string; productId: string; identifyingAttributes: { key: string; value: unknown }[]; price: { amount: number; currency: string } }[] = [];
    let product: { id: string; keys: string[] } | null = null;
    const catalog: DapiCatalogWriter = {
      getProductBySlug: async () => product,
      createProduct: async (input) => (product = { id: "prod-1", keys: input.identifyingAttributeKeys }),
      listSkusByProduct: async (productId) => skus.filter((s) => s.productId === productId),
      createSku: async (input) => {
        const sku = { id: `sku-${skus.length + 1}`, ...input };
        skus.push(sku);
        return sku;
      },
      updateSku: async (id, patch) => {
        const sku = skus.find((s) => s.id === id)!;
        if (patch.price) sku.price = patch.price;
        return sku;
      },
    };
    const mappings = createInMemoryProviderCatalogMappingRepository();
    const routed: [string, string][] = [];
    const deps = { catalog, mappings, routing: { setProviderForSku: async (skuId: string, provider: string) => void routed.push([skuId, provider]) } };
    const plan = planDapiProduct(spec, quotes);

    const first = await applyDapiProduct(deps, plan);
    expect(first).toEqual({ productId: "prod-1", created: ["sku-1", "sku-2"], updated: [] });
    expect(product!.keys).toEqual(["color"]);
    expect(await mappings.list(DAPI_PROVIDER)).toEqual([
      { skuId: "sku-1", provider: "3dapi", target: { quoteId: QUOTE_A, materials: [MAT_BLACK] } },
      { skuId: "sku-2", provider: "3dapi", target: { quoteId: QUOTE_A, materials: [MAT_WHITE] } },
    ]);
    expect(routed).toEqual([["sku-1", "3dapi"], ["sku-2", "3dapi"]]);

    skus[0]!.price = { amount: 2600, currency: "USD" }; // changed in the admin
    expect(await applyDapiProduct(deps, plan)).toEqual({ productId: "prod-1", created: [], updated: [] });
    expect(skus[0]!.price.amount).toBe(2600);
    expect(await applyDapiProduct(deps, plan, { updatePrices: true })).toEqual({ productId: "prod-1", created: [], updated: ["sku-1"] });
    expect(skus[0]!.price.amount).toBe(2400);
  });
});

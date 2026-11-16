/**
 * The order admin's label flow, through the storefront's real service graph:
 * quote, buy, void. Shippo is a stand-in answering with the shapes its real
 * API returned in a test-mode run on 2026-11-16 (a bought label's `rate` is
 * the rate id as a string, not an object).
 */
import { FULFILLMENT_ORDER_STATUS_CHANGED, type FulfillmentOrderStatusChanged } from "@mercatus-liber/fulfillment";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SHIP_FROM = { SHIP_FROM_NAME: "Demo Store", SHIP_FROM_STREET1: "215 Clayton St.", SHIP_FROM_CITY: "San Francisco", SHIP_FROM_STATE: "CA", SHIP_FROM_POSTAL_CODE: "94117", SHIP_FROM_EMAIL: "ship@store.example" };

function fakeShippo() {
  const requests: { method: string; path: string; body: unknown }[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname !== "api.goshippo.com") throw new Error(`unexpected request to ${url.hostname}`);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    requests.push({ method: init?.method ?? "GET", path: url.pathname, body });
    const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
    if (url.pathname === "/shipments/") {
      return json({ object_id: "shp_1", status: "SUCCESS", rates: [{ object_id: "rate_usps", amount: "6.45", currency: "USD", provider: "USPS", servicelevel: { name: "Ground Advantage", token: "usps_ground_advantage" }, estimated_days: 2 }] });
    }
    if (url.pathname === "/transactions/") {
      return json({ object_id: "label_1", status: "SUCCESS", tracking_number: "9300120845500000788026", tracking_url_provider: "https://tools.usps.com/go/TrackConfirmAction?tLabels=9300120845500000788026", label_url: "https://deliver.goshippo.com/label_1.pdf", rate: "rate_usps" });
    }
    if (url.pathname === "/refunds/") return json({ object_id: "rf_1", status: "SUCCESS", transaction: body.transaction });
    throw new Error(`fakeShippo: no route for ${url.pathname}`);
  });
  return { fetchImpl, requests };
}

async function freshServices(env: Record<string, string>) {
  for (const key of ["DATABASE_URL", "MONGODB_URL", "CONVEX_URL", "SQLITE_FILE_PATH", "SHIPPO_API_TOKEN", "SHIPSTATION_API_KEY", ...Object.keys(SHIP_FROM)]) vi.stubEnv(key, "");
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  vi.resetModules();
  const { getServicesForDemo, __resetServicesCacheForTests } = await import("../lib/services");
  // The cache lives on globalThis, so a module reset alone would hand back the last test's services.
  __resetServicesCacheForTests();
  return getServicesForDemo("print-shop");
}

describe("order labels in the storefront's services", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    (await import("../lib/services")).__resetServicesCacheForTests();
  });

  it("is off, and says why, without a label provider or a ship-from address", async () => {
    const none = await freshServices({});
    expect(none.orderLabels).toMatchObject({ available: false, reason: expect.stringContaining("SHIPPO_API_TOKEN") });
    const noAddress = await freshServices({ SHIPPO_API_TOKEN: "made-up-for-wiring" });
    expect(noAddress.orderLabels).toMatchObject({ available: false, reason: expect.stringContaining("SHIP_FROM_EMAIL") });
  });

  it("quotes, buys and voids a label for a self-shipped order", async () => {
    const shippo = fakeShippo();
    vi.stubGlobal("fetch", shippo.fetchImpl);
    const services = await freshServices({ SHIPPO_API_TOKEN: "made-up-for-wiring", ...SHIP_FROM });
    const { orderLabels, catalog, cart, checkout, fulfillment, events } = services;
    if (!orderLabels.available) throw new Error(`labels should be on: ${orderLabels.reason}`);
    const published: FulfillmentOrderStatusChanged[] = [];
    events.subscribe<FulfillmentOrderStatusChanged>(FULFILLMENT_ORDER_STATUS_CHANGED, async (payload) => {
      published.push(payload);
    });

    // A real order in the demo store, routed to the store itself (the default).
    const product = (await catalog.listProducts({ status: "active" }))[0]!;
    const sku = (await catalog.listSkusByProduct(product.id))[0]!;
    const shopperCart = await cart.createCart();
    await cart.addItem(shopperCart.id, sku.id, 1);
    const { order } = await checkout.startCheckout({
      cartId: shopperCart.id,
      idempotencyKey: shopperCart.id,
      shippingInfo: { name: "Ada Example", email: "ada@example.com", address: "1 Main St, Springfield IL", street1: "1 Main St", city: "Springfield", stateCode: "IL", postalCode: "62704", countryCode: "US" },
      successUrl: "https://shop.example/success",
      cancelUrl: "https://shop.example/cancel",
    });
    await fulfillment.submitOrder(order.id);

    const quote = await orderLabels.service.quote(order.id, { weightOz: 12, lengthIn: 8, widthIn: 6, heightIn: 4 });
    expect(quote).toMatchObject({ available: true, rates: [{ rateId: "rate_usps", carrier: "USPS", amount: { amount: 645, currency: "USD" } }] });
    // The sender's email reaches Shippo; USPS will not sell a label without it.
    expect(shippo.requests[0]!.body).toMatchObject({ address_from: { email: "ship@store.example", zip: "94117" }, address_to: { zip: "62704", city: "Springfield" } });

    const bought = await orderLabels.service.buy(order.id, [sku.id], "rate_usps");
    expect(bought).toMatchObject({ purchased: true, label: { carrier: "USPS", trackingNumber: "9300120845500000788026", labelId: "label_1" } });
    expect((await fulfillment.listForOrder(order.id))[0]).toMatchObject({ status: "shipped", trackingNumber: "9300120845500000788026" });
    expect(published.at(-1)).toMatchObject({ orderId: order.id, skuIds: [sku.id], provider: "manual", status: "shipped", carrier: "USPS", trackingUrl: expect.stringContaining("usps.com") });
    expect(await orderLabels.labelsForOrder(order.id)).toEqual(["label_1"]);

    expect(await orderLabels.service.void("label_1")).toEqual({ voided: true, pending: false });
    // The parcel never left: the line waits for a label again and the void was announced.
    expect((await fulfillment.listForOrder(order.id))[0]).toMatchObject({ status: "submitted", trackingNumber: null });
    expect(published.at(-1)).toMatchObject({ orderId: order.id, status: "submitted", previousStatus: "shipped" });
    expect(await orderLabels.labelsForOrder(order.id)).toEqual([]);
  });
});

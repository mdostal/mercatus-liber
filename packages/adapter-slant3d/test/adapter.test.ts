import { createHmac } from "node:crypto";
import { createInMemoryProviderCatalogMappingRepository, InvalidCatalogMappingError, MissingCatalogMappingError, type FulfillmentRecipient } from "@mercatus-liber/fulfillment";
import { describe, expect, it } from "vitest";
import {
  createSlant3dFulfillmentAdapter,
  IncompleteRecipientError,
  mapSlant3dOrderStatus,
  parseSlant3dWebhookPayload,
  SLANT3D_ORDER_STATUSES,
  SLANT3D_PROVIDER,
  Slant3dApiError,
  slant3dCatalogTargetsFrom,
  Slant3dOrderProcessError,
  slant3dWebhookSignatureFrom,
  Slant3dWebhookPayloadParseError,
  Slant3dWebhookSignatureInvalidError,
  Slant3dWebhookSignatureNotConfiguredError,
  verifySlant3dSignature,
  type Slant3dFulfillmentAdapterConfig,
  type Slant3dWebhookEvent,
} from "../src/index.js";
import { fakeFetch, ok } from "./fake-fetch.js";

const PLATFORM = "11111111-1111-1111-1111-111111111111";
const RECIPIENT: FulfillmentRecipient = { name: "Ada Lovelace", email: "ada@example.com", address: "1 Main St, Chicago", street1: "1 Main St", street2: "Apt 2", city: "Chicago", stateCode: "IL", postalCode: "60601", countryCode: "US" };
const TARGETS: Record<string, { fileId: string; filamentId: string }> = { "sku-black": { fileId: "file-1", filamentId: "fil-black" }, "sku-red": { fileId: "file-1", filamentId: "fil-red" } };

const item = (sku: string | null) => ({ type: "PRINT", status: "DRAFT", price: "6.36", currency: "USD", quantity: 1, SKU: sku });
const DRAFT = ok({ order: { publicId: "SLANT_100", status: "DRAFT", printingCost: "12.72", deliveryCost: "4.79" }, items: [item("sku-black"), item("sku-red")] }, 201);
const order = (status: string, extra: Record<string, unknown> = {}) => ({ publicId: "SLANT_100", status, items: [item("sku-black"), item("sku-red")], ...extra });

function adapter(fetchImpl: typeof fetch, overrides: Partial<Slant3dFulfillmentAdapterConfig> = {}) {
  return createSlant3dFulfillmentAdapter({ apiKey: "sl-test", platformId: PLATFORM, fetchImpl, resolveCatalogTarget: async (skuId) => TARGETS[skuId]!, ...overrides });
}

const INPUT = { orderId: "order-1", items: [{ skuId: "sku-black", quantity: 2 }, { skuId: "sku-red", quantity: 1 }], recipient: RECIPIENT };

describe("submitOrder", () => {
  it("drafts the order, then processes it", async () => {
    const { fetchImpl, calls } = fakeFetch({ "POST /orders": DRAFT, "POST /orders/SLANT_100": ok(order("SUBMITTED")) });
    const records = await adapter(fetchImpl).submitOrder(INPUT);

    expect(calls.map((c) => `${c.method} ${c.url.replace("https://slant3dapi.com/v2/api", "")}`)).toEqual(["POST /orders", "POST /orders/SLANT_100"]);
    expect(calls[0]?.body).toEqual({
      platformId: PLATFORM,
      customer: { platformId: PLATFORM, details: { email: "ada@example.com", address: { name: "Ada Lovelace", line1: "1 Main St", line2: "Apt 2", city: "Chicago", state: "IL", zip: "60601", country: "US" } } },
      items: [
        { type: "PRINT", publicFileServiceId: "file-1", filamentId: "fil-black", quantity: 2, SKU: "sku-black" },
        { type: "PRINT", publicFileServiceId: "file-1", filamentId: "fil-red", quantity: 1, SKU: "sku-red" },
      ],
      metadata: { storeOrderId: "order-1" },
    });
    expect(calls[1]?.body).toBeUndefined();
    expect(records).toEqual([
      { orderId: "order-1", skuId: "sku-black", provider: SLANT3D_PROVIDER, externalOrderId: "SLANT_100", status: "submitted", trackingNumber: null, trackingUrl: null },
      { orderId: "order-1", skuId: "sku-red", provider: SLANT3D_PROVIDER, externalOrderId: "SLANT_100", status: "submitted", trackingNumber: null, trackingUrl: null },
    ]);
  });

  it("with holdOrders, leaves the draft unprocessed and reports the lines as held", async () => {
    const { fetchImpl, calls } = fakeFetch({ "POST /orders": DRAFT });
    const records = await adapter(fetchImpl, { holdOrders: true }).submitOrder(INPUT);
    expect(calls).toHaveLength(1);
    expect(records.map((r) => r.status)).toEqual(["held", "held"]);
    expect(records.map((r) => r.externalOrderId)).toEqual(["SLANT_100", "SLANT_100"]);
  });

  it("keeps each line's SKU when Slant returns items without one", async () => {
    const { fetchImpl } = fakeFetch({ "POST /orders": ok({ order: { publicId: "SLANT_100", status: "DRAFT" }, items: [item(null), item(null)] }, 201) });
    const records = await adapter(fetchImpl, { holdOrders: true }).submitOrder(INPUT);
    expect(records.map((r) => r.skuId)).toEqual(["sku-black", "sku-red"]);
  });

  for (const [field, label] of [["street1", "line1"], ["city", "city"], ["stateCode", "state"], ["postalCode", "zip"], ["countryCode", "country"]] as const) {
    it(`refuses an address with no ${label} before calling Slant`, async () => {
      const { fetchImpl, calls } = fakeFetch({});
      const { [field]: _removed, ...recipient } = RECIPIENT;
      const error = await adapter(fetchImpl).submitOrder({ ...INPUT, recipient }).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(IncompleteRecipientError);
      expect((error as IncompleteRecipientError).missing).toEqual([label]);
      expect(calls).toEqual([]);
    });
  }

  it("refuses a blank field and an order with no recipient at all", async () => {
    const { fetchImpl, calls } = fakeFetch({});
    await expect(adapter(fetchImpl).submitOrder({ ...INPUT, recipient: { ...RECIPIENT, city: "  " } })).rejects.toThrow(IncompleteRecipientError);
    await expect(adapter(fetchImpl).submitOrder({ orderId: "order-1", items: INPUT.items })).rejects.toMatchObject({ missing: ["name", "line1", "city", "state", "zip", "country", "email"] });
    expect(calls).toEqual([]);
  });

  it("uses resolveRecipient when the order arrives without a recipient", async () => {
    const { fetchImpl, calls } = fakeFetch({ "POST /orders": DRAFT });
    const resolveRecipient = async () => ({ email: "b@example.com", address: { name: "B", line1: "2 Side St", city: "Austin", state: "TX", zip: "73301", country: "US" } });
    await adapter(fetchImpl, { holdOrders: true, resolveRecipient }).submitOrder({ orderId: "order-1", items: INPUT.items });
    expect((calls[0]?.body as { customer: { details: unknown } }).customer.details).toEqual({ email: "b@example.com", address: { name: "B", line1: "2 Side St", city: "Austin", state: "TX", zip: "73301", country: "US" } });
  });

  it("reports the draft's Slant id when processing fails", async () => {
    const { fetchImpl } = fakeFetch({ "POST /orders": DRAFT, "POST /orders/SLANT_100": { status: 402, json: { success: false, message: "Payment failed" } } });
    const error = await adapter(fetchImpl).submitOrder(INPUT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Slant3dOrderProcessError);
    expect(error).toMatchObject({ orderId: "order-1", publicOrderId: "SLANT_100" });
    expect((error as Slant3dOrderProcessError).cause).toBeInstanceOf(Slant3dApiError);
    expect((error as Slant3dOrderProcessError).cause).toMatchObject({ status: 402, slantMessage: "Payment failed" });
  });

  it("surfaces Slant's refusal of a draft", async () => {
    const { fetchImpl } = fakeFetch({ "POST /orders": { status: 400, json: { success: false, message: "Invalid filament" } } });
    await expect(adapter(fetchImpl).submitOrder(INPUT)).rejects.toMatchObject({ name: "Slant3dApiError", status: 400, slantMessage: "Invalid filament" });
  });
});

describe("slant3dCatalogTargetsFrom", () => {
  async function repo(target: Record<string, unknown>) {
    const mappings = createInMemoryProviderCatalogMappingRepository();
    await mappings.save({ skuId: "sku-black", provider: SLANT3D_PROVIDER, target });
    return mappings;
  }
  const one = { orderId: "order-1", items: [{ skuId: "sku-black", quantity: 1 }], recipient: RECIPIENT };

  it("sends the stored file and filament", async () => {
    const { fetchImpl, calls } = fakeFetch({ "POST /orders": DRAFT });
    await adapter(fetchImpl, { holdOrders: true, resolveCatalogTarget: slant3dCatalogTargetsFrom(await repo({ fileId: "file-9", filamentId: "fil-9" })) }).submitOrder(one);
    expect((calls[0]?.body as { items: unknown[] }).items[0]).toMatchObject({ publicFileServiceId: "file-9", filamentId: "fil-9" });
  });

  it("refuses an unmapped SKU before creating anything at Slant", async () => {
    const { fetchImpl, calls } = fakeFetch({});
    const resolveCatalogTarget = slant3dCatalogTargetsFrom(await repo({ fileId: "file-9", filamentId: "fil-9" }));
    await expect(adapter(fetchImpl, { resolveCatalogTarget }).submitOrder({ ...one, items: [{ skuId: "other", quantity: 1 }] })).rejects.toThrow(MissingCatalogMappingError);
    expect(calls).toEqual([]);
  });

  it("refuses a mapping without a file or filament id", async () => {
    await expect(slant3dCatalogTargetsFrom(await repo({ filamentId: "fil-9" }))("sku-black")).rejects.toThrow(InvalidCatalogMappingError);
    await expect(slant3dCatalogTargetsFrom(await repo({ fileId: "file-9", filamentId: 7 }))("sku-black")).rejects.toThrow(InvalidCatalogMappingError);
  });
});

describe("status mapping", () => {
  const expected = { DRAFT: "held", SUBMITTED: "submitted", PRINTING: "submitted", SHIPPED: "shipped", CANCELLED: "unfulfilled" } as const;

  it("covers every status Slant documents", () => {
    expect(Object.keys(expected).sort()).toEqual([...SLANT3D_ORDER_STATUSES].sort());
  });

  for (const status of SLANT3D_ORDER_STATUSES) {
    it(`reports ${status} as ${expected[status]}`, async () => {
      expect(mapSlant3dOrderStatus(status)).toBe(expected[status]);
      const { fetchImpl } = fakeFetch({ "GET /orders/SLANT_100": ok(order(status)) });
      const records = await adapter(fetchImpl, { resolveExternalOrderId: async () => "SLANT_100" }).getOrderStatus("order-1");
      expect(records.map((r) => r.status)).toEqual([expected[status], expected[status]]);
    });
  }

  it("reports a status it doesn't know as submitted", () => {
    expect(mapSlant3dOrderStatus("ON_HOLD")).toBe("submitted");
  });
});

describe("getOrderStatus", () => {
  it("reads tracking from the order's fulfillment", async () => {
    const { fetchImpl, calls } = fakeFetch({ "GET /orders/SLANT_100": ok(order("SHIPPED", { fulfillment: { status: "SHIPPED", provider: "USPS", trackingNumbers: ["9400150206217833467525", "second"] } })) });
    const records = await adapter(fetchImpl, { resolveExternalOrderId: async () => "SLANT_100" }).getOrderStatus("order-1");
    expect(calls).toHaveLength(1);
    expect(records).toEqual([
      { orderId: "order-1", skuId: "sku-black", provider: "slant3d", externalOrderId: "SLANT_100", status: "shipped", trackingNumber: "9400150206217833467525", trackingUrl: null },
      { orderId: "order-1", skuId: "sku-red", provider: "slant3d", externalOrderId: "SLANT_100", status: "shipped", trackingNumber: "9400150206217833467525", trackingUrl: null },
    ]);
  });

  it("returns nothing for an order that was never sent, without calling Slant", async () => {
    const { fetchImpl, calls } = fakeFetch({});
    expect(await adapter(fetchImpl, { resolveExternalOrderId: async () => null }).getOrderStatus("order-1")).toEqual([]);
    expect(await adapter(fetchImpl).getOrderStatus("order-1")).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("returns nothing when Slant no longer has the order", async () => {
    const { fetchImpl } = fakeFetch({ "GET /orders/SLANT_100": { status: 404, json: { success: false, message: "Order not found" } } });
    expect(await adapter(fetchImpl, { resolveExternalOrderId: async () => "SLANT_100" }).getOrderStatus("order-1")).toEqual([]);
  });

  it("remembers orders it submitted when no resolveExternalOrderId is given", async () => {
    const { fetchImpl } = fakeFetch({ "POST /orders": DRAFT, "GET /orders/SLANT_100": ok(order("DRAFT")) });
    const slant = adapter(fetchImpl, { holdOrders: true });
    await slant.submitOrder(INPUT);
    expect((await slant.getOrderStatus("order-1")).map((r) => [r.skuId, r.status])).toEqual([["sku-black", "held"], ["sku-red", "held"]]);
  });

  it("processes and cancels by Slant order id", async () => {
    const { fetchImpl, calls } = fakeFetch({ "POST /orders/SLANT_100": ok(order("SUBMITTED")), "DELETE /orders/SLANT_100": ok(undefined) });
    const slant = adapter(fetchImpl);
    await slant.processHeldOrder("SLANT_100");
    await slant.cancelOrder("SLANT_100");
    expect(calls.map((c) => c.method)).toEqual(["POST", "DELETE"]);
  });
});

describe("handleWebhookEvent", () => {
  // Made up for these tests and joined at runtime so secret scanners do not read it as a real signing secret.
  const SECRET = ["slant", "made-up-test-secret-0123456789abcdef"].join("-");
  const NOW = 1_761_933_600_000;
  const BODY = JSON.stringify({ event_type: "order.shipped", service: "order-service", platform_id: PLATFORM, timestamp: "1761933541285", data: { order: { public_id: "SLANT_100", status: "SHIPPED", tracking_number: "9000", shipment_status: "SHIPPED" } } });

  /** Signs the way Slant's docs do: hex HMAC-SHA256 of "<timestamp>.<body>" keyed with the secret. */
  const sign = (body: string, timestamp: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex")}`;
  const headers = (body: string, timestamp: number, secret = SECRET) => slant3dWebhookSignatureFrom({ "X-Webhook-Timestamp": String(timestamp), "X-Webhook-Signature-256": sign(body, String(timestamp), secret) });

  function listening(overrides: Partial<Slant3dFulfillmentAdapterConfig> = {}) {
    const events: Slant3dWebhookEvent[] = [];
    const slant = adapter(fakeFetch({}).fetchImpl, { webhookSecret: SECRET, now: () => NOW, onWebhookEvent: (event) => void events.push(event), ...overrides });
    return { slant, events };
  }

  it("accepts a correctly signed, recent webhook and passes on the parsed event", async () => {
    const { slant, events } = listening();
    await slant.handleWebhookEvent(BODY, headers(BODY, NOW - 1000));
    expect(events).toEqual([
      { type: "order.shipped", platformId: PLATFORM, timestamp: "1761933541285", dummy: false, order: { publicId: "SLANT_100", status: "SHIPPED", trackingNumber: "9000", shipmentStatus: "SHIPPED" }, data: { order: { public_id: "SLANT_100", status: "SHIPPED", tracking_number: "9000", shipment_status: "SHIPPED" } } },
    ]);
  });

  it("accepts the body as a Buffer and headers from a Headers object", async () => {
    const { slant, events } = listening();
    const timestamp = String(NOW - 5);
    await slant.handleWebhookEvent(Buffer.from(BODY, "utf-8"), slant3dWebhookSignatureFrom(new Headers({ "x-webhook-timestamp": timestamp, "x-webhook-signature-256": sign(BODY, timestamp) })));
    expect(events).toHaveLength(1);
  });

  it("rejects a signature made with another secret", async () => {
    const { slant, events } = listening();
    await expect(slant.handleWebhookEvent(BODY, headers(BODY, NOW - 1000, "another-secret-another-secret-12345"))).rejects.toThrow(Slant3dWebhookSignatureInvalidError);
    expect(events).toEqual([]);
  });

  it("rejects a body changed after signing", async () => {
    const { slant, events } = listening();
    await expect(slant.handleWebhookEvent(BODY.replace("9000", "9001"), headers(BODY, NOW - 1000))).rejects.toThrow(Slant3dWebhookSignatureInvalidError);
    expect(events).toEqual([]);
  });

  it("rejects a timestamp changed after signing", async () => {
    const { slant } = listening();
    const signature = sign(BODY, String(NOW - 10 * 60 * 1000));
    await expect(slant.handleWebhookEvent(BODY, `${NOW - 1000},${signature}`)).rejects.toThrow(Slant3dWebhookSignatureInvalidError);
  });

  it("rejects a correctly signed webhook that is 5 minutes old, and accepts one just under", async () => {
    const { slant, events } = listening();
    await expect(slant.handleWebhookEvent(BODY, headers(BODY, NOW - 5 * 60 * 1000))).rejects.toThrow(Slant3dWebhookSignatureInvalidError);
    expect(events).toEqual([]);
    await slant.handleWebhookEvent(BODY, headers(BODY, NOW - 5 * 60 * 1000 + 1));
    expect(events).toHaveLength(1);
  });

  it("honours a longer tolerance", async () => {
    const { slant, events } = listening({ webhookToleranceMs: 60 * 60 * 1000 });
    await slant.handleWebhookEvent(BODY, headers(BODY, NOW - 30 * 60 * 1000));
    expect(events).toHaveLength(1);
  });

  it("rejects malformed or missing signature parts", async () => {
    const { slant } = listening();
    for (const signature of ["", "sha256=", `${NOW},sha256=zz`, `${NOW},`, `,${sign(BODY, "")}`, `not-a-number,${sign(BODY, "not-a-number")}`, sign(BODY, String(NOW))]) {
      await expect(slant.handleWebhookEvent(BODY, signature)).rejects.toThrow(Slant3dWebhookSignatureInvalidError);
    }
  });

  it("refuses every webhook when no secret or verifier is configured", async () => {
    const slant = adapter(fakeFetch({}).fetchImpl);
    await expect(slant.handleWebhookEvent(BODY, headers(BODY, NOW))).rejects.toThrow(Slant3dWebhookSignatureNotConfiguredError);
  });

  it("uses a custom verifier in place of the secret", async () => {
    const { slant, events } = listening({ verifyWebhookSignature: (_body, signature) => signature === "trusted" });
    await slant.handleWebhookEvent(BODY, "trusted");
    await expect(slant.handleWebhookEvent(BODY, headers(BODY, NOW))).rejects.toThrow(Slant3dWebhookSignatureInvalidError);
    expect(events).toHaveLength(1);
  });

  it("verifySlant3dSignature checks against the current time by default", () => {
    const fresh = String(Date.now());
    expect(verifySlant3dSignature(SECRET, BODY, fresh, sign(BODY, fresh))).toBe(true);
    expect(verifySlant3dSignature(SECRET, BODY, "1698876543000", sign(BODY, "1698876543000"))).toBe(false);
  });
});

describe("parseSlant3dWebhookPayload", () => {
  it("flags the test webhook and passes unknown event types through", () => {
    expect(parseSlant3dWebhookPayload(JSON.stringify({ event_type: "order.shipped", dummy: true, data: {} }))).toMatchObject({ type: "order.shipped", dummy: true, order: null });
    expect(parseSlant3dWebhookPayload(JSON.stringify({ event_type: "order.refunded", data: {} }))).toMatchObject({ type: "other", rawType: "order.refunded" });
    expect(parseSlant3dWebhookPayload(JSON.stringify({ event_type: "filament.updated", data: { filaments: { added: ["a"], updated: [], removed: [] } } }))).toMatchObject({ type: "filament.updated", order: null });
  });

  it("refuses a body that isn't a Slant event", () => {
    expect(() => parseSlant3dWebhookPayload("not json")).toThrow(Slant3dWebhookPayloadParseError);
    expect(() => parseSlant3dWebhookPayload(JSON.stringify({ data: {} }))).toThrow(Slant3dWebhookPayloadParseError);
  });
});

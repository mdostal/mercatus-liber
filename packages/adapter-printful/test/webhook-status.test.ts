import { createHmac } from "node:crypto";
import { createInMemoryEventBus } from "@mercatus-liber/core";
import { createInMemoryProviderOrderLinkRepository, createProviderOrderStatusRecorder, FULFILLMENT_ORDER_STATUS_CHANGED, type FulfillmentOrderStatusChanged } from "@mercatus-liber/fulfillment";
import { describe, expect, it } from "vitest";
import { orderIdFromPrintfulExternalId, PRINTFUL_EXTERNAL_ID_MAX_LENGTH, PrintfulExternalIdTooLongError, printfulExternalIdFor } from "../src/index.js";
import { createPrintfulFulfillmentAdapter, PRINTFUL_PROVIDER, parsePrintfulWebhookPayload, printfulOrderStatusUpdateFrom, printfulWebhookSignatureFrom, type PrintfulHttpClient } from "../src/index.js";
import { PRINTFUL_WEBHOOK_FIXTURES as FIXTURES } from "./webhook-fixtures.js";

const updateFrom = (body: unknown) => printfulOrderStatusUpdateFrom(parsePrintfulWebhookPayload(JSON.stringify(body)));

describe("printfulOrderStatusUpdateFrom", () => {
  it("reads a v2 shipment_sent as shipped, with the tracking number and the store's order id", () => {
    expect(updateFrom(FIXTURES.shipment_sent)).toEqual({ externalOrderId: "880011", orderId: "order-1001", status: "shipped", trackingNumber: "TRACK-0001", carrier: null });
  });

  it("reads a v1 package_shipped as shipped, with the carrier the v1 shipment names", () => {
    expect(updateFrom(FIXTURES.package_shipped)).toEqual({ externalOrderId: "880011", orderId: "order-1001", status: "shipped", trackingNumber: "TRACK-0001", carrier: "USPS" });
  });

  it("reads shipment_delivered as delivered", () => {
    expect(updateFrom(FIXTURES.shipment_delivered)).toMatchObject({ externalOrderId: "880011", status: "delivered", trackingNumber: "TRACK-0001" });
  });

  it("reads order_failed and order_canceled as unfulfilled, without tracking", () => {
    for (const body of [FIXTURES.order_failed, FIXTURES.order_canceled]) {
      expect(updateFrom(body)).toEqual({ externalOrderId: "880011", orderId: "order-1001", status: "unfulfilled", trackingNumber: null, carrier: null });
    }
  });

  it("reads a returned parcel as shipped, the closest line status there is", () => {
    expect(updateFrom(FIXTURES.shipment_returned)).toMatchObject({ status: "shipped", trackingNumber: "TRACK-0001" });
    expect(updateFrom(FIXTURES.package_returned)).toMatchObject({ status: "shipped", trackingNumber: "TRACK-0001", carrier: "USPS" });
  });

  it("gives null for order_created, order_updated, unrelated events and an event with no order id", () => {
    expect(updateFrom({ type: "order_created", data: { order: { id: 1, external_id: "o", status: "draft" } } })).toBeNull();
    expect(updateFrom({ type: "order_updated", data: { order: { id: 1, external_id: "o", status: "partial" } } })).toBeNull();
    expect(updateFrom({ type: "catalog_stock_updated", data: {} })).toBeNull();
    expect(updateFrom({ type: "shipment_sent", data: { shipment: { tracking_number: "T" } } })).toBeNull();
    expect(updateFrom({ type: "shipment_sent" })).toBeNull();
  });

  it("leaves orderId null for an order with no external id, and tracking null when the shipment has none", () => {
    expect(updateFrom({ type: "shipment_sent", data: { order: { id: 7, external_id: null }, shipment: { id: 1, tracking_number: "" } } })).toEqual({ externalOrderId: "7", orderId: null, status: "shipped", trackingNumber: null, carrier: null });
  });
});

describe("printfulWebhookSignatureFrom", () => {
  it("reads x-pf-webhook-signature from Headers or a plain object, in any case", () => {
    expect(printfulWebhookSignatureFrom(new Headers({ "X-PF-Webhook-Signature": "abc" }))).toBe("abc");
    expect(printfulWebhookSignatureFrom({ "X-Pf-Webhook-Signature": ["abc", "def"] })).toBe("abc");
    expect(printfulWebhookSignatureFrom(new Headers())).toBe("");
  });
});

describe("a signed Printful webhook through the adapter and the status recorder", () => {
  const SECRET_HEX = Buffer.from("made-up-webhook-secret").toString("hex");
  const sign = (body: string) => createHmac("sha256", Buffer.from(SECRET_HEX, "hex")).update(body).digest("hex");

  function setup() {
    const events = createInMemoryEventBus();
    const links = createInMemoryProviderOrderLinkRepository();
    const recorder = createProviderOrderStatusRecorder({ links, events });
    const published: FulfillmentOrderStatusChanged[] = [];
    events.subscribe<FulfillmentOrderStatusChanged>(FULFILLMENT_ORDER_STATUS_CHANGED, (payload) => {
      published.push(payload);
    });
    const adapter = createPrintfulFulfillmentAdapter({
      apiToken: "unused",
      httpClient: {} as PrintfulHttpClient,
      resolveRecipient: async () => ({ name: "n", email: "e@example.com" }),
      resolveCatalogTarget: async () => ({ catalogVariantId: 1 }),
      webhookSecretKeyHex: SECRET_HEX,
      onWebhookEvent: async (event) => {
        const update = printfulOrderStatusUpdateFrom(event);
        if (update) await recorder.record(PRINTFUL_PROVIDER, update);
      },
    });
    const deliver = (body: unknown) => {
      const raw = JSON.stringify(body);
      return adapter.handleWebhookEvent!(raw, printfulWebhookSignatureFrom(new Headers({ "x-pf-webhook-signature": sign(raw) })));
    };
    return { links, published, deliver, adapter };
  }

  it("publishes shipped once for the linked order's lines, then delivered, and nothing for the return", async () => {
    const { links, published, deliver } = setup();
    await links.link({ orderId: "order-1001", provider: PRINTFUL_PROVIDER, externalOrderId: "880011", skuIds: ["tee-black-m"] });

    await deliver(FIXTURES.shipment_sent);
    await deliver(FIXTURES.shipment_sent);
    await deliver(FIXTURES.shipment_returned);
    await deliver(FIXTURES.shipment_delivered);

    expect(published.map((p) => [p.status, p.previousStatus])).toEqual([
      ["shipped", null],
      ["delivered", "shipped"],
    ]);
    expect(published[0]).toMatchObject({ orderId: "order-1001", skuIds: ["tee-black-m"], provider: "printful", externalOrderId: "880011", trackingNumber: "TRACK-0001", carrier: null });
  });

  it("uses the payload's external_id when no link is stored", async () => {
    const { published, deliver } = setup();
    await deliver(FIXTURES.order_failed);
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ orderId: "order-1001", status: "unfulfilled", skuIds: [] });
  });

  it("refuses a delivery whose signature header is missing, and publishes nothing", async () => {
    const { published, adapter } = setup();
    const raw = JSON.stringify(FIXTURES.shipment_sent);
    await expect(adapter.handleWebhookEvent!(raw, printfulWebhookSignatureFrom(new Headers()))).rejects.toThrow(/signature verification failed/);
    expect(published).toHaveLength(0);
  });
});

describe("order ids longer than Printful's 32-character external_id", () => {
  // Printful's real API answered a 36-character UUID with HTTP 400: "Maximum external_id string length is 32".
  const UUID_ORDER = "3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b";
  const UNDASHED = "3f2b8c1e9a4d4e6f8b1a0c2d3e4f5a6b";

  it("sends a UUID without its dashes and leaves shorter ids alone", () => {
    expect(printfulExternalIdFor(UUID_ORDER)).toBe(UNDASHED);
    expect(printfulExternalIdFor(UUID_ORDER).length).toBeLessThanOrEqual(PRINTFUL_EXTERNAL_ID_MAX_LENGTH);
    expect(printfulExternalIdFor("order-1001")).toBe("order-1001");
    expect(printfulExternalIdFor("x".repeat(32))).toBe("x".repeat(32));
  });

  it("refuses a long id that is not a UUID, before anything is sent", () => {
    expect(() => printfulExternalIdFor("order-" + "9".repeat(40))).toThrow(PrintfulExternalIdTooLongError);
  });

  it("puts the dashes back on 32 hex characters only", () => {
    expect(orderIdFromPrintfulExternalId(UNDASHED)).toBe(UUID_ORDER);
    expect(orderIdFromPrintfulExternalId("order-1001")).toBe("order-1001");
    expect(orderIdFromPrintfulExternalId("z".repeat(32))).toBe("z".repeat(32));
  });

  it("gives the status event the store's own order id back", () => {
    const body = structuredClone(FIXTURES.shipment_sent) as { data: { order: { external_id: string } } };
    body.data.order.external_id = UNDASHED;
    expect(updateFrom(body)).toMatchObject({ orderId: UUID_ORDER, status: "shipped" });
  });

  it("submits and reads back a UUID order under the short id, reporting the store's id on its records", async () => {
    const seen: string[] = [];
    const order = (external_id: string) => ({ id: 555, external_id, store_id: 1, shipping: "STANDARD", status: "draft", created_at: "", updated_at: "", recipient: {}, order_items: [{ id: 1, type: "order_item", source: "catalog", catalog_variant_id: 4011, external_id: "sku-tee", quantity: 1 }] });
    const adapter = createPrintfulFulfillmentAdapter({
      apiToken: "made-up",
      holdOrders: true,
      resolveRecipient: async () => ({ name: "Ada Example", address1: "1 Main St", city: "Austin", state_code: "TX", country_code: "US", zip: "78701" }),
      resolveCatalogTarget: async () => ({ catalogVariantId: 4011 }),
      httpClient: {
        createOrder: async (body: { external_id?: string }) => {
          seen.push(`create ${body.external_id}`);
          return { data: order(body.external_id!) };
        },
        confirmOrder: async () => ({ data: order(UNDASHED) }),
        getOrder: async (ref: string) => {
          seen.push(`get ${ref}`);
          return { data: order(UNDASHED) };
        },
        getShipments: async (ref: string) => {
          seen.push(`shipments ${ref}`);
          return { data: [] };
        },
      } as never,
    } as never);

    const records = await adapter.submitOrder({ orderId: UUID_ORDER, items: [{ skuId: "sku-tee", quantity: 1 }] });
    const status = await adapter.getOrderStatus(UUID_ORDER);
    expect(seen).toEqual([`create ${UNDASHED}`, `get @${UNDASHED}`, `shipments @${UNDASHED}`]);
    expect(records[0]!.orderId).toBe(UUID_ORDER);
    expect(status[0]!.orderId).toBe(UUID_ORDER);
  });
});

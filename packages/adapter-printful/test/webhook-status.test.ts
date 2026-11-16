import { createHmac } from "node:crypto";
import { createInMemoryEventBus } from "@mercatus-liber/core";
import { createInMemoryProviderOrderLinkRepository, createProviderOrderStatusRecorder, FULFILLMENT_ORDER_STATUS_CHANGED, type FulfillmentOrderStatusChanged } from "@mercatus-liber/fulfillment";
import { describe, expect, it } from "vitest";
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

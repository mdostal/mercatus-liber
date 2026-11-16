import { createHmac } from "node:crypto";
import { createPrintfulFulfillmentAdapter, printfulOrderStatusUpdateFrom, type PrintfulHttpClient } from "@mercatus-liber/adapter-printful";
import { createSlant3dFulfillmentAdapter, slant3dOrderStatusUpdateFrom } from "@mercatus-liber/adapter-slant3d";
import { createInMemoryEventBus } from "@mercatus-liber/core";
import { createInMemoryProviderOrderLinkRepository, createProviderOrderStatusRecorder, FULFILLMENT_ORDER_STATUS_CHANGED } from "@mercatus-liber/fulfillment";
import { describe, expect, it } from "vitest";
import { createSimplyPrintFulfillmentAdapter, type SimplyPrintWebhookAction } from "@mercatus-liber/adapter-simplyprint";
import { printfulSignatureFrom, receiveFulfillmentWebhook, simplyPrintSecretFrom, slant3dSignatureFrom, type FulfillmentWebhookReceivers } from "../lib/fulfillment-webhooks";

const SECRET = "whsec_test_secret";
const NOW = 1_763_000_000_000;

/** Signs a body the way Slant's "Webhook Signature Verification" section describes (see adapter-slant3d's webhook.ts). */
function slantHeaders(body: string, secret = SECRET, timestamp = String(NOW)): Headers {
  const signature = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
  return new Headers({ "x-webhook-timestamp": timestamp, "x-webhook-signature-256": signature });
}

function receivers(events: unknown[]): FulfillmentWebhookReceivers {
  const adapter = createSlant3dFulfillmentAdapter({
    apiKey: "k",
    platformId: "p",
    resolveCatalogTarget: async () => ({ fileId: "f", filamentId: "m" }),
    webhookSecret: SECRET,
    now: () => NOW,
    onWebhookEvent: (event) => {
      events.push(event);
    },
  });
  return { slant3d: { signatureFrom: slant3dSignatureFrom, handle: (body, sig) => adapter.handleWebhookEvent(body, sig) } };
}

const BODY = JSON.stringify({ event_type: "order.shipped", data: { publicOrderId: "SL-1" } });

describe("receiveFulfillmentWebhook", () => {
  it("accepts a correctly signed Slant 3D delivery and hands the event on", async () => {
    const events: unknown[] = [];
    const outcome = await receiveFulfillmentWebhook(receivers(events), "slant3d", slantHeaders(BODY), BODY);
    expect(outcome).toEqual({ status: 200, body: { received: true } });
    expect(events).toHaveLength(1);
  });

  it("refuses a bad signature with 401 and hands nothing on", async () => {
    const events: unknown[] = [];
    const outcome = await receiveFulfillmentWebhook(receivers(events), "slant3d", slantHeaders(BODY, "wrong-secret"), BODY);
    expect(outcome.status).toBe(401);
    expect(events).toHaveLength(0);
  });

  it("refuses a delivery with no signature headers", async () => {
    const outcome = await receiveFulfillmentWebhook(receivers([]), "slant3d", new Headers(), BODY);
    expect(outcome.status).toBe(401);
  });

  it("answers 404 for a provider that isn't configured, including inherited property names", async () => {
    expect((await receiveFulfillmentWebhook(receivers([]), "3dapi", new Headers(), BODY)).status).toBe(404);
    expect((await receiveFulfillmentWebhook(receivers([]), "toString", new Headers(), BODY)).status).toBe(404);
  });

  it("answers 400 for a signed body that isn't a webhook payload", async () => {
    const junk = "not json";
    const outcome = await receiveFulfillmentWebhook(receivers([]), "slant3d", slantHeaders(junk), junk);
    expect(outcome).toEqual({ status: 400, body: { error: "invalid_body" } });
  });

  it("still answers 401 and 400 when the error is another bundled copy of the adapter's class", async () => {
    // In a production Next build the route can hold its own copy of a package, so `instanceof` is false for the adapter's error.
    class Slant3dWebhookSignatureInvalidError extends Error {
      override name = "Slant3dWebhookSignatureInvalidError";
    }
    class PrintfulWebhookPayloadParseError extends Error {
      override name = "PrintfulWebhookPayloadParseError";
    }
    const throwing = (error: Error): FulfillmentWebhookReceivers => ({ slant3d: { signatureFrom: slant3dSignatureFrom, handle: async () => { throw error; } } });
    expect((await receiveFulfillmentWebhook(throwing(new Slant3dWebhookSignatureInvalidError("bad")), "slant3d", slantHeaders(BODY), BODY)).status).toBe(401);
    expect((await receiveFulfillmentWebhook(throwing(new PrintfulWebhookPayloadParseError("bad")), "slant3d", slantHeaders(BODY), BODY)).status).toBe(400);
  });

  it("answers 500 when our own handler fails, so the provider retries", async () => {
    const failing: FulfillmentWebhookReceivers = { slant3d: { signatureFrom: slant3dSignatureFrom, handle: async () => { throw new Error("bus down"); } } };
    expect((await receiveFulfillmentWebhook(failing, "slant3d", slantHeaders(BODY), BODY)).status).toBe(500);
  });
});

describe("a signed Slant 3D delivery, end to end", () => {
  // The same chain lib/services.ts builds: adapter -> status mapper -> recorder -> event bus.
  async function deliver(body: string) {
    const links = createInMemoryProviderOrderLinkRepository();
    const events = createInMemoryEventBus();
    const published: unknown[] = [];
    events.subscribe(FULFILLMENT_ORDER_STATUS_CHANGED, async (payload) => {
      published.push(payload);
    });
    const recorder = createProviderOrderStatusRecorder({ links, events });
    await links.link({ orderId: "order-1", provider: "slant3d", externalOrderId: "SL-1" });
    const adapter = createSlant3dFulfillmentAdapter({
      apiKey: "k",
      platformId: "p",
      resolveCatalogTarget: async () => ({ fileId: "f", filamentId: "m" }),
      webhookSecret: SECRET,
      now: () => NOW,
      onWebhookEvent: async (event) => {
        const update = slant3dOrderStatusUpdateFrom(event);
        if (update) await recorder.record("slant3d", update);
      },
    });
    const receivers: FulfillmentWebhookReceivers = { slant3d: { signatureFrom: slant3dSignatureFrom, handle: (raw, sig) => adapter.handleWebhookEvent(raw, sig) } };
    const send = () => receiveFulfillmentWebhook(receivers, "slant3d", slantHeaders(body), body);
    return { send, published };
  }

  it("publishes the store order's new status once, however often Slant retries", async () => {
    const body = JSON.stringify({ event_type: "order.shipped", data: { order: { public_id: "SL-1", status: "SHIPPED", tracking_number: "TRK1" } } });
    const { send, published } = await deliver(body);
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    expect(published).toEqual([expect.objectContaining({ orderId: "order-1", provider: "slant3d", externalOrderId: "SL-1", status: "shipped", trackingNumber: "TRK1", carrier: null, previousStatus: null })]);
  });

  it("accepts a delivery about an order this store never placed, and publishes nothing", async () => {
    const body = JSON.stringify({ event_type: "order.shipped", data: { order: { public_id: "SL-other", status: "SHIPPED" } } });
    const { send, published } = await deliver(body);
    expect((await send()).status).toBe(200);
    expect(published).toHaveLength(0);
  });
});

describe("a signed Printful delivery, end to end", () => {
  // Made-up values in the shape of Printful's v2 `shipment_sent` webhook (see adapter-printful's test/webhook-fixtures.ts).
  const SHIPPED = JSON.stringify({ type: "shipment_sent", occurred_at: "2026-11-12T15:30:05Z", retries: 0, store_id: 4242, data: { shipment: { id: 5501, tracking_number: "TRACK-0001" }, order: { id: 880011, external_id: "order-1" } } });
  const SECRET_HEX = Buffer.from("made-up-printful-secret").toString("hex");
  const printfulHeaders = (body: string, secretHex = SECRET_HEX) => new Headers({ "x-pf-webhook-signature": createHmac("sha256", Buffer.from(secretHex, "hex")).update(body).digest("hex") });

  function setup(webhookSecretKeyHex: string = SECRET_HEX) {
    const links = createInMemoryProviderOrderLinkRepository();
    const events = createInMemoryEventBus();
    const published: unknown[] = [];
    events.subscribe(FULFILLMENT_ORDER_STATUS_CHANGED, async (payload) => {
      published.push(payload);
    });
    const recorder = createProviderOrderStatusRecorder({ links, events });
    const adapter = createPrintfulFulfillmentAdapter({
      apiToken: "t",
      httpClient: {} as PrintfulHttpClient,
      resolveRecipient: async () => ({ name: "n", email: "e@example.com" }),
      resolveCatalogTarget: async () => ({ catalogVariantId: 1 }),
      ...(webhookSecretKeyHex ? { webhookSecretKeyHex } : {}),
      onWebhookEvent: async (event) => {
        const update = printfulOrderStatusUpdateFrom(event);
        if (update) await recorder.record("printful", update);
      },
    });
    const receivers: FulfillmentWebhookReceivers = { printful: { signatureFrom: printfulSignatureFrom, handle: adapter.handleWebhookEvent!.bind(adapter) } };
    return { links, published, send: (body: string, headers = printfulHeaders(body)) => receiveFulfillmentWebhook(receivers, "printful", headers, body) };
  }

  it("publishes shipped for the linked store order once, however often Printful retries", async () => {
    const { links, published, send } = setup();
    await links.link({ orderId: "order-1", provider: "printful", externalOrderId: "880011", skuIds: ["tee-black-m"] });
    expect((await send(SHIPPED)).status).toBe(200);
    expect((await send(SHIPPED)).status).toBe(200);
    expect(published).toEqual([expect.objectContaining({ orderId: "order-1", skuIds: ["tee-black-m"], provider: "printful", externalOrderId: "880011", status: "shipped", trackingNumber: "TRACK-0001", previousStatus: null })]);
  });

  it("answers 401 for a wrong or missing signature and 400 for a signed body that isn't JSON", async () => {
    const { published, send } = setup();
    expect((await send(SHIPPED, printfulHeaders(SHIPPED, Buffer.from("other").toString("hex")))).status).toBe(401);
    expect((await send(SHIPPED, new Headers())).status).toBe(401);
    expect((await send("not json")).status).toBe(400);
    expect(published).toHaveLength(0);
  });

  it("answers 401 when the adapter has no webhook secret, whatever the signature", async () => {
    const { published, send } = setup("");
    expect((await send(SHIPPED)).status).toBe(401);
    expect(published).toHaveLength(0);
  });
});

describe("a SimplyPrint delivery", () => {
  // Made up for this test and joined at runtime so secret scanners do not read it as a real secret.
  const SP_SECRET = ["simplyprint", "made-up-test-secret"].join("_");
  const DELETED = JSON.stringify({ webhook_id: 25, event: "queue.delete_item", timestamp: 1776691249, data: { queue_item: { id: 430001 } } });

  function setup(webhookSecret = SP_SECRET) {
    const actions: SimplyPrintWebhookAction[] = [];
    const adapter = createSimplyPrintFulfillmentAdapter({
      apiKey: "k",
      companyId: "1",
      resolveCatalogTarget: async () => ({ fileId: "f" }),
      ...(webhookSecret ? { webhookSecret } : {}),
      onWebhookEvent: (action) => {
        actions.push(action);
      },
    });
    const receivers: FulfillmentWebhookReceivers = { simplyprint: { signatureFrom: simplyPrintSecretFrom, handle: (body, secret) => adapter.handleWebhookEvent(body, secret) } };
    return { actions, send: (body: string, headers: Headers) => receiveFulfillmentWebhook(receivers, "simplyprint", headers, body) };
  }

  it("is accepted with the secret in X-SP-Secret and handed on", async () => {
    const { actions, send } = setup();
    expect(await send(DELETED, new Headers({ "X-SP-Secret": SP_SECRET }))).toEqual({ status: 200, body: { received: true } });
    expect(actions).toEqual([{ kind: "queue_item_closed", queueItemId: "430001", printState: "cancelled" }]);
  });

  it("answers 401 for a wrong or missing secret, 401 when none is configured, and 400 for a body that isn't a payload", async () => {
    const { actions, send } = setup();
    expect((await send(DELETED, new Headers({ "X-SP-Secret": "wrong" }))).status).toBe(401);
    expect((await send(DELETED, new Headers())).status).toBe(401);
    expect((await send("not json", new Headers({ "X-SP-Secret": SP_SECRET }))).status).toBe(400);
    expect((await setup("").send(DELETED, new Headers({ "X-SP-Secret": SP_SECRET }))).status).toBe(401);
    expect(actions).toHaveLength(0);
  });
});

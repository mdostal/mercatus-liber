import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  createDapiFulfillmentAdapter,
  createInMemoryDapiWebhookEventStore,
  dapiWebhookSignatureFromHeaders,
  DapiWebhookPayloadParseError,
  DapiWebhookSignatureInvalidError,
  DapiWebhookSignatureNotConfiguredError,
  DapiWebhookTimestampError,
  parseDapiWebhookSignature,
  verifyDapiSignature,
  type DapiFulfillmentAdapterConfig,
  type DapiWebhookEvent,
} from "../src/index.js";
import { order, QUOTE_A, quote } from "./helpers.js";

// Made up for these tests and joined at runtime so secret scanners do not read it as a real signing secret.
const SECRET = ["whsec", "made-up-test-secret"].join("_");
const NOW_S = 1791974520;

/** Signs a body the way 3DAPI's docs describe: sha256= + HMAC-SHA256("<timestamp>.<raw body>", secret). */
function sign(body: string, timestamp: number | string = NOW_S, secret = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;
}

function delivery(body: string, timestamp: number | string = NOW_S, secret = SECRET): string {
  return dapiWebhookSignatureFromHeaders({ "X-Dapi-Webhook-Signature": sign(body, timestamp, secret), "X-Dapi-Webhook-Timestamp": String(timestamp), "X-Dapi-Event-Id": "evt_1" });
}

function event(type: string, object: unknown, id = "evt_1"): string {
  return JSON.stringify({ id, object: "event", type, created_at: "2026-11-12T09:00:00Z", data: { object, previous: { status: "in_production" }, region: null } });
}

const shippedOrder = order({ status: "shipped", shipping: { tier: "small", carrier: "DHL", tracking_number: "JD0146", shipped_at: "2026-11-12T09:00:00Z" } });

function setup(overrides: Partial<DapiFulfillmentAdapterConfig> = {}) {
  const onWebhookEvent = vi.fn<(event: DapiWebhookEvent) => void>();
  const adapter = createDapiFulfillmentAdapter({
    apiKey: "key-1",
    resolveCatalogTarget: async () => ({ quoteId: QUOTE_A, useSuggestedMaterials: true }),
    webhookSecret: SECRET,
    now: () => NOW_S * 1000,
    onWebhookEvent,
    ...overrides,
  });
  return { handle: adapter.handleWebhookEvent!, onWebhookEvent };
}

describe("handleWebhookEvent", () => {
  it("accepts a correctly signed delivery and passes on status, carrier and tracking number", async () => {
    const { handle, onWebhookEvent } = setup();
    const body = event("order.shipped", shippedOrder);
    await handle(body, delivery(body));
    expect(onWebhookEvent).toHaveBeenCalledTimes(1);
    expect(onWebhookEvent.mock.calls[0]![0]).toMatchObject({
      type: "order.shipped",
      id: "evt_1",
      order: { externalOrderId: "ord_1", reference: "order-1", dapiStatus: "shipped", status: "shipped", carrier: "DHL", trackingNumber: "JD0146", shippedAt: "2026-11-12T09:00:00Z" },
    });
  });

  it("accepts a Buffer body and a fetch Headers object", async () => {
    const { handle, onWebhookEvent } = setup();
    const body = event("quote.ready", quote());
    const headers = new Headers({ "x-dapi-webhook-signature": sign(body), "x-dapi-webhook-timestamp": String(NOW_S) });
    await handle(Buffer.from(body), dapiWebhookSignatureFromHeaders(headers));
    expect(onWebhookEvent.mock.calls[0]![0]).toMatchObject({ type: "quote.ready", order: null });
  });

  it("rejects a wrong signature, a wrong secret, a changed body and a changed timestamp", async () => {
    const { handle, onWebhookEvent } = setup();
    const body = event("order.shipped", shippedOrder);
    await expect(handle(body, `t=${NOW_S},v1=sha256=${"0".repeat(64)}`)).rejects.toThrow(DapiWebhookSignatureInvalidError);
    await expect(handle(body, delivery(body, NOW_S, "whsec_other"))).rejects.toThrow(DapiWebhookSignatureInvalidError);
    await expect(handle(body.replace("JD0146", "JD9999"), delivery(body))).rejects.toThrow(DapiWebhookSignatureInvalidError);
    await expect(handle(body, `t=${NOW_S + 1},v1=${sign(body)}`)).rejects.toThrow(DapiWebhookSignatureInvalidError);
    expect(onWebhookEvent).not.toHaveBeenCalled();
  });

  it("rejects the bare signature header, missing headers and a non-numeric timestamp", async () => {
    const { handle, onWebhookEvent } = setup();
    const body = event("order.shipped", shippedOrder);
    await expect(handle(body, sign(body))).rejects.toThrow(DapiWebhookSignatureInvalidError);
    await expect(handle(body, dapiWebhookSignatureFromHeaders({}))).rejects.toThrow(DapiWebhookSignatureInvalidError);
    await expect(handle(body, `t=soon,v1=${sign(body, "soon")}`)).rejects.toThrow(DapiWebhookSignatureInvalidError);
    expect(onWebhookEvent).not.toHaveBeenCalled();
  });

  it("rejects a correctly signed delivery more than 5 minutes old or ahead, and accepts one inside the limit", async () => {
    const { handle, onWebhookEvent } = setup();
    const body = event("order.shipped", shippedOrder);
    await expect(handle(body, delivery(body, NOW_S - 301))).rejects.toThrow(DapiWebhookTimestampError);
    await expect(handle(body, delivery(body, NOW_S + 301))).rejects.toThrow(DapiWebhookTimestampError);
    expect(onWebhookEvent).not.toHaveBeenCalled();
    await handle(body, delivery(body, NOW_S - 300));
    expect(onWebhookEvent).toHaveBeenCalledTimes(1);
  });

  it("handles a repeated event id once", async () => {
    const { handle, onWebhookEvent } = setup();
    const body = event("order.shipped", shippedOrder);
    await handle(body, delivery(body));
    await handle(body, delivery(body, NOW_S + 60)); // a retry is signed again with a new timestamp
    expect(onWebhookEvent).toHaveBeenCalledTimes(1);
    const next = event("order.completed", order({ status: "completed" }), "evt_2");
    await handle(next, delivery(next));
    expect(onWebhookEvent).toHaveBeenCalledTimes(2);
  });

  it("handles a delivery again when the handler threw the first time", async () => {
    const onWebhookEvent = vi.fn<(event: DapiWebhookEvent) => void>().mockImplementationOnce(() => {
      throw new Error("database down");
    });
    const { handle } = setup({ onWebhookEvent });
    const body = event("order.shipped", shippedOrder);
    await expect(handle(body, delivery(body))).rejects.toThrow("database down");
    await handle(body, delivery(body));
    expect(onWebhookEvent).toHaveBeenCalledTimes(2);
  });

  it("uses a supplied event store", async () => {
    const store = createInMemoryDapiWebhookEventStore(2);
    await store.add("evt_1");
    const { handle, onWebhookEvent } = setup({ webhookEventStore: store });
    const body = event("order.shipped", shippedOrder);
    await handle(body, delivery(body));
    expect(onWebhookEvent).not.toHaveBeenCalled();
    await store.add("evt_2");
    await store.add("evt_3");
    expect(await store.has("evt_1")).toBe(false); // the oldest id is dropped past the limit
  });

  it("refuses everything when no secret is configured", async () => {
    const { handle, onWebhookEvent } = setup({ webhookSecret: "" });
    const body = event("order.shipped", shippedOrder);
    await expect(handle(body, delivery(body))).rejects.toThrow(DapiWebhookSignatureNotConfiguredError);
    expect(onWebhookEvent).not.toHaveBeenCalled();
  });

  it("lets verifyWebhookSignature replace the built-in check", async () => {
    const verifyWebhookSignature = vi.fn(async (_body: string | Buffer, signature: string) => signature === "trusted");
    const { handle, onWebhookEvent } = setup({ verifyWebhookSignature });
    const body = event("order.paid", order());
    await expect(handle(body, "nope")).rejects.toThrow(DapiWebhookSignatureInvalidError);
    await handle(body, "trusted");
    expect(onWebhookEvent).toHaveBeenCalledTimes(1);
  });

  it("reports an event type it does not know as other, and refuses a signed body that is not an event", async () => {
    const { handle, onWebhookEvent } = setup();
    const unknown = event("stock.low", { object: "stock" }, "evt_9");
    await handle(unknown, delivery(unknown));
    expect(onWebhookEvent.mock.calls[0]![0]).toMatchObject({ type: "other", rawType: "stock.low", order: null });
    await expect(handle("not json", delivery("not json"))).rejects.toThrow(DapiWebhookPayloadParseError);
    await expect(handle("{}", delivery("{}"))).rejects.toThrow(DapiWebhookPayloadParseError);
  });
});

describe("verifyDapiSignature", () => {
  it("matches the scheme in 3DAPI's docs", () => {
    const body = '{"id":"evt_1"}';
    const parts = parseDapiWebhookSignature(`t=${NOW_S},v1=${sign(body)}`)!;
    expect(parts).toEqual({ timestamp: String(NOW_S), signature: sign(body) });
    expect(verifyDapiSignature(SECRET, body, parts, { nowMs: NOW_S * 1000 })).toBe("ok");
    expect(verifyDapiSignature(SECRET, body, parts, { nowMs: (NOW_S + 301) * 1000 })).toBe("stale_timestamp");
    expect(verifyDapiSignature(SECRET, body, parts, { nowMs: (NOW_S + 301) * 1000, toleranceSeconds: 600 })).toBe("ok");
    expect(verifyDapiSignature(SECRET, body, { ...parts, signature: parts.signature.replace("sha256=", "") }, { nowMs: NOW_S * 1000 })).toBe("bad_signature");
    expect(parseDapiWebhookSignature("sha256=abc")).toBeNull();
  });
});

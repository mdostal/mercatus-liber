import { createHmac } from "node:crypto";
import { createSlant3dFulfillmentAdapter } from "@mercatus-liber/adapter-slant3d";
import { describe, expect, it } from "vitest";
import { receiveFulfillmentWebhook, slant3dSignatureFrom, type FulfillmentWebhookReceivers } from "../lib/fulfillment-webhooks";

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

  it("answers 500 when our own handler fails, so the provider retries", async () => {
    const failing: FulfillmentWebhookReceivers = { slant3d: { signatureFrom: slant3dSignatureFrom, handle: async () => { throw new Error("bus down"); } } };
    expect((await receiveFulfillmentWebhook(failing, "slant3d", slantHeaders(BODY), BODY)).status).toBe(500);
  });
});

import { createInMemoryEventBus, type EventBus } from "@mercatus-liber/core";
import { WebhookVerificationError } from "@mercatus-liber/payments";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertPaypalAdapterSatisfiesPaymentAdapter } from "../src/payment-adapter-compat.js";
import type { PaypalHttpClient } from "../src/http-client.js";
import { createPaypalPaymentAdapter, type PaypalPaymentAdapterConfig } from "../src/index.js";
import { PaypalWebhookSignatureInvalidError, PaypalWebhookSignatureNotConfiguredError } from "../src/webhook.js";

/**
 * Every response fixture below is shaped exactly like PayPal's real,
 * documented Orders v2 / webhook-verification API responses confirmed live
 * during this story's research (see paypal-types.ts's top doc comment) --
 * not invented. No live PayPal developer account/app exists in this
 * environment (design-discussion.md's "Real credential gate", same
 * disclosed pattern as adapter-printful/adapter-printify/adapter-shippo).
 * PayPal's own canonical sample order id (`5O190127TN364715T`) is reused
 * here, the same id PayPal's own docs use across every Orders v2 example.
 */
function fakeClient(overrides: Partial<PaypalHttpClient> = {}): PaypalHttpClient & { calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = { createOrder: [], captureOrder: [], getOrder: [], verifyWebhookSignature: [] };
  return {
    calls,
    async createOrder(body) {
      calls.createOrder!.push(body);
      return overrides.createOrder
        ? overrides.createOrder(body)
        : {
            id: "5O190127TN364715T",
            status: "CREATED",
            links: [
              { rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T" },
              { rel: "self", href: "https://api-m.sandbox.paypal.com/v2/checkout/orders/5O190127TN364715T" },
            ],
          };
    },
    async captureOrder(orderId) {
      calls.captureOrder!.push(orderId);
      return overrides.captureOrder
        ? overrides.captureOrder(orderId)
        : { id: orderId, status: "COMPLETED", purchase_units: [{ custom_id: "order-1" }] };
    },
    async getOrder(orderId) {
      calls.getOrder!.push(orderId);
      return overrides.getOrder ? overrides.getOrder(orderId) : null;
    },
    async verifyWebhookSignature(body) {
      calls.verifyWebhookSignature!.push(body);
      return overrides.verifyWebhookSignature ? overrides.verifyWebhookSignature(body) : { verification_status: "SUCCESS" };
    },
  };
}

function baseConfig(client: PaypalHttpClient, events: EventBus, overrides: Partial<PaypalPaymentAdapterConfig> = {}): PaypalPaymentAdapterConfig {
  return {
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    httpClient: client,
    events,
    ...overrides,
  };
}

function headersJson(overrides: Partial<Record<"transmissionId" | "transmissionTime" | "certUrl" | "authAlgo" | "transmissionSig", string>> = {}): string {
  return JSON.stringify({
    transmissionId: "b02c130c-0c0c-11ee-0000-3b2a1a01a1a1",
    transmissionTime: "2026-10-18T12:00:00Z",
    certUrl: "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-abc",
    authAlgo: "SHA256withRSA",
    transmissionSig: "fake-sig==",
    ...overrides,
  });
}

describe("createPaypalPaymentAdapter", () => {
  let events: EventBus;
  const emitted: { event: string; payload: unknown }[] = [];

  beforeEach(() => {
    emitted.length = 0;
    events = createInMemoryEventBus();
    for (const name of ["payments.payment.succeeded", "payments.payment.failed"]) {
      events.subscribe(name, async (payload) => {
        emitted.push({ event: name, payload });
      });
    }
  });

  describe("createPaymentSession", () => {
    it("creates a real Orders v2 order (intent CAPTURE), summing line items into one purchase_unit, custom_id = orderRef, redirectUrl = the real 'approve'-rel link", async () => {
      const client = fakeClient();
      const adapter = createPaypalPaymentAdapter(baseConfig(client, events));

      const result = await adapter.createPaymentSession({
        orderRef: "order-1",
        lineItems: [{ name: "Dragon Organizer", unitAmount: { amount: 1999, currency: "USD" }, quantity: 2 }],
        successUrl: "https://shop.example/success",
        cancelUrl: "https://shop.example/cancel",
      });

      expect(client.calls.createOrder![0]).toEqual({
        intent: "CAPTURE",
        purchase_units: [{ custom_id: "order-1", amount: { currency_code: "USD", value: "39.98" } }],
        payment_source: {
          paypal: {
            experience_context: { return_url: "https://shop.example/success", cancel_url: "https://shop.example/cancel" },
          },
        },
      });
      expect(result).toEqual({ sessionId: "5O190127TN364715T", redirectUrl: "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T" });
    });

    it("converts a zero-decimal PayPal currency (JPY) from minor units correctly, without a decimal point", async () => {
      const client = fakeClient();
      const adapter = createPaypalPaymentAdapter(baseConfig(client, events));

      await adapter.createPaymentSession({
        orderRef: "order-jpy",
        lineItems: [{ name: "Item", unitAmount: { amount: 500, currency: "JPY" }, quantity: 1 }],
        successUrl: "https://shop.example/success",
        cancelUrl: "https://shop.example/cancel",
      });

      expect((client.calls.createOrder![0] as { purchase_units: { amount: { value: string } }[] }).purchase_units[0]!.amount.value).toBe("500");
    });

    it("throws a clear error when PayPal's response has no 'approve' link", async () => {
      const client = fakeClient({ createOrder: async () => ({ id: "x", status: "CREATED", links: [{ rel: "self", href: "https://x" }] }) });
      const adapter = createPaypalPaymentAdapter(baseConfig(client, events));

      await expect(
        adapter.createPaymentSession({
          orderRef: "order-1",
          lineItems: [{ name: "Item", unitAmount: { amount: 100, currency: "USD" }, quantity: 1 }],
          successUrl: "https://shop.example/success",
          cancelUrl: "https://shop.example/cancel",
        }),
      ).rejects.toThrow(/approve/);
    });
  });

  describe("confirmPayment", () => {
    it("returns unpaid/null when the order genuinely does not exist (real 404 -> null)", async () => {
      const client = fakeClient({ getOrder: async () => null });
      const adapter = createPaypalPaymentAdapter(baseConfig(client, events));

      await expect(adapter.confirmPayment("unknown")).resolves.toEqual({ status: "unpaid", orderRef: null });
    });

    it("returns paid directly when the order is already COMPLETED, without calling capture again", async () => {
      const client = fakeClient({ getOrder: async (id) => ({ id, status: "COMPLETED", purchase_units: [{ custom_id: "order-1" }] }) });
      const adapter = createPaypalPaymentAdapter(baseConfig(client, events));

      await expect(adapter.confirmPayment("5O190127TN364715T")).resolves.toEqual({ status: "paid", orderRef: "order-1" });
      expect(client.calls.captureOrder).toHaveLength(0);
    });

    it("captures an APPROVED order (the real create-then-capture flow) and reports paid once the capture itself reports COMPLETED", async () => {
      const client = fakeClient({ getOrder: async (id) => ({ id, status: "APPROVED", purchase_units: [{ custom_id: "order-1" }] }) });
      const adapter = createPaypalPaymentAdapter(baseConfig(client, events));

      const result = await adapter.confirmPayment("5O190127TN364715T");

      expect(client.calls.captureOrder).toEqual(["5O190127TN364715T"]);
      expect(result).toEqual({ status: "paid", orderRef: "order-1" });
    });

    it("reports unpaid for a CREATED (not yet approved) order, without ever calling capture", async () => {
      const client = fakeClient({ getOrder: async (id) => ({ id, status: "CREATED", purchase_units: [{ custom_id: "order-1" }] }) });
      const adapter = createPaypalPaymentAdapter(baseConfig(client, events));

      await expect(adapter.confirmPayment("5O190127TN364715T")).resolves.toEqual({ status: "unpaid", orderRef: "order-1" });
      expect(client.calls.captureOrder).toHaveLength(0);
    });

    it("reports unpaid for a VOIDED order", async () => {
      const client = fakeClient({ getOrder: async (id) => ({ id, status: "VOIDED", purchase_units: [{ custom_id: "order-1" }] }) });
      const adapter = createPaypalPaymentAdapter(baseConfig(client, events));

      await expect(adapter.confirmPayment("5O190127TN364715T")).resolves.toEqual({ status: "unpaid", orderRef: "order-1" });
    });
  });

  describe("handleWebhookEvent", () => {
    const rawCaptureCompleted = JSON.stringify({
      id: "WH-event-1",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: { id: "capture-1", custom_id: "order-1", status: "COMPLETED", supplementary_data: { related_ids: { order_id: "5O190127TN364715T" } } },
    });

    it("fails closed with PaypalWebhookSignatureNotConfiguredError when neither webhookId nor verifyWebhookSignature is configured", async () => {
      const client = fakeClient();
      const adapter = createPaypalPaymentAdapter(baseConfig(client, events));

      await expect(adapter.handleWebhookEvent!(rawCaptureCompleted, headersJson())).rejects.toThrow(PaypalWebhookSignatureNotConfiguredError);
    });

    it("that not-configured error is also a WebhookVerificationError -- the shared base class every PaymentAdapter webhook failure uses", async () => {
      const client = fakeClient();
      const adapter = createPaypalPaymentAdapter(baseConfig(client, events));

      await expect(adapter.handleWebhookEvent!(rawCaptureCompleted, headersJson())).rejects.toThrow(WebhookVerificationError);
    });

    it("verifies via the real POST /v1/notifications/verify-webhook-signature call when webhookId is configured, sending the exact confirmed request shape", async () => {
      const client = fakeClient();
      const adapter = createPaypalPaymentAdapter(baseConfig(client, events, { webhookId: "WH-sub-1" }));

      await adapter.handleWebhookEvent!(rawCaptureCompleted, headersJson());

      expect(client.calls.verifyWebhookSignature![0]).toEqual({
        transmission_id: "b02c130c-0c0c-11ee-0000-3b2a1a01a1a1",
        transmission_time: "2026-10-18T12:00:00Z",
        cert_url: "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-abc",
        auth_algo: "SHA256withRSA",
        transmission_sig: "fake-sig==",
        webhook_id: "WH-sub-1",
        webhook_event: JSON.parse(rawCaptureCompleted),
      });
    });

    it("throws PaypalWebhookSignatureInvalidError when PayPal's own verification call reports FAILURE", async () => {
      const client = fakeClient({ verifyWebhookSignature: async () => ({ verification_status: "FAILURE" }) });
      const adapter = createPaypalPaymentAdapter(baseConfig(client, events, { webhookId: "WH-sub-1" }));

      await expect(adapter.handleWebhookEvent!(rawCaptureCompleted, headersJson())).rejects.toThrow(PaypalWebhookSignatureInvalidError);
    });

    it("throws PaypalWebhookSignatureInvalidError when the signature parameter is not valid JSON (the documented host-bridge contract)", async () => {
      const client = fakeClient();
      const adapter = createPaypalPaymentAdapter(baseConfig(client, events, { webhookId: "WH-sub-1" }));

      await expect(adapter.handleWebhookEvent!(rawCaptureCompleted, "not-json")).rejects.toThrow(PaypalWebhookSignatureInvalidError);
    });

    it("honors a custom verifyWebhookSignature override instead of the default webhookId-based remote verifier", async () => {
      const client = fakeClient();
      const verifyWebhookSignature = vi.fn().mockResolvedValue(true);
      const adapter = createPaypalPaymentAdapter(baseConfig(client, events, { verifyWebhookSignature }));

      await adapter.handleWebhookEvent!(rawCaptureCompleted, "any-signature");

      expect(verifyWebhookSignature).toHaveBeenCalledWith(rawCaptureCompleted, "any-signature");
      expect(client.calls.verifyWebhookSignature).toHaveLength(0);
    });

    it("publishes payments.payment.succeeded on PAYMENT.CAPTURE.COMPLETED, resolving sessionId/orderRef from the real capture resource shape", async () => {
      const client = fakeClient();
      const adapter = createPaypalPaymentAdapter(baseConfig(client, events, { webhookId: "WH-sub-1" }));

      await adapter.handleWebhookEvent!(rawCaptureCompleted, headersJson());

      expect(emitted).toEqual([{ event: "payments.payment.succeeded", payload: { sessionId: "5O190127TN364715T", orderRef: "order-1" } }]);
    });

    it("publishes payments.payment.failed on PAYMENT.CAPTURE.DENIED", async () => {
      const client = fakeClient();
      const adapter = createPaypalPaymentAdapter(baseConfig(client, events, { webhookId: "WH-sub-1" }));
      const raw = JSON.stringify({
        id: "WH-event-2",
        event_type: "PAYMENT.CAPTURE.DENIED",
        resource: { id: "capture-2", custom_id: "order-2", supplementary_data: { related_ids: { order_id: "5O190127ABC" } } },
      });

      await adapter.handleWebhookEvent!(raw, headersJson());

      expect(emitted).toEqual([{ event: "payments.payment.failed", payload: { sessionId: "5O190127ABC", orderRef: "order-2" } }]);
    });

    it.each(["CHECKOUT.ORDER.APPROVED", "CHECKOUT.ORDER.COMPLETED", "PAYMENT.CAPTURE.PENDING", "PAYMENT.CAPTURE.REFUNDED"])(
      "parses the real, documented '%s' event and invokes onWebhookEvent without publishing a succeeded/failed event",
      async (eventType) => {
        const client = fakeClient();
        const onWebhookEvent = vi.fn();
        const adapter = createPaypalPaymentAdapter(baseConfig(client, events, { webhookId: "WH-sub-1", onWebhookEvent }));
        const raw = JSON.stringify({ id: "WH-event-3", event_type: eventType, resource: { id: "res-1" } });

        await adapter.handleWebhookEvent!(raw, headersJson());

        expect(emitted).toHaveLength(0);
        expect(onWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({ type: eventType, id: "WH-event-3" }));
      },
    );

    it("passes an unrecognized-but-real event type through as 'other' rather than throwing", async () => {
      const client = fakeClient();
      const onWebhookEvent = vi.fn();
      const adapter = createPaypalPaymentAdapter(baseConfig(client, events, { webhookId: "WH-sub-1", onWebhookEvent }));
      const raw = JSON.stringify({ id: "WH-event-4", event_type: "CUSTOMER.DISPUTE.CREATED", resource: { id: "res-1" } });

      await adapter.handleWebhookEvent!(raw, headersJson());

      expect(onWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "other", rawType: "CUSTOMER.DISPUTE.CREATED" }));
    });
  });

  describe("PaymentAdapter contract coverage", () => {
    it("passes the real compile-time type-compatibility proof (payment-adapter-compat.ts) and exposes every required method at runtime", () => {
      const client = fakeClient();
      const adapter = assertPaypalAdapterSatisfiesPaymentAdapter(baseConfig(client, events));

      expect(typeof adapter.createPaymentSession).toBe("function");
      expect(typeof adapter.confirmPayment).toBe("function");
      expect(typeof adapter.handleWebhookEvent).toBe("function");
    });
  });
});

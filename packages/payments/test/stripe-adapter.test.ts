import { createInMemoryEventBus, type EventBus } from "@mercatus-liber/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();
const mockRetrieve = vi.fn();
const mockConstructEvent = vi.fn();

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(function MockStripe(this: unknown) {
    Object.assign(this as object, {
      checkout: { sessions: { create: mockCreate, retrieve: mockRetrieve } },
      webhooks: { constructEvent: mockConstructEvent },
    });
  }),
}));

const { createStripeAdapter } = await import("../src/stripe-adapter.js");
const { WebhookVerificationError } = await import("../src/types.js");

describe("createStripeAdapter", () => {
  let events: EventBus;
  const emitted: { event: string; payload: unknown }[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    emitted.length = 0;
    events = createInMemoryEventBus();
    for (const name of ["payments.payment.succeeded", "payments.payment.failed"]) {
      events.subscribe(name, async (payload) => {
        emitted.push({ event: name, payload });
      });
    }
  });

  function adapter() {
    return createStripeAdapter({ secretKey: "sk_test_fake", webhookSecret: "whsec_fake", events });
  }

  describe("createPaymentSession", () => {
    it("builds dynamic line items with lowercased currency, enables automatic tax, and stamps orderRef metadata", async () => {
      mockCreate.mockResolvedValue({ id: "cs_test_123", url: "https://checkout.stripe.com/pay/cs_test_123" });

      const result = await adapter().createPaymentSession({
        orderRef: "order-1",
        lineItems: [{ name: "Dragon Organizer", unitAmount: { amount: 1999, currency: "USD" }, quantity: 2 }],
        successUrl: "https://shop.example/success",
        cancelUrl: "https://shop.example/cancel",
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "payment",
          line_items: [
            {
              price_data: { currency: "usd", product_data: { name: "Dragon Organizer" }, unit_amount: 1999 },
              quantity: 2,
            },
          ],
          success_url: "https://shop.example/success",
          cancel_url: "https://shop.example/cancel",
          automatic_tax: { enabled: true },
          metadata: { orderRef: "order-1" },
        }),
      );
      expect(result).toEqual({ sessionId: "cs_test_123", redirectUrl: "https://checkout.stripe.com/pay/cs_test_123" });
    });

    it("throws if Stripe doesn't return a redirect URL", async () => {
      mockCreate.mockResolvedValue({ id: "cs_test_123", url: null });
      await expect(
        adapter().createPaymentSession({
          orderRef: "order-1",
          lineItems: [],
          successUrl: "https://shop.example/success",
          cancelUrl: "https://shop.example/cancel",
        }),
      ).rejects.toThrow(/did not return a redirect URL/);
    });
  });

  describe("confirmPayment", () => {
    it("maps Stripe's payment_status and metadata.orderRef", async () => {
      mockRetrieve.mockResolvedValue({ payment_status: "paid", metadata: { orderRef: "order-1" } });
      const result = await adapter().confirmPayment("cs_test_123");
      expect(result).toEqual({ status: "paid", orderRef: "order-1" });
    });

    it("returns orderRef null when metadata is missing it", async () => {
      mockRetrieve.mockResolvedValue({ payment_status: "unpaid", metadata: {} });
      const result = await adapter().confirmPayment("cs_test_123");
      expect(result).toEqual({ status: "unpaid", orderRef: null });
    });
  });

  describe("handleWebhookEvent", () => {
    it("publishes payments.payment.succeeded for a paid checkout.session.completed event", async () => {
      mockConstructEvent.mockReturnValue({
        type: "checkout.session.completed",
        data: { object: { id: "cs_test_123", payment_status: "paid", metadata: { orderRef: "order-1" } } },
      });
      await adapter().handleWebhookEvent("raw-body", "sig");
      expect(emitted).toContainEqual({
        event: "payments.payment.succeeded",
        payload: { sessionId: "cs_test_123", orderRef: "order-1" },
      });
    });

    it("publishes payments.payment.failed when the completed session wasn't actually paid", async () => {
      mockConstructEvent.mockReturnValue({
        type: "checkout.session.completed",
        data: { object: { id: "cs_test_123", payment_status: "unpaid", metadata: { orderRef: "order-1" } } },
      });
      await adapter().handleWebhookEvent("raw-body", "sig");
      expect(emitted).toContainEqual({
        event: "payments.payment.failed",
        payload: { sessionId: "cs_test_123", orderRef: "order-1" },
      });
    });

    it("ignores event types other than checkout.session.completed", async () => {
      mockConstructEvent.mockReturnValue({ type: "payment_intent.created", data: { object: {} } });
      await adapter().handleWebhookEvent("raw-body", "sig");
      expect(emitted).toEqual([]);
    });

    it("throws WebhookVerificationError and publishes nothing when signature verification fails", async () => {
      mockConstructEvent.mockImplementation(() => {
        throw new Error("invalid signature");
      });
      await expect(adapter().handleWebhookEvent("raw-body", "bad-sig")).rejects.toThrow(WebhookVerificationError);
      expect(emitted).toEqual([]);
    });
  });
});

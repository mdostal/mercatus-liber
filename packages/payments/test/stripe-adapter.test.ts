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

const { createStripeAdapter, recoverySessionParams } = await import("../src/stripe-adapter.js");
const { WebhookVerificationError } = await import("../src/types.js");

describe("createStripeAdapter", () => {
  let events: EventBus;
  const emitted: { event: string; payload: unknown }[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    emitted.length = 0;
    events = createInMemoryEventBus();
    for (const name of ["payments.payment.succeeded", "payments.payment.failed", "payments.payment.expired"]) {
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

    it("adds a fixed shipping rate when shipping is given, and none otherwise", async () => {
      mockCreate.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/pay/cs_1" });
      await adapter().createPaymentSession({
        orderRef: "order-1",
        lineItems: [{ name: "Tee", unitAmount: { amount: 2800, currency: "USD" }, quantity: 1 }],
        successUrl: "https://s",
        cancelUrl: "https://c",
        shipping: { label: "Standard shipping", amount: { amount: 599, currency: "USD" } },
      });
      expect(mockCreate.mock.calls.at(-1)![0].shipping_options).toEqual([
        { shipping_rate_data: { type: "fixed_amount", display_name: "Standard shipping", fixed_amount: { amount: 599, currency: "usd" }, tax_behavior: "exclusive", tax_code: "txcd_92010001" } },
      ]);
      await adapter().createPaymentSession({ orderRef: "order-2", lineItems: [], successUrl: "https://s", cancelUrl: "https://c" });
      expect(mockCreate.mock.calls.at(-1)![0]).not.toHaveProperty("shipping_options");
    });

    it("asks Stripe to collect the shipping address and phone, and prefills the email, when told to", async () => {
      mockCreate.mockResolvedValue({ id: "cs_test_123", url: "https://checkout.stripe.com/pay/cs_test_123" });
      const base = { orderRef: "order-1", lineItems: [], successUrl: "https://shop.example/success", cancelUrl: "https://shop.example/cancel" };
      await adapter().createPaymentSession({ ...base, collectShippingAddress: { allowedCountries: ["us"], phone: true }, customerEmail: "ada@example.com" });
      expect(mockCreate.mock.calls[0]![0]).toMatchObject({
        shipping_address_collection: { allowed_countries: ["US"] },
        phone_number_collection: { enabled: true },
        customer_email: "ada@example.com",
      });
      await adapter().createPaymentSession(base);
      const plain = mockCreate.mock.calls[1]![0];
      expect(plain).not.toHaveProperty("shipping_address_collection");
      expect(plain).not.toHaveProperty("phone_number_collection");
      expect(plain).not.toHaveProperty("customer_email");
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

    it("includes the address, name, email and phone Stripe collected", async () => {
      const address = { line1: "1 Main St", line2: "", city: "Omaha", state: "NE", postal_code: "68102", country: "US" };
      mockConstructEvent.mockReturnValue({
        type: "checkout.session.completed",
        data: {
          object: {
            id: "cs_test_123",
            payment_status: "paid",
            metadata: { orderRef: "order-1" },
            customer_details: { name: "Ada Example", email: "ada@example.com", phone: "+14025550100", address },
            collected_information: { shipping_details: { name: "Ada Shipto", address } },
          },
        },
      });
      await adapter().handleWebhookEvent("raw-body", "sig");
      expect(emitted).toContainEqual({
        event: "payments.payment.succeeded",
        payload: {
          sessionId: "cs_test_123",
          orderRef: "order-1",
          customer: { name: "Ada Example", email: "ada@example.com", phone: "+14025550100" },
          shippingAddress: { name: "Ada Shipto", line1: "1 Main St", line2: null, city: "Omaha", state: "NE", postalCode: "68102", countryCode: "US" },
        },
      });
    });

    it("reads the shipping address from shipping_details for an endpoint on an older API version", async () => {
      mockConstructEvent.mockReturnValue({
        type: "checkout.session.completed",
        data: { object: { id: "cs_1", payment_status: "paid", metadata: { orderRef: "o" }, shipping_details: { name: "Ada", address: { line1: "1 Main St", line2: null, city: "Omaha", state: "NE", postal_code: "68102", country: "US" } } } },
      });
      await adapter().handleWebhookEvent("raw-body", "sig");
      expect((emitted[0]!.payload as { shippingAddress: unknown }).shippingAddress).toMatchObject({ name: "Ada", city: "Omaha", state: "NE" });
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

    it("publishes payments.payment.expired with the email, consent and recovery link", async () => {
      mockConstructEvent.mockReturnValue({
        type: "checkout.session.expired",
        created: 1_795_000_000,
        data: {
          object: {
            id: "cs_exp",
            metadata: { orderRef: "order-1" },
            customer_details: { email: "ada@example.com" },
            consent: { promotions: "opt_in" },
            after_expiration: { recovery: { enabled: true, allow_promotion_codes: false, url: "https://buy.stripe.com/r/cs_exp", expires_at: 1_797_592_000 } },
          },
        },
      });
      await adapter().handleWebhookEvent("raw-body", "sig");
      expect(emitted).toEqual([
        {
          event: "payments.payment.expired",
          payload: {
            sessionId: "cs_exp",
            orderRef: "order-1",
            email: "ada@example.com",
            promotionalConsent: true,
            recoveryUrl: "https://buy.stripe.com/r/cs_exp",
            recoveryExpiresAt: new Date(1_797_592_000_000).toISOString(),
            expiredAt: new Date(1_795_000_000_000).toISOString(),
          },
        },
      ]);
    });

    it("reports no consent and no link when the session had neither", async () => {
      mockConstructEvent.mockReturnValue({
        type: "checkout.session.expired",
        created: 1_795_000_000,
        data: { object: { id: "cs_exp", metadata: { orderRef: "o" }, customer_email: "pre@example.com", consent: null, after_expiration: null } },
      });
      await adapter().handleWebhookEvent("raw-body", "sig");
      expect(emitted[0]!.payload).toMatchObject({ email: "pre@example.com", promotionalConsent: false, recoveryUrl: null, recoveryExpiresAt: null });
    });

    it("carries the expired session id on a payment made through a recovery link", async () => {
      mockConstructEvent.mockReturnValue({
        type: "checkout.session.completed",
        data: { object: { id: "cs_new", payment_status: "paid", metadata: {}, recovered_from: "cs_exp" } },
      });
      await adapter().handleWebhookEvent("raw-body", "sig");
      expect(emitted[0]).toEqual({ event: "payments.payment.succeeded", payload: { sessionId: "cs_new", orderRef: null, recoveredFromSessionId: "cs_exp" } });
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

  describe("checkoutRecovery", () => {
    it("adds nothing when it isn't configured", async () => {
      mockCreate.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/c/cs_1" });
      await adapter().createPaymentSession({ orderRef: "o", lineItems: [], successUrl: "s", cancelUrl: "c" });
      const params = mockCreate.mock.calls[0]![0];
      expect(params).not.toHaveProperty("consent_collection");
      expect(params).not.toHaveProperty("after_expiration");
      expect(params).not.toHaveProperty("expires_at");
    });

    it("asks for consent, turns on the recovery link and sets the expiry", async () => {
      mockCreate.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/c/cs_1" });
      const withRecovery = createStripeAdapter({ secretKey: "sk_test_fake", webhookSecret: "whsec_fake", events, checkoutRecovery: { expiresAfterMinutes: 60 } });
      const before = Math.floor(Date.now() / 1000);
      await withRecovery.createPaymentSession({ orderRef: "o", lineItems: [], successUrl: "s", cancelUrl: "c" });
      const params = mockCreate.mock.calls[0]![0];
      expect(params.consent_collection).toEqual({ promotions: "auto" });
      expect(params.after_expiration).toEqual({ recovery: { enabled: true, allow_promotion_codes: false } });
      expect(params.expires_at).toBeGreaterThanOrEqual(before + 3600);
      expect(params.expires_at).toBeLessThanOrEqual(before + 3601);
    });

    it("lets each part be turned off, and refuses an expiry Stripe won't take", () => {
      expect(recoverySessionParams({ askPromotionalConsent: false, recoveryLink: false })).toEqual({});
      expect(recoverySessionParams({ allowPromotionCodesOnRecovery: true, askPromotionalConsent: false })).toEqual({ after_expiration: { recovery: { enabled: true, allow_promotion_codes: true } } });
      expect(() => recoverySessionParams({ expiresAfterMinutes: 10 })).toThrow(RangeError);
      expect(() => recoverySessionParams({ expiresAfterMinutes: 2000 })).toThrow(RangeError);
    });
  });
});

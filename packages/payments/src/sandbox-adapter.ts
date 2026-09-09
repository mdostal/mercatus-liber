import { randomUUID } from "node:crypto";
import type { EventBus } from "@mercatus-liber/core";
import type { CreatePaymentSessionInput, PaymentAdapter, PaymentConfirmation, PaymentSession } from "./types.js";

/**
 * A real, fully-working PaymentAdapter that completes checkout with no
 * external provider and no API key -- the reference storefront's default
 * (see apps/reference-storefront/lib/services.ts) whenever STRIPE_SECRET_KEY
 * is unset, so every demo store ships with a genuinely completable "practice
 * card" checkout out of the box rather than a dead end. Unlike
 * createLazyStripeAdapter's unconfigured state (which throws on first real
 * use), this is never a degraded fallback -- it's a second real adapter,
 * proving the same PaymentAdapter interface (packages/payments/src/types.ts)
 * swaps cleanly for a completely different implementation with zero changes
 * to checkout-orders or any app code that doesn't already special-case
 * payment providers.
 *
 * createPaymentSession redirects to the app's own interactive sandbox
 * checkout page (`checkoutPagePath`, e.g.
 * `/demo/<demoSlug>/checkout/sandbox`) instead of a real hosted payment
 * page -- the shopper still has to look at an order summary and click "Pay"
 * there before anything transitions to paid, matching Stripe's own "nothing
 * is paid until the shopper acts" behavior. That page's server action calls
 * `confirmSandboxPayment` below (not part of the PaymentAdapter interface --
 * an extra method this adapter alone exposes) once the shopper submits,
 * which publishes the exact same `payments.payment.succeeded` event a real,
 * verified Stripe webhook would publish -- so checkout-orders's own
 * order-status transition logic (packages/checkout-orders/src/service.ts)
 * is byte-identical between the real and sandbox adapters; this file never
 * touches Order/OrderStatus directly.
 */
export interface SandboxPaymentAdapter extends PaymentAdapter {
  confirmSandboxPayment(sessionId: string): Promise<void>;
}

interface SandboxSession {
  orderRef: string;
  status: "unpaid" | "paid";
}

export function createSandboxPaymentAdapter(config: { events: EventBus; checkoutPagePath: string }): SandboxPaymentAdapter {
  const { events, checkoutPagePath } = config;
  const sessions = new Map<string, SandboxSession>();

  return {
    async createPaymentSession(input: CreatePaymentSessionInput): Promise<PaymentSession> {
      const sessionId = `sandbox_${randomUUID()}`;
      sessions.set(sessionId, { orderRef: input.orderRef, status: "unpaid" });

      const currency = input.lineItems[0]?.unitAmount.currency ?? "USD";
      const totalAmount = input.lineItems.reduce((sum, item) => sum + item.unitAmount.amount * item.quantity, 0);
      const itemCount = input.lineItems.reduce((sum, item) => sum + item.quantity, 0);

      const params = new URLSearchParams({
        session: sessionId,
        total: String(totalAmount),
        currency,
        items: String(itemCount),
        success: input.successUrl,
        cancel: input.cancelUrl,
      });

      return { sessionId, redirectUrl: `${checkoutPagePath}?${params.toString()}` };
    },

    async confirmPayment(sessionId: string): Promise<PaymentConfirmation> {
      const record = sessions.get(sessionId);
      if (!record) return { status: "unpaid", orderRef: null };
      return { status: record.status, orderRef: record.orderRef };
    },

    async handleWebhookEvent(): Promise<void> {
      throw new Error(
        "createSandboxPaymentAdapter has no external provider, so it never receives a real webhook -- " +
          "the sandbox checkout page's server action calls confirmSandboxPayment directly instead.",
      );
    },

    async confirmSandboxPayment(sessionId: string): Promise<void> {
      const record = sessions.get(sessionId);
      if (!record) throw new Error(`Unknown sandbox payment session: ${sessionId}`);
      // Idempotent: a duplicate submit (double-click, back-button resubmit)
      // re-publishes the same event, which checkout-orders's own subscriber
      // already treats as a no-op for an order that isn't still
      // "pending_payment" (see its "Idempotent: a redelivered webhook event"
      // comment) -- so this never double-transitions or double-counts.
      record.status = "paid";
      await events.publish("payments.payment.succeeded", { sessionId, orderRef: record.orderRef });
    },
  };
}

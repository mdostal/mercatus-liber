import type { EventBus } from "@mercatus-liber/core";
import Stripe from "stripe";
import type {
  CreatePaymentSessionInput,
  PaymentAdapter,
  PaymentConfirmation,
  PaymentSession,
} from "./types.js";
import { WebhookVerificationError } from "./types.js";

export interface StripeAdapterConfig {
  secretKey: string;
  webhookSecret: string;
  events: EventBus;
}

const KNOWN_PAYMENT_STATUSES: readonly PaymentConfirmation["status"][] = [
  "paid",
  "unpaid",
  "no_payment_required",
];

/**
 * Stripe's own type is deliberately wider than the three documented values
 * (forward-compat for values Stripe might add later) -- narrow it explicitly
 * rather than casting, so an unrecognized future value fails loudly instead of
 * silently mis-typing as one of ours.
 */
function toStripeStatus(status: Stripe.Checkout.Session.PaymentStatus): PaymentConfirmation["status"] {
  const candidate = status as string;
  const match = KNOWN_PAYMENT_STATUSES.find((known) => known === candidate);
  if (!match) {
    throw new Error(`Unrecognized Stripe Checkout Session payment_status: "${candidate}"`);
  }
  return match;
}

/**
 * Stripe reference PaymentAdapter -- wraps Stripe Checkout Sessions (dynamic line
 * items, hosted Checkout UI, Stripe Tax). Never touches card data or computes
 * tax itself; every sensitive/compliance-bearing operation is delegated to
 * Stripe's own hosted surfaces. See docs/subsystems/08-payments.md and the CBA
 * that validated this mechanism: ../shop/.pHive/epics/v1-launch/docs/oss-cart-cba.md.
 */
export function createStripeAdapter(config: StripeAdapterConfig): PaymentAdapter {
  const stripe = new Stripe(config.secretKey);
  const { events, webhookSecret } = config;

  return {
    async createPaymentSession(input: CreatePaymentSessionInput): Promise<PaymentSession> {
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: input.lineItems.map((item) => ({
          price_data: {
            currency: item.unitAmount.currency.toLowerCase(),
            product_data: { name: item.name },
            unit_amount: item.unitAmount.amount,
          },
          quantity: item.quantity,
        })),
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        automatic_tax: { enabled: true },
        metadata: { orderRef: input.orderRef },
      });

      if (!session.url) {
        throw new Error(`Stripe did not return a redirect URL for session ${session.id}`);
      }

      return { sessionId: session.id, redirectUrl: session.url };
    },

    async confirmPayment(sessionId: string): Promise<PaymentConfirmation> {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      return {
        status: toStripeStatus(session.payment_status),
        orderRef: typeof session.metadata?.orderRef === "string" ? session.metadata.orderRef : null,
      };
    },

    async handleWebhookEvent(rawBody: string | Buffer, signature: string): Promise<void> {
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
      } catch (err) {
        throw new WebhookVerificationError(
          `Stripe webhook signature verification failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderRef = typeof session.metadata?.orderRef === "string" ? session.metadata.orderRef : null;
        if (session.payment_status === "paid") {
          await events.publish("payments.payment.succeeded", { sessionId: session.id, orderRef });
        } else {
          await events.publish("payments.payment.failed", { sessionId: session.id, orderRef });
        }
      }
    },
  };
}

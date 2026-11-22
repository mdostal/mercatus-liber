import type { EventBus } from "@mercatus-liber/core";
import Stripe from "stripe";
import type {
  CollectedShippingAddress,
  CreatePaymentSessionInput,
  PaymentEvent,
  PaymentExpiredEvent,
  PaymentAdapter,
  PaymentConfirmation,
  PaymentSession,
} from "./types.js";
import { WebhookVerificationError } from "./types.js";

/**
 * Abandoned-checkout recovery on Stripe Checkout. Off unless passed. Turn on
 * the `checkout.session.expired` event on the webhook endpoint too, so
 * payments.payment.expired is published.
 */
export interface StripeCheckoutRecoveryOptions {
  /**
   * Show Stripe's "email me offers" checkbox where the law allows asking
   * (consent_collection.promotions = "auto"). Without consent, a store
   * shouldn't send a reminder. Default true.
   */
  askPromotionalConsent?: boolean;
  /** Give an expired session a recovery link (after_expiration.recovery). Default true. */
  recoveryLink?: boolean;
  /** Let the shopper type a promotion code on the recovered session. Default false. */
  allowPromotionCodesOnRecovery?: boolean;
  /**
   * How long a checkout session stays open, in minutes. Stripe allows 30 to
   * 1440 (24 hours, its default). Shorter means the reminder can go out sooner.
   */
  expiresAfterMinutes?: number;
}

export interface StripeAdapterConfig {
  secretKey: string;
  webhookSecret: string;
  events: EventBus;
  /** Abandoned-checkout recovery. Omit for none (the behavior before this existed). */
  checkoutRecovery?: StripeCheckoutRecoveryOptions;
}

/** The checkout.sessions.create params checkoutRecovery adds. Exported for tests. */
export function recoverySessionParams(options: StripeCheckoutRecoveryOptions | undefined, now = Date.now()): Partial<Stripe.Checkout.SessionCreateParams> {
  if (!options) return {};
  const minutes = options.expiresAfterMinutes;
  if (minutes !== undefined && (!Number.isFinite(minutes) || minutes < 30 || minutes > 1440)) {
    throw new RangeError(`checkoutRecovery.expiresAfterMinutes must be between 30 and 1440 (Stripe's limits); got ${minutes}`);
  }
  return {
    ...(options.askPromotionalConsent !== false ? { consent_collection: { promotions: "auto" as const } } : {}),
    ...(options.recoveryLink !== false
      ? { after_expiration: { recovery: { enabled: true, allow_promotion_codes: options.allowPromotionCodesOnRecovery ?? false } } }
      : {}),
    ...(minutes !== undefined ? { expires_at: Math.floor(now / 1000) + Math.round(minutes * 60) } : {}),
  };
}

const isoFromUnix = (seconds: number | null | undefined) => (typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null);

/** What payments.payment.expired carries, read off an expired Checkout Session. */
function expiredFrom(session: Stripe.Checkout.Session, eventCreated: number): PaymentExpiredEvent {
  const recovery = session.after_expiration?.recovery ?? null;
  return {
    sessionId: session.id,
    orderRef: typeof session.metadata?.orderRef === "string" ? session.metadata.orderRef : null,
    email: session.customer_details?.email ?? session.customer_email ?? null,
    promotionalConsent: session.consent?.promotions === "opt_in",
    recoveryUrl: recovery?.enabled ? (recovery.url ?? null) : null,
    recoveryExpiresAt: recovery?.enabled ? isoFromUnix(recovery.expires_at) : null,
    expiredAt: isoFromUnix(eventCreated) ?? new Date().toISOString(),
  };
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

type StripeAddress = { line1: string | null; line2: string | null; city: string | null; state: string | null; postal_code: string | null; country: string | null };

/**
 * What Stripe collected on its checkout page. The shipping address is at
 * `collected_information.shipping_details` from API version 2025-03-31; a
 * webhook endpoint pinned to an older version sends it as `shipping_details`.
 */
function collectedFrom(session: Stripe.Checkout.Session): Pick<PaymentEvent, "customer" | "shippingAddress"> {
  const details = session.customer_details;
  const legacy = (session as unknown as { shipping_details?: { name?: string | null; address?: StripeAddress | null } | null }).shipping_details;
  const shipping = session.collected_information?.shipping_details ?? legacy ?? null;
  const address = shipping?.address as StripeAddress | null | undefined;
  const shippingAddress: CollectedShippingAddress | undefined =
    address?.line1 && address.city && address.postal_code && address.country
      ? {
          name: shipping?.name ?? null,
          line1: address.line1,
          line2: address.line2 || null,
          city: address.city,
          state: address.state || null,
          postalCode: address.postal_code,
          countryCode: address.country,
        }
      : undefined;
  return {
    ...(details ? { customer: { name: details.name ?? null, email: details.email ?? null, phone: details.phone ?? null } } : {}),
    ...(shippingAddress ? { shippingAddress } : {}),
  };
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
        ...(input.shipping
          ? {
              shipping_options: [
                {
                  shipping_rate_data: {
                    type: "fixed_amount" as const,
                    display_name: input.shipping.label,
                    fixed_amount: { amount: input.shipping.amount.amount, currency: input.shipping.amount.currency.toLowerCase() },
                    // Stripe Tax decides whether shipping is taxable where the shopper is (Stripe's "Charge tax for shipping" docs).
                    tax_behavior: "exclusive" as const,
                    tax_code: "txcd_92010001",
                  },
                },
              ],
            }
          : {}),
        ...(input.collectShippingAddress
          ? {
              shipping_address_collection: {
                allowed_countries: input.collectShippingAddress.allowedCountries.map((code) => code.trim().toUpperCase()) as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
              },
              ...(input.collectShippingAddress.phone ? { phone_number_collection: { enabled: true } } : {}),
            }
          : {}),
        ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        automatic_tax: { enabled: true },
        metadata: { orderRef: input.orderRef },
        ...recoverySessionParams(config.checkoutRecovery),
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
        const payload: PaymentEvent = {
          sessionId: session.id,
          orderRef,
          ...collectedFrom(session),
          ...(session.recovered_from ? { recoveredFromSessionId: session.recovered_from } : {}),
        };
        await events.publish(session.payment_status === "paid" ? "payments.payment.succeeded" : "payments.payment.failed", payload);
      } else if (event.type === "checkout.session.expired") {
        const session = event.data.object as Stripe.Checkout.Session;
        await events.publish("payments.payment.expired", expiredFrom(session, event.created));
      }
    },
  };
}

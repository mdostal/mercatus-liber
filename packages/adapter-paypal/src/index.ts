import type { EventBus } from "@mercatus-liber/core";
import type { CreatePaymentSessionInput, PaymentAdapter, PaymentConfirmation, PaymentSession } from "@mercatus-liber/payments";
import { WebhookVerificationError } from "@mercatus-liber/payments";
import { createPaypalHttpClient, type PaypalHttpClient } from "./http-client.js";
import { minorUnitsToPaypalValue } from "./money.js";
import type { PaypalCreateOrderRequest } from "./paypal-types.js";
import {
  parsePaypalTransmissionHeaders,
  parsePaypalWebhookPayload,
  PaypalWebhookSignatureInvalidError,
  PaypalWebhookSignatureNotConfiguredError,
  resolvePaypalWebhookOrderRef,
  type PaypalWebhookEvent,
} from "./webhook.js";

export * from "./paypal-types.js";
export { minorUnitsToPaypalValue } from "./money.js";
export { PaypalApiError, type PaypalHttpClient } from "./http-client.js";
export {
  parsePaypalTransmissionHeaders,
  parsePaypalWebhookPayload,
  resolvePaypalWebhookOrderRef,
  PaypalWebhookPayloadParseError,
  PaypalWebhookSignatureInvalidError,
  PaypalWebhookSignatureNotConfiguredError,
  type PaypalTransmissionHeaders,
  type PaypalWebhookEvent,
} from "./webhook.js";

export interface PaypalPaymentAdapterConfig {
  clientId: string;
  clientSecret: string;
  /** Defaults to PayPal's real sandbox base -- see http-client.ts's own doc comment. Pass `https://api-m.paypal.com` to go live. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Test/advanced-use injection point: bypasses `clientId`/`clientSecret`/`baseUrl`/`fetchImpl` entirely when supplied. */
  httpClient?: PaypalHttpClient;
  events: EventBus;

  /**
   * The id of the webhook subscription this listener URL was registered
   * under (PayPal issues one per webhook configuration) -- required by the
   * real `POST /v1/notifications/verify-webhook-signature` request body's
   * `webhook_id` field (webhook.ts). Ignored if `verifyWebhookSignature` is
   * also supplied.
   */
  webhookId?: string;

  /**
   * Overrides the default `webhookId`-based remote verifier entirely --
   * useful for a rotated/multi-webhook setup, or to swap in the alternative
   * local CRC32+RSA scheme webhook.ts's doc comment discloses as real but
   * unimplemented here. If neither this nor `webhookId` is supplied,
   * `handleWebhookEvent` fails closed with
   * `PaypalWebhookSignatureNotConfiguredError` rather than trusting an
   * unverified payload -- same fail-closed default as
   * adapter-printify's `PrintifyWebhookSignatureNotConfiguredError`.
   */
  verifyWebhookSignature?(rawBody: string | Buffer, signature: string): boolean | Promise<boolean>;

  /** Invoked with the parsed, signature-verified webhook event -- e.g. to notify the host application of a capture-pending/refunded event this adapter itself doesn't publish a payments.* event for. Optional: a verified-but-unhandled webhook is not an error. */
  onWebhookEvent?(event: PaypalWebhookEvent): void | Promise<void>;
}

function approveLink(order: { links?: { rel: string; href: string }[] }): string {
  const link = order.links?.find((candidate) => candidate.rel === "approve");
  if (!link) {
    throw new Error("PayPal order response has no 'approve' link -- cannot build a redirect URL for the shopper");
  }
  return link.href;
}

/**
 * Real second `PaymentAdapter` implementation (subsystem 08,
 * @mercatus-liber/payments), backed by PayPal's real, documented Orders v2
 * API -- see paypal-types.ts's top doc comment for the full, live-researched
 * citation record. Proves `PaymentAdapter` is genuinely provider-agnostic
 * (Stripe was the only real implementation before this package), per the
 * backlog gap recorded at `.pHive/planning/epic-backlog.md` row 77
 * (`integrations-catalog-and-ecosystem-audit`).
 *
 * `createPaymentSession` -- `POST /v2/checkout/orders` (intent `CAPTURE`),
 * returning the real `"approve"`-rel link's `href` as `redirectUrl`: the
 * shopper is redirected to PayPal's own hosted approval page, the same
 * "never touch card data, redirect to the provider's hosted checkout UI"
 * contract every `PaymentAdapter` implementation follows
 * (packages/payments/src/types.ts).
 *
 * `confirmPayment` -- resolves the real `create`-then-`capture` flow onto
 * `PaymentAdapter`'s 3-method contract (which has no separate "capture"
 * method of its own, unlike this adapter's own `PaypalHttpClient`): `GET
 * /v2/checkout/orders/{id}`, and if the shopper has already approved
 * (`status === "APPROVED"`), additionally calls `POST .../capture` right
 * here before reporting `"paid"`. This mirrors how Stripe Checkout Sessions
 * (`mode: "payment"`) auto-capture on the provider's own side at checkout
 * completion -- PayPal's Orders v2 flow splits approval and capture into two
 * real steps, so this adapter performs the second step itself rather than
 * requiring a caller to know PayPal-specific capture semantics the shared
 * interface doesn't expose.
 *
 * `handleWebhookEvent` -- verifies via PayPal's own real `POST
 * /v1/notifications/verify-webhook-signature` endpoint (webhook.ts's doc
 * comment explains why, over the alternative local CRC32+RSA scheme PayPal
 * also documents), then publishes `payments.payment.succeeded` on
 * `PAYMENT.CAPTURE.COMPLETED` and `payments.payment.failed` on
 * `PAYMENT.CAPTURE.DENIED` -- the direct capture-outcome events, mirroring
 * how the Stripe adapter only acts on `checkout.session.completed`.
 *
 * No real PayPal developer account/app exists in this environment (see
 * design-discussion.md's "Real credential gate", same disclosed pattern as
 * adapter-printful/adapter-printify/adapter-shippo) -- built and unit-tested
 * for real correctness against PayPal's actual, current, live-researched API
 * shape; not exercised against a live PayPal API here.
 */
export function createPaypalPaymentAdapter(config: PaypalPaymentAdapterConfig): PaymentAdapter {
  const client =
    config.httpClient ??
    createPaypalHttpClient({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
      ...(config.fetchImpl !== undefined ? { fetchImpl: config.fetchImpl } : {}),
    });
  const { events } = config;

  return {
    async createPaymentSession(input: CreatePaymentSessionInput): Promise<PaymentSession> {
      const currency = input.lineItems[0]?.unitAmount.currency ?? "USD";
      // Scope deliberately narrowed to one summed purchase_unit -- see
      // paypal-types.ts's research finding 5 for why this doesn't send an
      // itemized `items[]` breakdown.
      const totalMinorUnits = input.lineItems.reduce((sum, item) => sum + item.unitAmount.amount * item.quantity, 0);

      const request: PaypalCreateOrderRequest = {
        intent: "CAPTURE",
        purchase_units: [
          {
            custom_id: input.orderRef,
            amount: { currency_code: currency.toUpperCase(), value: minorUnitsToPaypalValue(totalMinorUnits, currency) },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              return_url: input.successUrl,
              cancel_url: input.cancelUrl,
            },
          },
        },
      };

      const order = await client.createOrder(request);
      return { sessionId: order.id, redirectUrl: approveLink(order) };
    },

    async confirmPayment(sessionId: string): Promise<PaymentConfirmation> {
      const order = await client.getOrder(sessionId);
      if (!order) return { status: "unpaid", orderRef: null };

      const orderRef = order.purchase_units?.[0]?.custom_id ?? null;

      if (order.status === "COMPLETED") {
        return { status: "paid", orderRef };
      }

      if (order.status === "APPROVED") {
        const captured = await client.captureOrder(sessionId);
        const capturedRef = captured.purchase_units?.[0]?.custom_id ?? orderRef;
        return { status: captured.status === "COMPLETED" ? "paid" : "unpaid", orderRef: capturedRef };
      }

      return { status: "unpaid", orderRef };
    },

    async handleWebhookEvent(rawBody: string | Buffer, signature: string): Promise<void> {
      let isValid: boolean;
      if (config.verifyWebhookSignature) {
        isValid = await config.verifyWebhookSignature(rawBody, signature);
      } else if (config.webhookId) {
        const headers = parsePaypalTransmissionHeaders(signature);
        const { raw } = parsePaypalWebhookPayload(rawBody);
        const verification = await client.verifyWebhookSignature({
          transmission_id: headers.transmissionId,
          transmission_time: headers.transmissionTime,
          cert_url: headers.certUrl,
          auth_algo: headers.authAlgo,
          transmission_sig: headers.transmissionSig,
          webhook_id: config.webhookId,
          webhook_event: raw,
        });
        isValid = verification.verification_status === "SUCCESS";
      } else {
        throw new PaypalWebhookSignatureNotConfiguredError();
      }

      if (!isValid) {
        throw new PaypalWebhookSignatureInvalidError();
      }

      const { event } = parsePaypalWebhookPayload(rawBody);
      const { sessionId, orderRef } = resolvePaypalWebhookOrderRef(event.resource);

      if (event.type === "PAYMENT.CAPTURE.COMPLETED") {
        await events.publish("payments.payment.succeeded", { sessionId, orderRef });
      } else if (event.type === "PAYMENT.CAPTURE.DENIED") {
        await events.publish("payments.payment.failed", { sessionId, orderRef });
      }

      await config.onWebhookEvent?.(event);
    },
  };
}

// Re-exported for convenience: PaypalWebhookSignatureInvalidError and
// PaypalWebhookSignatureNotConfiguredError (webhook.ts) both extend this
// shared base class -- see webhook.ts's own doc comment for why.
export { WebhookVerificationError };

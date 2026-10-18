import { WebhookVerificationError } from "@mercatus-liber/payments";
import { PAYPAL_WEBHOOK_EVENT_TYPES, type PaypalWebhookEventType, type PaypalWebhookPayload, type PaypalWebhookResource } from "./paypal-types.js";

/**
 * PayPal documents two real, independent webhook-signature-verification
 * schemes (developer.paypal.com/api/rest/webhooks/ and its linked
 * `/api/rest/webhooks/rest/` integration guide, confirmed live):
 *
 *   (a) **Local self-verification**: form the string
 *       `transmissionId|timeStamp|webhookId|crc32` (CRC32 of the raw request
 *       body, in decimal form), then verify it against the
 *       `PAYPAL-TRANSMISSION-SIG` header using the public key in the
 *       x509 certificate fetched from the `PAYPAL-CERT-URL` header
 *       (`PAYPAL-AUTH-ALGO`, confirmed `"SHA256withRSA"` in PayPal's own
 *       examples).
 *   (b) **Remote verification**: POST the same transmission metadata plus the
 *       raw webhook event body back to PayPal's own
 *       `POST /v1/notifications/verify-webhook-signature` endpoint; PayPal
 *       itself does the signature math and returns
 *       `{ verification_status: "SUCCESS" | "FAILURE" }`.
 *
 * This adapter implements (b), not (a) -- both are real and documented, not
 * a guess at either, but (b) is the one a credential-gated adapter tested
 * only against a fake HTTP server can genuinely exercise end-to-end: it is
 * itself just another authenticated call through this adapter's own
 * `PaypalHttpClient`, so the test suite's fake server can assert on the exact
 * request PayPal's docs specify and control the exact response, the same way
 * every other PayPal call in this package is tested. (a) would require this
 * adapter to fetch and parse a real x509 certificate and implement CRC32 +
 * RSA-SHA256 verification locally -- real work this story's scope didn't
 * need, since PayPal's own docs present (b) as a first-class, equally valid
 * alternative ("Post the message... back to PayPal's verify signature
 * endpoint"), not a fallback for people who can't do (a) properly.
 *
 * **Real, disclosed bridge to `PaymentAdapter.handleWebhookEvent`'s existing
 * `signature: string` parameter**: that parameter shape comes from Stripe's
 * webhook model, where a SINGLE header (`Stripe-Signature`) carries
 * everything needed. PayPal's real scheme needs FIVE distinct pieces of
 * transmission metadata (`PAYPAL-TRANSMISSION-ID`, `PAYPAL-TRANSMISSION-TIME`,
 * `PAYPAL-CERT-URL`, `PAYPAL-AUTH-ALGO`, `PAYPAL-TRANSMISSION-SIG`), not one
 * string -- a genuine interface mismatch, not something to guess around.
 * Per this epic's own design-discussion.md (no change to the shared
 * `PaymentAdapter` interface was in scope), this adapter's host application
 * bridges the gap by building `signature` as
 * `JSON.stringify({ transmissionId, transmissionTime, certUrl, authAlgo, transmissionSig })`
 * from those five real PayPal-prefixed headers before calling
 * `handleWebhookEvent` -- see `parsePaypalTransmissionHeaders` below, and
 * index.ts's own doc comment for the full call-site contract.
 */
export interface PaypalTransmissionHeaders {
  transmissionId: string;
  transmissionTime: string;
  certUrl: string;
  authAlgo: string;
  transmissionSig: string;
}

/**
 * Both of this adapter's webhook-failure errors extend the shared
 * `WebhookVerificationError` base class every `PaymentAdapter` implementation
 * is documented to use for this case (packages/payments/src/types.ts, and
 * stripe-adapter.ts's own usage) -- a caller that wants to catch "webhook
 * signature failed" uniformly across whichever provider is configured
 * (Stripe or PayPal) can catch `WebhookVerificationError` alone; a caller
 * that wants PayPal-specific detail (e.g. "not configured" vs. "genuinely
 * invalid") can catch these named subclasses instead. Printful/Printify
 * don't share this concern (`FulfillmentAdapter` defines no equivalent base
 * class), so this is specific to payment adapters.
 */
export class PaypalWebhookSignatureNotConfiguredError extends WebhookVerificationError {
  constructor() {
    super(
      "No PayPal webhook verifier configured -- refusing to process an unverified webhook payload. " +
        "Supply `webhookId` (PayPalPaymentAdapterConfig) -- the id of the webhook subscription this " +
        "listener URL was registered under -- so handleWebhookEvent can verify via PayPal's real, " +
        "documented POST /v1/notifications/verify-webhook-signature endpoint (see webhook.ts's doc " +
        "comment), or supply a custom `verifyWebhookSignature` override.",
    );
    this.name = "PaypalWebhookSignatureNotConfiguredError";
  }
}

export class PaypalWebhookSignatureInvalidError extends WebhookVerificationError {
  constructor(detail?: string) {
    super(`PayPal webhook signature verification failed -- refusing to process the payload.${detail ? ` ${detail}` : ""}`);
    this.name = "PaypalWebhookSignatureInvalidError";
  }
}

export class PaypalWebhookPayloadParseError extends Error {
  constructor(cause: unknown) {
    super(`PayPal webhook payload is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "PaypalWebhookPayloadParseError";
  }
}

/**
 * Parses the `signature` string `PaymentAdapter.handleWebhookEvent`'s second
 * parameter carries for this adapter -- the JSON-encoded
 * `PaypalTransmissionHeaders` bridge documented above. Throws
 * `PaypalWebhookSignatureInvalidError` (not a parse-specific error) because,
 * from the caller's perspective, a malformed `signature` parameter and a
 * genuinely invalid signature are the same outcome: the payload cannot be
 * trusted.
 */
export function parsePaypalTransmissionHeaders(signature: string): PaypalTransmissionHeaders {
  let parsed: unknown;
  try {
    parsed = JSON.parse(signature);
  } catch (err) {
    throw new PaypalWebhookSignatureInvalidError(
      `The signature parameter must be JSON.stringify({ transmissionId, transmissionTime, certUrl, authAlgo, transmissionSig }) built from PayPal's real PAYPAL-* headers -- it was not valid JSON (${err instanceof Error ? err.message : String(err)}).`,
    );
  }

  const headers = parsed as Partial<PaypalTransmissionHeaders>;
  const required: (keyof PaypalTransmissionHeaders)[] = ["transmissionId", "transmissionTime", "certUrl", "authAlgo", "transmissionSig"];
  const missing = required.filter((key) => typeof headers[key] !== "string");
  if (missing.length > 0) {
    throw new PaypalWebhookSignatureInvalidError(`Missing or non-string field(s) in the signature parameter: ${missing.join(", ")}.`);
  }

  return headers as PaypalTransmissionHeaders;
}

function isKnownEventType(type: string): type is PaypalWebhookEventType {
  return (PAYPAL_WEBHOOK_EVENT_TYPES as readonly string[]).includes(type);
}

/**
 * A parsed PayPal webhook: either one of the six real event types confirmed
 * in paypal-types.ts's research finding 7, or `"other"` for a real event
 * type this adapter simply doesn't act on -- never thrown for an
 * unrecognized-but-real type, only for a payload that isn't parseable JSON
 * or is missing the fields every real PayPal webhook envelope carries.
 */
export type PaypalWebhookEvent =
  | { type: PaypalWebhookEventType; id: string; resource: PaypalWebhookResource }
  | { type: "other"; rawType: string; id: string; resource: PaypalWebhookResource };

export function parsePaypalWebhookPayload(rawBody: string | Buffer): { event: PaypalWebhookEvent; raw: unknown } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString("utf-8"));
  } catch (err) {
    throw new PaypalWebhookPayloadParseError(err);
  }

  const payload = parsed as Partial<PaypalWebhookPayload>;
  if (typeof payload.event_type !== "string" || typeof payload.id !== "string") {
    throw new PaypalWebhookPayloadParseError(new Error('missing or non-string "event_type"/"id" field'));
  }
  const resource = (payload.resource ?? {}) as PaypalWebhookResource;

  const event: PaypalWebhookEvent = isKnownEventType(payload.event_type)
    ? { type: payload.event_type, id: payload.id, resource }
    : { type: "other", rawType: payload.event_type, id: payload.id, resource };

  return { event, raw: parsed };
}

/**
 * Resolves `(sessionId, orderRef)` from a webhook's `resource`, reading
 * whichever real shape is present (research finding 8, paypal-types.ts):
 * a Capture resource's own `supplementary_data.related_ids.order_id` +
 * `custom_id`, or an Order resource's own `id` + `purchase_units[0].custom_id`.
 */
export function resolvePaypalWebhookOrderRef(resource: PaypalWebhookResource): { sessionId: string | null; orderRef: string | null } {
  const sessionId = resource.supplementary_data?.related_ids?.order_id ?? resource.id ?? null;
  const orderRef = resource.custom_id ?? resource.purchase_units?.[0]?.custom_id ?? null;
  return { sessionId, orderRef };
}

import { createHmac, timingSafeEqual } from "node:crypto";
import { PRINTFUL_WEBHOOK_EVENT_TYPES, type PrintfulWebhookEventType } from "./printful-types.js";

/**
 * Thrown by `handleWebhookEvent` when neither `verifyWebhookSignature` nor
 * `webhookSecretKeyHex` was supplied (see index.ts's
 * `PrintfulFulfillmentAdapterConfig`). Kept under its original name/message
 * for compatibility with this adapter's existing real test suite and the
 * September 2026 research record (printful-types.ts's "Research finding 3"),
 * but **re-verified live 2026-10-15 (story dp-02, epic 82) and found to now be
 * documented**, correcting that record: developers.printful.com/docs/v2-beta/'s
 * real "Webhook v2" -> "Event signing" section (previously truncated/missed by
 * the September pass's automated fetch of the JS-rendered reference, not
 * actually absent from Printful's docs) now names a real, confirmed scheme --
 * see `verifyPrintfulSignature` below. This error now fires only because no
 * secret/verifier was actually configured for *this* adapter instance, the
 * same reason adapter-printify's analogous
 * `PrintifyWebhookSignatureNotConfiguredError` fires -- not because the format
 * itself is unknown. The name is left as "Unconfirmed" rather than renamed to
 * "NotConfigured" to avoid a breaking rename of a real, already-public error
 * class for what is, operationally, the same "nothing configured" case either
 * way.
 */
export class PrintfulWebhookSignatureUnconfirmedError extends Error {
  constructor() {
    super(
      "No Printful webhook verifier configured -- refusing to process an unverified webhook payload. " +
        "Printful's real v2 webhook signature scheme (re-confirmed live 2026-10-15, see webhook.ts's doc " +
        "comment) uses HMAC-SHA256 over the `x-pf-webhook-signature` header with the webhook configuration's " +
        "own secret key -- supply it as `webhookSecretKeyHex` (the hex `secret_key` POST /v2/webhooks returned " +
        "at configuration time), or supply a custom `verifyWebhookSignature`, in PrintfulFulfillmentAdapterConfig.",
    );
    this.name = "PrintfulWebhookSignatureUnconfirmedError";
  }
}

/**
 * Real Printful v2 webhook signature verification, re-confirmed live
 * 2026-10-15 against developers.printful.com/docs/v2-beta/'s own "Webhook v2"
 * -> "Event signing" section and its per-event-operation header parameters
 * (story dp-02, epic 82) -- NOT the September 2026 research pass, which
 * missed this section and called the format "genuinely unconfirmable" (see
 * `PrintfulWebhookSignatureUnconfirmedError`'s doc comment above for the
 * correction). Confirmed, quoted close to verbatim from the live docs:
 *   - the incoming webhook POST carries the signature in the real
 *     `x-pf-webhook-signature` header, as "the hexadecimal representation of
 *     the signature" (alongside a `x-pf-webhook-public-key` header identifying
 *     which webhook configuration signed it -- not used for verification
 *     itself, only to disambiguate which secret to check against when more
 *     than one configuration shares a URL);
 *   - "We're using HMAC-SHA256 hash to create the signature";
 *   - the configuration's own `secret_key` (returned once, in the `POST
 *     /v2/webhooks` response at setup time -- `GET /v2/webhooks` echoes back
 *     the `public_key` but NOT the `secret_key` again, confirmed directly) is
 *     itself returned hex-encoded and "you need to decode it before passing
 *     it to the tool or method that calculates the signature" -- i.e. the
 *     HMAC key is the DECODED raw bytes, not the hex string itself.
 * One genuine residual gap, disclosed rather than guessed at: the docs never
 * explicitly spell out which exact bytes are signed (raw request body vs.
 * some canonicalized form) -- only an oblique warning to check "whether you
 * generated it for the formatted event content instead of the raw content",
 * which this implementation reads as "sign the raw body", the same posture
 * Printify's own confirmed scheme uses (`verifyPrintifySignature`,
 * adapter-printify/src/webhook.ts) and the only reading consistent with that
 * warning's own wording. Uses a constant-time comparison for the same reason
 * Printify's verifier does.
 */
export function verifyPrintfulSignature(secretKeyHex: string, rawBody: string | Buffer, signatureHeader: string): boolean {
  const key = Buffer.from(secretKeyHex, "hex");
  const expected = createHmac("sha256", key).update(rawBody).digest("hex");

  const expectedBuf = Buffer.from(expected, "utf-8");
  const actualBuf = Buffer.from(signatureHeader, "utf-8");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

export class PrintfulWebhookSignatureInvalidError extends Error {
  constructor() {
    super("Printful webhook signature verification failed -- refusing to process the payload.");
    this.name = "PrintfulWebhookSignatureInvalidError";
  }
}

export class PrintfulWebhookPayloadParseError extends Error {
  constructor(cause: unknown) {
    super(`Printful webhook payload is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "PrintfulWebhookPayloadParseError";
  }
}

/**
 * The well-established `{ type, created, retries, store, data }` envelope
 * Printful's own docs and every third-party integration guide checked during
 * this story's research describe consistently for both v1 and v2 webhook
 * deliveries -- `type` is the event-type discriminator (the real, confirmed v2
 * event-type strings are `PRINTFUL_WEBHOOK_EVENT_TYPES`, printful-types.ts).
 * Only `type` and `data` are read by this adapter; `created`/`retries`/`store`
 * are accepted but unused.
 */
export interface PrintfulWebhookPayload {
  type: string;
  data: unknown;
}

/**
 * A parsed Printful webhook: either one of the four real event types this
 * story's description names (`order_created`/`order_updated`/`shipment_sent`/
 * `shipment_delivered`), or `"other"` for a real event type this adapter simply
 * doesn't act on yet (see printful-types.ts) -- never thrown for an unrecognized
 * *known-real* type, only for a payload that isn't parseable JSON at all.
 */
export type PrintfulWebhookEvent = { type: PrintfulWebhookEventType; data: unknown } | { type: "other"; rawType: string; data: unknown };

function isKnownEventType(type: string): type is PrintfulWebhookEventType {
  return (PRINTFUL_WEBHOOK_EVENT_TYPES as readonly string[]).includes(type);
}

export function parsePrintfulWebhookPayload(rawBody: string | Buffer): PrintfulWebhookEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString("utf-8"));
  } catch (err) {
    throw new PrintfulWebhookPayloadParseError(err);
  }

  const payload = parsed as Partial<PrintfulWebhookPayload>;
  if (typeof payload.type !== "string") {
    throw new PrintfulWebhookPayloadParseError(new Error('missing or non-string "type" field'));
  }

  if (isKnownEventType(payload.type)) {
    return { type: payload.type, data: payload.data };
  }
  return { type: "other", rawType: payload.type, data: payload.data };
}

import { createHmac, timingSafeEqual } from "node:crypto";
import type { ProviderOrderStatusUpdate } from "@mercatus-liber/fulfillment";
import { orderIdFromPrintfulExternalId } from "./mapping.js";
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

/**
 * The signature string `handleWebhookEvent` expects, read from a request's
 * headers: the value of `x-pf-webhook-signature` (see verifyPrintfulSignature).
 * Header names are matched without regard to case. A missing header gives an
 * empty string, which fails verification.
 */
export function printfulWebhookSignatureFrom(headers: Headers | Record<string, string | string[] | undefined>): string {
  if (typeof (headers as Headers).get === "function") return (headers as Headers).get("x-pf-webhook-signature") ?? "";
  const entry = Object.entries(headers as Record<string, string | string[] | undefined>).find(([key]) => key.toLowerCase() === "x-pf-webhook-signature");
  const value = entry?.[1];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const textOrNull = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" ? String(value) : null);

/**
 * What a webhook says about an order's fulfillment, for
 * @mercatus-liber/fulfillment's createProviderOrderStatusRecorder, or null when
 * it says nothing in line-status terms or names no Printful order.
 *
 * Both of Printful's webhook generations are read, because for this purpose
 * they differ only in the event name and in what the shipment carries:
 *
 * - `shipment_sent` (v2) and `package_shipped` (v1) give "shipped", with
 *   `data.shipment.tracking_number`. The v1 shipment also has a `carrier`; the
 *   v2 webhook shipment documents none, so the carrier is null there.
 * - `shipment_delivered` (v2) gives "delivered".
 * - `order_failed` and `order_canceled` (same name in both) give "unfulfilled".
 * - `shipment_returned` (v2) and `package_returned` (v1) give "shipped". There
 *   is no "returned" line status, and the parcel did ship. For an order already
 *   recorded as shipped with the same tracking number the recorder sees no
 *   change and publishes nothing, so a return does not send a second "shipped"
 *   notice. A store that wants to act on returns reads the raw event instead.
 * - `order_created`, `order_updated` and everything else give null. An order's
 *   own status says less than the shipment events do ("partial" covers an order
 *   with one of two parcels sent), and mapping it could move a shipped order
 *   back.
 *
 * `externalOrderId` is Printful's order id (`data.order.id`). `orderId` is the
 * order's `external_id`, which is the store's order id when the order was
 * placed by this adapter; an order made in Printful's dashboard has none.
 *
 * An order sent in two parcels produces two "shipped" updates with different
 * tracking numbers, and each is published.
 *
 * `handleWebhookEvent`'s default verifier checks the v2 signature header. The
 * v1 docs describe no signature, so a v1 delivery only gets this far through a
 * custom `verifyWebhookSignature`.
 *
 * The field names are from Printful's published docs (see
 * test/webhook-fixtures.ts). No payload has been captured from a live Printful
 * account by this repo.
 */
export function printfulOrderStatusUpdateFrom(event: PrintfulWebhookEvent): ProviderOrderStatusUpdate | null {
  const data = isObject(event.data) ? event.data : {};
  const order = isObject(data.order) ? data.order : null;
  const externalOrderId = textOrNull(order?.id);
  if (!externalOrderId) return null;
  const shipment = isObject(data.shipment) ? data.shipment : {};
  // A UUID order id was sent without its dashes (Printful caps external_id at 32 characters); put them back.
  const rawExternalId = textOrNull(order?.external_id);
  const storeOrderId = rawExternalId ? orderIdFromPrintfulExternalId(rawExternalId) : null;

  const update = (status: ProviderOrderStatusUpdate["status"], withTracking: boolean): ProviderOrderStatusUpdate => ({
    externalOrderId,
    orderId: storeOrderId,
    status,
    trackingNumber: withTracking ? textOrNull(shipment.tracking_number) : null,
    carrier: withTracking ? textOrNull(shipment.carrier) : null,
  });

  switch (event.type === "other" ? event.rawType : event.type) {
    case "shipment_sent":
    case "package_shipped":
    case "shipment_returned":
    case "package_returned":
      return update("shipped", true);
    case "shipment_delivered":
      return update("delivered", true);
    case "order_failed":
    case "order_canceled":
      return update("unfulfilled", false);
    default:
      return null;
  }
}

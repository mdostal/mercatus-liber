import { createHmac, timingSafeEqual } from "node:crypto";
import { PRINTIFY_WEBHOOK_EVENT_TYPES, type PrintifyWebhookEventType, type PrintifyWebhookPayload } from "./printify-types.js";

/**
 * Thrown by `handleWebhookEvent` when neither a `webhookSecret` nor a custom
 * `verifyWebhookSignature` was supplied (see index.ts's
 * `PrintifyFulfillmentAdapterConfig`). Unlike adapter-printful's analogous
 * "unconfirmed format" error, Printify's real HMAC-SHA256 `X-Pfy-Signature`
 * scheme IS genuinely confirmed (see printify-types.ts's top comment,
 * "Research finding 4") and implemented below as `verifyPrintifySignature` --
 * this error fires only because no secret/verifier was actually configured for
 * THIS adapter instance, not because the scheme itself is unknown. Same
 * fail-closed discipline as adapter-printful (never silently trust an
 * unverified payload), for a different, more fixable reason.
 */
export class PrintifyWebhookSignatureNotConfiguredError extends Error {
  constructor() {
    super(
      "No Printify webhook verifier configured -- refusing to process an unverified webhook payload. " +
        "Supply `webhookSecret` (the same secret set on the webhook subscription via `POST " +
        "/v1/shops/{shop_id}/webhooks.json`'s real `secret` field) or a custom `verifyWebhookSignature` " +
        "in PrintifyFulfillmentAdapterConfig.",
    );
    this.name = "PrintifyWebhookSignatureNotConfiguredError";
  }
}

export class PrintifyWebhookSignatureInvalidError extends Error {
  constructor() {
    super("Printify webhook signature verification failed (X-Pfy-Signature mismatch) -- refusing to process the payload.");
    this.name = "PrintifyWebhookSignatureInvalidError";
  }
}

export class PrintifyWebhookPayloadParseError extends Error {
  constructor(cause: unknown) {
    super(`Printify webhook payload is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "PrintifyWebhookPayloadParseError";
  }
}

/**
 * Real, confirmed Printify webhook signature verification (printify-types.ts's
 * "Research finding 4", quoted verbatim from developers.printify.com's own
 * "Securing your Webhooks" section): the header is `X-Pfy-Signature`, its
 * value is `sha256={hexdigest}`, and the digest is an HMAC-SHA256 hex digest
 * of the RAW request body computed with the webhook subscription's own
 * `secret`. Uses a constant-time comparison per the docs' own explicit
 * recommendation ("Always use 'constant time' string comparisons").
 */
export function verifyPrintifySignature(secret: string, rawBody: string | Buffer, signatureHeader: string): boolean {
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;

  const expectedBuf = Buffer.from(expected, "utf-8");
  const actualBuf = Buffer.from(signatureHeader, "utf-8");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * A parsed Printify webhook: either one of the five real order-event types
 * this story's description names (`order:created`/`order:updated`/
 * `order:sent-to-production`/`order:shipment:created`/
 * `order:shipment:delivered`), or `"other"` for a real event type this
 * adapter simply doesn't act on yet (`shop:disconnected`, `product:*`,
 * `personalization-preview-task:processed`) -- never thrown for an
 * unrecognized *known-real* type, only for a payload that isn't parseable
 * JSON or is missing the confirmed envelope's required fields.
 */
export type PrintifyWebhookEvent =
  | { type: PrintifyWebhookEventType; id: string; resourceId: string; data: unknown }
  | { type: "other"; rawType: string; id: string; resourceId: string; data: unknown };

function isKnownEventType(type: string): type is PrintifyWebhookEventType {
  return (PRINTIFY_WEBHOOK_EVENT_TYPES as readonly string[]).includes(type);
}

/**
 * Parses the real, confirmed webhook envelope (printify-types.ts's
 * `PrintifyWebhookPayload`): `{ id, type, created_at, resource: { id, type,
 * data } }` -- genuinely different from Printful's `{ type, data }` shape
 * (disclosed in printify-types.ts's top comment).
 */
export function parsePrintifyWebhookPayload(rawBody: string | Buffer): PrintifyWebhookEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString("utf-8"));
  } catch (err) {
    throw new PrintifyWebhookPayloadParseError(err);
  }

  const payload = parsed as Partial<PrintifyWebhookPayload>;
  if (typeof payload.type !== "string" || typeof payload.id !== "string" || typeof payload.resource !== "object" || payload.resource === null) {
    throw new PrintifyWebhookPayloadParseError(new Error('missing or malformed "type"/"id"/"resource" field'));
  }

  const resourceId = (payload.resource as { id?: unknown }).id;
  const data = (payload.resource as { data?: unknown }).data;

  if (isKnownEventType(payload.type)) {
    return { type: payload.type, id: payload.id, resourceId: typeof resourceId === "string" ? resourceId : String(resourceId ?? ""), data };
  }
  return { type: "other", rawType: payload.type, id: payload.id, resourceId: typeof resourceId === "string" ? resourceId : String(resourceId ?? ""), data };
}

import { PRINTFUL_WEBHOOK_EVENT_TYPES, type PrintfulWebhookEventType } from "./printful-types.js";

/**
 * Thrown by `handleWebhookEvent` when no `verifyWebhookSignature` was supplied
 * (see index.ts's `PrintfulFulfillmentAdapterConfig`) -- this adapter's honest
 * disclosure of research finding 3 (printful-types.ts's top doc comment):
 * Printful's real v2 webhook signature/HMAC verification mechanism is genuinely
 * unconfirmable from public docs (the OpenAPI-generated webhook models are empty
 * stubs, the docs name "request signing" as a feature without ever documenting
 * the header/algorithm, and no third-party client checked implements it either).
 * `FulfillmentAdapter.handleWebhookEvent`'s contract requires implementations to
 * "verify the signature before trusting the payload" -- since this adapter
 * cannot implement a scheme Printful hasn't published, it fails closed instead
 * of silently skipping verification or guessing at one. Once Printful discloses
 * the real mechanism (e.g. in per-account docs surfaced only after signup, which
 * this environment has no credential to see), a caller supplies it via
 * `verifyWebhookSignature` and this error stops firing -- no code change needed
 * here.
 */
export class PrintfulWebhookSignatureUnconfirmedError extends Error {
  constructor() {
    super(
      "Printful's v2 webhook signature/HMAC verification format is not confirmable from public docs " +
        "(see printful-types.ts's research note) -- refusing to process an unverified webhook payload. " +
        "Supply `verifyWebhookSignature` in PrintfulFulfillmentAdapterConfig once the real mechanism is " +
        "confirmed against a live Printful account.",
    );
    this.name = "PrintfulWebhookSignatureUnconfirmedError";
  }
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

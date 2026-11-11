import { createHmac, timingSafeEqual } from "node:crypto";
import { SLANT3D_WEBHOOK_EVENT_TYPES, type Slant3dWebhookEventType } from "./slant3d-types.js";

/** How old a webhook's timestamp may be. Slant's verification example rejects anything older than 5 minutes. */
export const DEFAULT_SLANT3D_WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;

export class Slant3dWebhookSignatureNotConfiguredError extends Error {
  constructor() {
    super("No Slant 3D webhook verifier is configured, so the webhook was refused. Set `webhookSecret` to the platform's webhook secret, or supply `verifyWebhookSignature`.");
    this.name = "Slant3dWebhookSignatureNotConfiguredError";
  }
}

export class Slant3dWebhookSignatureInvalidError extends Error {
  constructor() {
    super("Slant 3D webhook verification failed: the signature doesn't match or the timestamp is too old. The payload was not processed.");
    this.name = "Slant3dWebhookSignatureInvalidError";
  }
}

export class Slant3dWebhookPayloadParseError extends Error {
  constructor(cause: unknown) {
    super(`Slant 3D webhook payload could not be read: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "Slant3dWebhookPayloadParseError";
  }
}

/**
 * Slant signs with two headers, but `FulfillmentAdapter.handleWebhookEvent`
 * takes one signature string. This joins them into the string this adapter
 * expects: `<X-Webhook-Timestamp>,<X-Webhook-Signature-256>`, for example
 * `1698876543000,sha256=a1b2...`. Header names are matched without regard to
 * case. A missing header becomes an empty part, which fails verification.
 */
export function slant3dWebhookSignatureFrom(headers: Headers | Record<string, string | string[] | undefined>): string {
  const get = (name: string): string => {
    if (typeof (headers as Headers).get === "function") return (headers as Headers).get(name) ?? "";
    const entry = Object.entries(headers as Record<string, string | string[] | undefined>).find(([key]) => key.toLowerCase() === name);
    const value = entry?.[1];
    return (Array.isArray(value) ? value[0] : value) ?? "";
  };
  return `${get("x-webhook-timestamp")},${get("x-webhook-signature-256")}`;
}

/**
 * Verifies a Slant webhook, following the "Webhook Signature Verification"
 * section of Slant's docs and its `verifyWebhookSignature` example:
 *
 * - `X-Webhook-Timestamp` is when the webhook was sent, in Unix milliseconds.
 * - `X-Webhook-Signature-256` is `sha256=` followed by the hex HMAC-SHA256 of
 *   `<timestamp>.<raw request body>`, keyed with the platform's webhook secret
 *   used as plain text.
 * - A webhook whose timestamp is 5 minutes old or more is rejected.
 *
 * The signature is compared in constant time, and the freshness check runs
 * whether or not the signature matched. Two things Slant's sources don't say:
 * whether a resent stored webhook gets a new timestamp (if it doesn't, a resend
 * older than `toleranceMs` is refused here), and what to do with a timestamp
 * from the future (refused here when it is more than `toleranceMs` ahead).
 */
export function verifySlant3dSignature(secret: string, rawBody: string | Buffer, timestamp: string, signatureHeader: string, options: { nowMs?: number; toleranceMs?: number } = {}): boolean {
  const expected = createHmac("sha256", secret).update(`${timestamp}.`, "utf8").update(rawBody).digest();

  const hex = signatureHeader.trim().replace(/^sha256=/, "");
  const wellFormed = /^[0-9a-f]{64}$/i.test(hex);
  // A malformed signature is still compared, against bytes that can't match, so both paths do the same work.
  const supplied = wellFormed ? Buffer.from(hex, "hex") : Buffer.alloc(expected.length);
  const matches = timingSafeEqual(expected, supplied) && wellFormed;

  const tolerance = options.toleranceMs ?? DEFAULT_SLANT3D_WEBHOOK_TOLERANCE_MS;
  const sentAt = /^\d+$/.test(timestamp.trim()) ? Number(timestamp.trim()) : Number.NaN;
  const age = (options.nowMs ?? Date.now()) - sentAt;
  const fresh = Number.isFinite(age) && age < tolerance && age > -tolerance;

  return matches && fresh;
}

/** Splits the combined string from slant3dWebhookSignatureFrom and verifies it. */
export function verifySlant3dWebhook(secret: string, rawBody: string | Buffer, combinedSignature: string, options: { nowMs?: number; toleranceMs?: number } = {}): boolean {
  const comma = combinedSignature.indexOf(",");
  const timestamp = comma < 0 ? "" : combinedSignature.slice(0, comma);
  const signature = comma < 0 ? combinedSignature : combinedSignature.slice(comma + 1);
  return verifySlant3dSignature(secret, rawBody, timestamp, signature, options);
}

/** `data.order` on order events, as shown in the docs' sample and the spec's example. */
export interface Slant3dWebhookOrder {
  publicId: string;
  status: string | null;
  trackingNumber: string | null;
  shipmentStatus: string | null;
}

interface Slant3dWebhookEventBase {
  /** The platform the webhook was sent for. */
  platformId: string | null;
  /** The payload's own timestamp (Unix milliseconds as a string), if present. */
  timestamp: string | null;
  /** True for the test webhook sent by POST /platforms/{id}/webhook/dummy, which should be ignored. */
  dummy: boolean;
  /** Set on events that carry `data.order` with a public id. */
  order: Slant3dWebhookOrder | null;
  data: unknown;
}

/** A parsed webhook: one of Slant's listed event types, or "other" for a type this package doesn't know. */
export type Slant3dWebhookEvent = (Slant3dWebhookEventBase & { type: Slant3dWebhookEventType }) | (Slant3dWebhookEventBase & { type: "other"; rawType: string });

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const stringOrNull = (value: unknown): string | null => (typeof value === "string" ? value : null);

export function parseSlant3dWebhookPayload(rawBody: string | Buffer): Slant3dWebhookEvent {
  let payload: unknown;
  try {
    payload = JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString("utf-8"));
  } catch (err) {
    throw new Slant3dWebhookPayloadParseError(err);
  }
  if (!isObject(payload) || typeof payload.event_type !== "string") throw new Slant3dWebhookPayloadParseError(new Error('missing or non-string "event_type" field'));

  const data = payload.data;
  const rawOrder = isObject(data) && isObject(data.order) ? data.order : null;
  const order: Slant3dWebhookOrder | null =
    rawOrder && typeof rawOrder.public_id === "string"
      ? { publicId: rawOrder.public_id, status: stringOrNull(rawOrder.status), trackingNumber: stringOrNull(rawOrder.tracking_number), shipmentStatus: stringOrNull(rawOrder.shipment_status) }
      : null;
  // Slant says the test payload "carries dummy: true" without saying where, so every plausible level is checked.
  const dummy = payload.dummy === true || (isObject(data) && data.dummy === true) || rawOrder?.dummy === true;

  const base: Slant3dWebhookEventBase = { platformId: stringOrNull(payload.platform_id), timestamp: stringOrNull(payload.timestamp), dummy, order, data };
  const type = payload.event_type;
  if ((SLANT3D_WEBHOOK_EVENT_TYPES as readonly string[]).includes(type)) return { ...base, type: type as Slant3dWebhookEventType };
  return { ...base, type: "other", rawType: type };
}

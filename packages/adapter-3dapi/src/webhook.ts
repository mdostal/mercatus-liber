import { createHmac, timingSafeEqual } from "node:crypto";
import type { FulfillmentLineStatus } from "@mercatus-liber/fulfillment";
import { DAPI_ORDER_STATUSES, DAPI_WEBHOOK_EVENT_TYPES, type DapiOrderStatus, type DapiWebhookEventType, type DapiWebhookPayload } from "./dapi-types.js";
import { mapDapiOrderStatus } from "./mapping.js";

/**
 * 3DAPI signs a delivery with three headers:
 *
 *   X-Dapi-Webhook-Signature: sha256=<hex>   HMAC-SHA256 of "<timestamp>.<raw body>", keyed with the endpoint secret (whsec_...)
 *   X-Dapi-Webhook-Timestamp: <unix seconds> reject if more than 5 minutes from your clock
 *   X-Dapi-Event-Id: evt_...                 the event id, also the `id` of the body
 *
 * FulfillmentAdapter.handleWebhookEvent takes one `signature` string, and the
 * signature cannot be checked without the timestamp. So this adapter takes both
 * in one string, `t=<timestamp>,v1=<signature header>`, which
 * `dapiWebhookSignatureFromHeaders` builds from a request's headers. The
 * combined format is this package's own, not 3DAPI's.
 */
export const DAPI_SIGNATURE_HEADER = "x-dapi-webhook-signature";
export const DAPI_TIMESTAMP_HEADER = "x-dapi-webhook-timestamp";
export const DAPI_EVENT_ID_HEADER = "x-dapi-event-id";

/** 3DAPI's documented limit: reject a timestamp more than 5 minutes from your clock. */
export const DAPI_WEBHOOK_TOLERANCE_SECONDS = 300;

type HeaderBag = { get(name: string): string | null } | Record<string, string | string[] | undefined>;

function readHeader(headers: HeaderBag, name: string): string {
  if (typeof (headers as { get?: unknown }).get === "function") return (headers as { get(name: string): string | null }).get(name) ?? "";
  for (const [key, value] of Object.entries(headers as Record<string, string | string[] | undefined>)) {
    if (key.toLowerCase() === name) return (Array.isArray(value) ? value[0] : value) ?? "";
  }
  return "";
}

/**
 * Builds the `signature` argument for `handleWebhookEvent` from a delivery's
 * headers (a fetch `Headers` object or a Node header record). Missing headers
 * give a string that fails verification.
 */
export function dapiWebhookSignatureFromHeaders(headers: HeaderBag): string {
  return `t=${readHeader(headers, DAPI_TIMESTAMP_HEADER)},v1=${readHeader(headers, DAPI_SIGNATURE_HEADER)}`;
}

/** Splits `t=<timestamp>,v1=<signature>` back into its parts. null when it is not that shape. */
export function parseDapiWebhookSignature(combined: string): { timestamp: string; signature: string } | null {
  const match = /^t=([^,]*),v1=(.*)$/.exec(combined.trim());
  if (!match) return null;
  return { timestamp: match[1]!, signature: match[2]! };
}

export type DapiSignatureCheck = "ok" | "bad_signature" | "stale_timestamp";

/**
 * Verifies a delivery as 3DAPI's "Verify signatures" guide describes: the
 * HMAC-SHA256 of `<timestamp>.<raw body>` with the endpoint secret, hex
 * encoded and prefixed `sha256=`, compared in constant time, and a timestamp
 * within `toleranceSeconds` of `nowMs`. The secret is used as the string 3DAPI
 * shows it (`whsec_...`), as in the guide's own example.
 *
 * The signature is checked first, so "stale_timestamp" is only ever reported
 * for a delivery that 3DAPI really signed.
 */
export function verifyDapiSignature(
  secret: string,
  rawBody: string | Buffer,
  parts: { timestamp: string; signature: string },
  options: { nowMs?: number; toleranceSeconds?: number } = {},
): DapiSignatureCheck {
  if (!/^\d+$/.test(parts.timestamp)) return "bad_signature";
  const expected = `sha256=${createHmac("sha256", secret).update(`${parts.timestamp}.`).update(rawBody).digest("hex")}`;
  const expectedBuf = Buffer.from(expected, "utf-8");
  const actualBuf = Buffer.from(parts.signature, "utf-8");
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) return "bad_signature";

  const ageSeconds = Math.abs((options.nowMs ?? Date.now()) / 1000 - Number(parts.timestamp));
  return ageSeconds > (options.toleranceSeconds ?? DAPI_WEBHOOK_TOLERANCE_SECONDS) ? "stale_timestamp" : "ok";
}

/** Thrown when neither `webhookSecret` nor `verifyWebhookSignature` is configured. Nothing unverified is processed. */
export class DapiWebhookSignatureNotConfiguredError extends Error {
  constructor() {
    super("No 3DAPI webhook secret configured, so the delivery was not processed. Set `webhookSecret` to the endpoint's whsec_... secret, or supply `verifyWebhookSignature`.");
    this.name = "DapiWebhookSignatureNotConfiguredError";
  }
}

export class DapiWebhookSignatureInvalidError extends Error {
  constructor() {
    super("3DAPI webhook signature verification failed, so the delivery was not processed. Pass handleWebhookEvent the string from dapiWebhookSignatureFromHeaders(headers).");
    this.name = "DapiWebhookSignatureInvalidError";
  }
}

/** Thrown for a correctly signed delivery whose timestamp is too far from this server's clock. */
export class DapiWebhookTimestampError extends Error {
  constructor() {
    super("3DAPI webhook timestamp is more than the allowed time from this server's clock, so the delivery was not processed.");
    this.name = "DapiWebhookTimestampError";
  }
}

export class DapiWebhookPayloadParseError extends Error {
  constructor(cause: unknown) {
    super(`3DAPI webhook payload could not be read: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "DapiWebhookPayloadParseError";
  }
}

/** What an order event says about the order, read from `data.object`. */
export interface DapiWebhookOrderSummary {
  /** 3DAPI's order id (`ord_...`). */
  externalOrderId: string;
  /** The `reference` the order was created with: the Mercatus order id, or its `ml-` hash (see dapiReferenceForOrder). */
  reference: string | null;
  dapiStatus: DapiOrderStatus;
  status: FulfillmentLineStatus;
  /** A plain carrier name such as "DHL". 3DAPI gives no tracking URL. */
  carrier: string | null;
  trackingNumber: string | null;
  shippedAt: string | null;
}

/**
 * A verified delivery. `type` is one of the event types an integrator endpoint
 * can subscribe to, or "other" with the original in `rawType`. `order` is set
 * when `data.object` is an order. `data` is the event's `data` as sent.
 */
export type DapiWebhookEvent =
  | { type: DapiWebhookEventType; id: string; createdAt: string; order: DapiWebhookOrderSummary | null; data: DapiWebhookPayload["data"] }
  | { type: "other"; rawType: string; id: string; createdAt: string; order: DapiWebhookOrderSummary | null; data: DapiWebhookPayload["data"] };

function summarizeOrder(object: unknown): DapiWebhookOrderSummary | null {
  if (typeof object !== "object" || object === null) return null;
  const order = object as { object?: unknown; id?: unknown; status?: unknown; reference?: unknown; shipping?: { carrier?: unknown; tracking_number?: unknown; shipped_at?: unknown } | null };
  if (order.object !== "order" || typeof order.id !== "string") return null;
  if (typeof order.status !== "string" || !(DAPI_ORDER_STATUSES as readonly string[]).includes(order.status)) return null;
  const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
  const dapiStatus = order.status as DapiOrderStatus;
  return {
    externalOrderId: order.id,
    reference: text(order.reference),
    dapiStatus,
    status: mapDapiOrderStatus(dapiStatus),
    carrier: text(order.shipping?.carrier),
    trackingNumber: text(order.shipping?.tracking_number),
    shippedAt: text(order.shipping?.shipped_at),
  };
}

/** Parses a delivery body: `{ id, object: "event", type, created_at, data: { object, previous, region } }`. */
export function parseDapiWebhookPayload(rawBody: string | Buffer): DapiWebhookEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString("utf-8"));
  } catch (err) {
    throw new DapiWebhookPayloadParseError(err);
  }
  const payload = parsed as Partial<DapiWebhookPayload> | null;
  if (typeof payload !== "object" || payload === null || typeof payload.id !== "string" || typeof payload.type !== "string" || typeof payload.data !== "object" || payload.data === null) {
    throw new DapiWebhookPayloadParseError(new Error('missing or malformed "id", "type" or "data"'));
  }
  const base = { id: payload.id, createdAt: typeof payload.created_at === "string" ? payload.created_at : "", order: summarizeOrder(payload.data.object), data: payload.data };
  if ((DAPI_WEBHOOK_EVENT_TYPES as readonly string[]).includes(payload.type)) return { type: payload.type as DapiWebhookEventType, ...base };
  return { type: "other", rawType: payload.type, ...base };
}

/**
 * Remembers which event ids were handled, so a delivery 3DAPI retries is not
 * handled twice. 3DAPI retries a failed delivery for 24 hours.
 */
export interface DapiWebhookEventStore {
  has(eventId: string): boolean | Promise<boolean>;
  add(eventId: string): void | Promise<void>;
}

/**
 * Keeps the most recent `limit` event ids in this process. It forgets on
 * restart and is not shared between instances; use a database-backed store
 * where that matters.
 */
export function createInMemoryDapiWebhookEventStore(limit = 5000): DapiWebhookEventStore {
  const seen = new Set<string>();
  return {
    has: (eventId) => seen.has(eventId),
    add(eventId) {
      seen.add(eventId);
      if (seen.size > limit) seen.delete(seen.values().next().value as string);
    },
  };
}

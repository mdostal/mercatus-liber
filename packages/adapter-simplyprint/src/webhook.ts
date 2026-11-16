import { createHash, timingSafeEqual } from "node:crypto";
import type { ProviderOrderStatusUpdate } from "@mercatus-liber/fulfillment";
import { simplyPrintStatusUpdateFrom } from "./mapping.js";
import { SIMPLYPRINT_JOB_EVENTS, SIMPLYPRINT_QUEUE_ITEM_DELETED_EVENT, SIMPLYPRINT_QUEUE_ITEM_DENIED_EVENT, type SimplyPrintWebhookEvent } from "./simplyprint-types.js";

/** Thrown by handleWebhookEvent when no `webhookSecret` is configured. Without one a delivery cannot be told from a forgery, so none is accepted. */
export class SimplyPrintWebhookSecretNotConfiguredError extends Error {
  constructor() {
    super("SimplyPrint webhooks are refused: no webhookSecret is configured. Set the same secret on the webhook in SimplyPrint and in this adapter.");
    this.name = "SimplyPrintWebhookSecretNotConfiguredError";
  }
}

/** Thrown when a delivery's X-SP-Secret header is absent or is not the configured secret. */
export class SimplyPrintWebhookSecretInvalidError extends Error {
  constructor() {
    super("SimplyPrint webhook refused: the X-SP-Secret header does not match the configured secret.");
    this.name = "SimplyPrintWebhookSecretInvalidError";
  }
}

/** Thrown when a delivery with the right secret has a body that is not SimplyPrint's documented envelope. */
export class SimplyPrintWebhookPayloadParseError extends Error {
  constructor(detail: string) {
    super(`SimplyPrint webhook body could not be read: ${detail}`);
    this.name = "SimplyPrintWebhookPayloadParseError";
  }
}

/**
 * True when `received` (the X-SP-Secret header of a delivery) is `expected`.
 *
 * SimplyPrint does not sign deliveries. It sends the secret itself in a
 * header, the same value every time, so this proves only that the sender
 * knows the secret: it does not tie the secret to the body, and a captured
 * delivery can be replayed. Serve the endpoint over HTTPS only. Both values
 * are hashed first so the comparison takes the same time whatever their
 * lengths.
 */
export function simplyPrintWebhookSecretMatches(received: string | null | undefined, expected: string): boolean {
  if (!expected || !received) return false;
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(received), digest(expected));
}

/** Reads SimplyPrint's webhook envelope: `webhook_id`, `event`, `timestamp`, `data`. Does no authentication. */
export function parseSimplyPrintWebhookEvent(rawBody: string | Buffer): SimplyPrintWebhookEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString("utf8"));
  } catch {
    throw new SimplyPrintWebhookPayloadParseError("not JSON");
  }
  if (typeof parsed !== "object" || parsed === null) throw new SimplyPrintWebhookPayloadParseError("not an object");
  const record = parsed as Record<string, unknown>;
  if (typeof record.event !== "string" || !record.event) throw new SimplyPrintWebhookPayloadParseError("no `event`");
  const data = typeof record.data === "object" && record.data !== null ? (record.data as Record<string, unknown>) : {};
  return { webhook_id: typeof record.webhook_id === "number" ? record.webhook_id : 0, event: record.event, timestamp: typeof record.timestamp === "number" ? record.timestamp : 0, data };
}

/**
 * What a store should do about one delivery.
 *
 * - "queue_item_closed": the item is out of the queue for good. `printState`
 *   is "cancelled" for `queue.delete_item` ("A queue item was removed before
 *   printing") and "denied" for `queue.item_denied`.
 * - "resync": something about a print job changed. SimplyPrint's documented
 *   job payloads (`job.started`, `job.done`, `job.failed`, ...) do not carry
 *   the id of the queue item the job came from, so the event cannot be pinned
 *   to an order line. Run the status poller now instead of waiting for its
 *   next turn.
 * - "ignored": an event this package has no use for.
 */
export type SimplyPrintWebhookAction = { kind: "queue_item_closed"; queueItemId: string; printState: "cancelled" | "denied" } | { kind: "resync" } | { kind: "ignored" };

export function simplyPrintWebhookActionFrom(event: SimplyPrintWebhookEvent): SimplyPrintWebhookAction {
  if (event.event === SIMPLYPRINT_QUEUE_ITEM_DELETED_EVENT || event.event === SIMPLYPRINT_QUEUE_ITEM_DENIED_EVENT) {
    const queueItem = event.data.queue_item;
    const id = typeof queueItem === "object" && queueItem !== null ? (queueItem as { id?: unknown }).id : undefined;
    // Without the id there is nothing to close; the poller will find out.
    if (typeof id !== "number") return { kind: "resync" };
    return { kind: "queue_item_closed", queueItemId: String(id), printState: event.event === SIMPLYPRINT_QUEUE_ITEM_DENIED_EVENT ? "denied" : "cancelled" };
  }
  if ((SIMPLYPRINT_JOB_EVENTS as readonly string[]).includes(event.event)) return { kind: "resync" };
  return { kind: "ignored" };
}

/** The status update a "queue_item_closed" action stands for, for createProviderOrderStatusRecorder. null for the other actions. */
export function simplyPrintStatusUpdateFromWebhookAction(action: SimplyPrintWebhookAction): ProviderOrderStatusUpdate | null {
  return action.kind === "queue_item_closed" ? simplyPrintStatusUpdateFrom(action.queueItemId, action.printState) : null;
}

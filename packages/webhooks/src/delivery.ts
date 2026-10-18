import { randomUUID } from "node:crypto";
import type { EventBus } from "@mercatus-liber/core";
import { signWebhookPayload, WEBHOOK_DELIVERY_ID_HEADER, WEBHOOK_EVENT_TYPE_HEADER, WEBHOOK_SIGNATURE_HEADER } from "./signer.js";
import { KNOWN_EVENT_TYPES } from "./types.js";
import type { WebhookDeliveryLogStore, WebhookSubscription, WebhookSubscriptionStore } from "./types.js";

/** 1 initial attempt + 3 retries. A fixed bound, never infinite -- see this epic's design-discussion.md §4 for why an unbounded retry queue is explicitly out of scope for this reference implementation. */
export const DEFAULT_MAX_ATTEMPTS = 4;

/** Exponential backoff with no jitter: 250ms, 500ms, 1000ms between attempts 1->2, 2->3, 3->4. Deliberately simple -- a production deployment fronting many subscriptions would want jitter to avoid a thundering-herd retry wave, disclosed as a real, un-implemented refinement in the README rather than silently assumed away. */
export function defaultBackoffMs(attemptNumber: number): number {
  return 250 * 2 ** (attemptNumber - 1);
}

/** Real setTimeout-backed delay -- the production default for `sleepImpl`. Tests inject a near-instant fake (see test/delivery.test.ts) so a 3-retry sequence doesn't make the suite slow; the retry COUNT and backoff CALCULATION are asserted independently of how long the test actually waits. */
function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface WebhookDeliveryServiceConfig {
  events: EventBus;
  subscriptions: WebhookSubscriptionStore;
  deliveryLog: WebhookDeliveryLogStore;
  /** Which real event names to listen for on `events`. Defaults to KNOWN_EVENT_TYPES -- widen this if the host app publishes real events beyond what this package ships knowing about (see types.ts's KNOWN_EVENT_TYPES doc comment for why the bus has no wildcard subscribe to lean on instead). */
  eventTypes?: readonly string[];
  maxAttempts?: number;
  backoffMs?: (attemptNumber: number) => number;
  /** Injectable for tests -- defaults to the real global `fetch` (Node 22+, this repo's engines.node floor, ships it natively). */
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  now?: () => string;
}

export interface WebhookDeliveryService {
  /** Delivers one event to one subscription right now, with the same retry/backoff/logging behavior the bus-triggered path uses -- exposed directly so a caller can manually redeliver a webhook (e.g. from an admin "retry" button) without re-publishing the original event on the bus. */
  deliverNow(subscription: WebhookSubscription, eventType: string, payload: unknown): Promise<void>;
}

/**
 * Wires webhook delivery to the event bus purely via subscription -- never a
 * direct call from the subsystems that publish (catalog/checkout-orders/
 * payments/etc. have zero knowledge this package exists), the same posture
 * @mercatus-liber/inventory's registerInventorySync already established for
 * "a subscriber reacts to real events it doesn't own." For each of
 * `eventTypes` (default KNOWN_EVENT_TYPES), subscribes once; on every real
 * publish, looks up which active subscriptions asked for that exact event
 * type and fans the delivery out to each of them. An event type nobody
 * subscribed to still fires the bus handler (there's no way around that --
 * it's subscribed at construction time to every known type) but finds zero
 * matching subscriptions and makes zero HTTP calls, which is what this
 * epic's acceptance criterion "an unrelated event type doesn't trigger a
 * delivery to a subscription that didn't ask for it" is actually asserting
 * (test/delivery.test.ts proves this directly).
 *
 * Delivery itself never throws back into the bus: core's own EventBus
 * (packages/core/src/event-bus.ts) documents handlers as "best-effort...a
 * handler that throws does not prevent other handlers...but the error is
 * rethrown after all handlers have been attempted" -- a webhook handler that
 * threw on a down receiver would therefore surface as an AggregateError out
 * of the ORIGINAL publish() call (e.g. a customer's checkout!), which is
 * never acceptable for a side-channel delivery concern. deliverToSubscription
 * below catches and logs every failure instead of propagating it.
 */
export function createWebhookDeliveryService(config: WebhookDeliveryServiceConfig): WebhookDeliveryService {
  const {
    events,
    subscriptions,
    deliveryLog,
    eventTypes = KNOWN_EVENT_TYPES,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    backoffMs = defaultBackoffMs,
    fetchImpl = fetch,
    sleepImpl = realSleep,
    now = () => new Date().toISOString(),
  } = config;

  async function deliverToSubscription(subscription: WebhookSubscription, eventType: string, payload: unknown): Promise<void> {
    const deliveryId = randomUUID();
    const rawBody = JSON.stringify({ deliveryId, eventType, payload, deliveredAt: now() });
    const signature = signWebhookPayload(subscription.secret, rawBody);

    for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber++) {
      const attemptedAt = now();
      try {
        const response = await fetchImpl(subscription.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            [WEBHOOK_SIGNATURE_HEADER]: signature,
            [WEBHOOK_EVENT_TYPE_HEADER]: eventType,
            [WEBHOOK_DELIVERY_ID_HEADER]: deliveryId,
          },
          body: rawBody,
        });
        const success = response.status >= 200 && response.status < 300;
        await deliveryLog.record({
          id: randomUUID(),
          deliveryId,
          subscriptionId: subscription.id,
          eventType,
          attemptNumber,
          requestBody: rawBody,
          responseStatus: response.status,
          status: success ? "success" : "failed",
          error: success ? null : `Received non-2xx response status ${response.status}`,
          attemptedAt,
        });
        if (success) return;
      } catch (err) {
        await deliveryLog.record({
          id: randomUUID(),
          deliveryId,
          subscriptionId: subscription.id,
          eventType,
          attemptNumber,
          requestBody: rawBody,
          responseStatus: null,
          status: "failed",
          error: err instanceof Error ? err.message : String(err),
          attemptedAt,
        });
      }

      if (attemptNumber < maxAttempts) {
        await sleepImpl(backoffMs(attemptNumber));
      }
    }
    // Retries exhausted -- the final failed attempt is already the last row
    // `listForSubscription` returns for this deliveryId. No throw: see this
    // function's doc comment above on why delivery failure must never
    // propagate back into the publisher's own publish() call.
  }

  for (const eventType of eventTypes) {
    events.subscribe<unknown>(eventType, async (payload) => {
      const matching = await subscriptions.list({ eventType, active: true });
      for (const subscription of matching) {
        await deliverToSubscription(subscription, eventType, payload);
      }
    });
  }

  return {
    deliverNow: deliverToSubscription,
  };
}

import type { WebhookDeliveryLogEntry, WebhookDeliveryLogStore, WebhookSubscription, WebhookSubscriptionStore } from "./types.js";

/**
 * Default in-memory WebhookSubscriptionStore -- Map-backed,
 * structuredClone in/out so callers can never mutate stored state through a
 * returned reference, same convention as @mercatus-liber/advertising's
 * createInMemoryCampaignRepository (and recommendations/bundles/cart/
 * promotions' own in-memory repositories).
 */
export function createInMemoryWebhookSubscriptionStore(): WebhookSubscriptionStore {
  const subscriptions = new Map<string, WebhookSubscription>();

  return {
    async get(id: string): Promise<WebhookSubscription | null> {
      const subscription = subscriptions.get(id);
      return subscription ? structuredClone(subscription) : null;
    },
    async list(filter?: { eventType?: string; active?: boolean }): Promise<WebhookSubscription[]> {
      let all = Array.from(subscriptions.values());
      if (filter?.eventType) {
        const eventType = filter.eventType;
        all = all.filter((subscription) => subscription.eventTypes.includes(eventType));
      }
      if (filter?.active !== undefined) {
        all = all.filter((subscription) => subscription.active === filter.active);
      }
      return all.map((subscription) => structuredClone(subscription));
    },
    async save(subscription: WebhookSubscription): Promise<void> {
      subscriptions.set(subscription.id, structuredClone(subscription));
    },
    async delete(id: string): Promise<void> {
      subscriptions.delete(id);
    },
  };
}

/**
 * Default in-memory WebhookDeliveryLogStore -- append-only, keyed by a
 * generated row id, never mutated after `record`. `listForSubscription`
 * returns rows in attempt order (insertion order, which a Map/array
 * preserves), matching how a consumer would actually want to read a retry
 * sequence back ("what happened, in order") when debugging a missed
 * webhook.
 */
export function createInMemoryWebhookDeliveryLogStore(): WebhookDeliveryLogStore {
  const entries: WebhookDeliveryLogEntry[] = [];

  return {
    async record(entry: WebhookDeliveryLogEntry): Promise<void> {
      entries.push(structuredClone(entry));
    },
    async listForSubscription(subscriptionId: string): Promise<WebhookDeliveryLogEntry[]> {
      return entries.filter((entry) => entry.subscriptionId === subscriptionId).map((entry) => structuredClone(entry));
    },
  };
}

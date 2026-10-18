import { randomUUID } from "node:crypto";
import { generateWebhookSecret } from "./signer.js";
import type { NewWebhookSubscriptionInput, WebhookSubscription, WebhookSubscriptionStore } from "./types.js";

/**
 * Registers a new webhook subscription (target URL + which real event
 * type(s) it wants) against the injected store. id/createdAt are always
 * service-assigned (same convention as every other create-/submit-style
 * function in this repo, e.g. ReviewsService.submitReview); `secret` is generated via
 * generateWebhookSecret when the caller doesn't supply one (the normal
 * path -- a caller only supplies its own secret for a test fixture that
 * needs a known value); `active` defaults to true.
 *
 * Returns the full WebhookSubscription including its secret -- this is the
 * ONE time the real secret value is available to the caller going forward
 * (mirrors Printful's own `secret_key`, which `GET /v2/webhooks` never
 * echoes back again, per adapter-printful's webhook.ts doc comment); the
 * caller is responsible for persisting/displaying it once, since
 * WebhookSubscriptionStore.list/get return it too (unlike Printful's API)
 * only because this is this repo's own store, not a third party's -- a real
 * admin UI built on this package should still treat it as a "shown once,
 * then masked" value by convention, not rely on the store withholding it.
 */
export async function createWebhookSubscription(
  store: WebhookSubscriptionStore,
  input: NewWebhookSubscriptionInput,
): Promise<WebhookSubscription> {
  if (input.eventTypes.length === 0) {
    throw new WebhookSubscriptionNoEventTypesError();
  }

  const subscription: WebhookSubscription = {
    id: randomUUID(),
    url: input.url,
    eventTypes: input.eventTypes,
    secret: input.secret ?? generateWebhookSecret(),
    active: input.active ?? true,
    createdAt: new Date().toISOString(),
  };
  await store.save(subscription);
  return subscription;
}

export class WebhookSubscriptionNoEventTypesError extends Error {
  constructor() {
    super("A webhook subscription must request at least one event type.");
    this.name = "WebhookSubscriptionNoEventTypesError";
  }
}

export class WebhookSubscriptionNotFoundError extends Error {
  constructor(id: string) {
    super(`No webhook subscription found with id "${id}".`);
    this.name = "WebhookSubscriptionNotFoundError";
  }
}

/** Flips `active` to false without deleting the row or its delivery history -- the normal way to stop deliveries to a URL that's gone bad without losing the audit trail. */
export async function deactivateWebhookSubscription(store: WebhookSubscriptionStore, id: string): Promise<WebhookSubscription> {
  const existing = await store.get(id);
  if (!existing) throw new WebhookSubscriptionNotFoundError(id);
  const updated: WebhookSubscription = { ...existing, active: false };
  await store.save(updated);
  return updated;
}

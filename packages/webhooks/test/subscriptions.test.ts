import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryWebhookSubscriptionStore } from "../src/in-memory-store.js";
import { createWebhookSubscription, deactivateWebhookSubscription, WebhookSubscriptionNoEventTypesError, WebhookSubscriptionNotFoundError } from "../src/subscriptions.js";
import type { WebhookSubscriptionStore } from "../src/types.js";

describe("createWebhookSubscription", () => {
  let store: WebhookSubscriptionStore;

  beforeEach(() => {
    store = createInMemoryWebhookSubscriptionStore();
  });

  it("assigns an id, createdAt, defaults active to true, and generates a secret when none is supplied", async () => {
    const subscription = await createWebhookSubscription(store, {
      url: "https://example.com/hook",
      eventTypes: ["checkout.order.placed"],
    });

    expect(subscription.id).toBeTruthy();
    expect(subscription.createdAt).toBeTruthy();
    expect(subscription.active).toBe(true);
    expect(subscription.secret).toMatch(/^[0-9a-f]{64}$/);

    const persisted = await store.get(subscription.id);
    expect(persisted).toEqual(subscription);
  });

  it("uses a caller-supplied secret instead of generating one", async () => {
    const subscription = await createWebhookSubscription(store, {
      url: "https://example.com/hook",
      eventTypes: ["checkout.order.placed"],
      secret: "fixed-test-secret",
    });

    expect(subscription.secret).toBe("fixed-test-secret");
  });

  it("rejects a subscription with no event types", async () => {
    await expect(
      createWebhookSubscription(store, { url: "https://example.com/hook", eventTypes: [] }),
    ).rejects.toThrow(WebhookSubscriptionNoEventTypesError);
  });

  it("list() filters by eventType and active", async () => {
    const a = await createWebhookSubscription(store, { url: "https://a.example.com", eventTypes: ["checkout.order.placed"] });
    const b = await createWebhookSubscription(store, { url: "https://b.example.com", eventTypes: ["cart.item.added"] });

    expect(await store.list({ eventType: "checkout.order.placed" })).toEqual([a]);
    expect(await store.list({ eventType: "cart.item.added" })).toEqual([b]);
    expect(await store.list()).toHaveLength(2);
  });

  it("deactivateWebhookSubscription flips active to false without deleting the row", async () => {
    const subscription = await createWebhookSubscription(store, { url: "https://example.com/hook", eventTypes: ["checkout.order.placed"] });

    const updated = await deactivateWebhookSubscription(store, subscription.id);
    expect(updated.active).toBe(false);

    const persisted = await store.get(subscription.id);
    expect(persisted?.active).toBe(false);
    expect(await store.list({ eventType: "checkout.order.placed", active: true })).toEqual([]);
  });

  it("deactivateWebhookSubscription throws for an unknown id", async () => {
    await expect(deactivateWebhookSubscription(store, "nope")).rejects.toThrow(WebhookSubscriptionNotFoundError);
  });
});

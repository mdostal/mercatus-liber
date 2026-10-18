import { createInMemoryEventBus, type EventBus } from "@mercatus-liber/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createWebhookDeliveryService } from "../src/delivery.js";
import { createInMemoryWebhookDeliveryLogStore, createInMemoryWebhookSubscriptionStore } from "../src/in-memory-store.js";
import { verifyWebhookSignature, WEBHOOK_DELIVERY_ID_HEADER, WEBHOOK_EVENT_TYPE_HEADER, WEBHOOK_SIGNATURE_HEADER } from "../src/signer.js";
import { createWebhookSubscription } from "../src/subscriptions.js";
import type { WebhookDeliveryLogStore, WebhookSubscriptionStore } from "../src/types.js";
import { createFakeWebhookReceiver } from "./fake-webhook-receiver.js";

/** Near-instant in tests -- the retry COUNT and backoff CALCULATION are what's under test, not real wall-clock delay. */
const noDelay = async (_ms: number) => {};

describe("createWebhookDeliveryService", () => {
  let events: EventBus;
  let subscriptions: WebhookSubscriptionStore;
  let deliveryLog: WebhookDeliveryLogStore;
  let receiver: ReturnType<typeof createFakeWebhookReceiver> | undefined;

  beforeEach(() => {
    events = createInMemoryEventBus();
    subscriptions = createInMemoryWebhookSubscriptionStore();
    deliveryLog = createInMemoryWebhookDeliveryLogStore();
    receiver = undefined;
  });

  afterEach(async () => {
    if (receiver) await receiver.close();
  });

  it("delivers a real HTTP POST with a correct signature and the correct payload shape when a matching event fires", async () => {
    receiver = createFakeWebhookReceiver([200]);
    const url = await receiver.url;

    const subscription = await createWebhookSubscription(subscriptions, {
      url,
      eventTypes: ["checkout.order.placed"],
      secret: "fixed-test-secret",
    });

    createWebhookDeliveryService({ events, subscriptions, deliveryLog, sleepImpl: noDelay });

    await events.publish("checkout.order.placed", { orderId: "order_42" });

    expect(receiver.requests).toHaveLength(1);
    const [request] = receiver.requests;

    // Signature: verifiable with the subscription's own secret, over the exact raw body sent.
    const signatureHeader = request.headers[WEBHOOK_SIGNATURE_HEADER];
    expect(typeof signatureHeader).toBe("string");
    expect(verifyWebhookSignature(subscription.secret, request.rawBody, signatureHeader as string)).toBe(true);
    expect(signatureHeader).toMatch(/^sha256=[0-9a-f]{64}$/);

    // Event-type header matches what actually fired.
    expect(request.headers[WEBHOOK_EVENT_TYPE_HEADER]).toBe("checkout.order.placed");
    expect(typeof request.headers[WEBHOOK_DELIVERY_ID_HEADER]).toBe("string");

    // Payload shape: deliveryId/eventType/payload/deliveredAt, payload is exactly what was published.
    const body = JSON.parse(request.rawBody) as { deliveryId: string; eventType: string; payload: unknown; deliveredAt: string };
    expect(body.eventType).toBe("checkout.order.placed");
    expect(body.payload).toEqual({ orderId: "order_42" });
    expect(body.deliveryId).toBe(request.headers[WEBHOOK_DELIVERY_ID_HEADER]);
    expect(() => new Date(body.deliveredAt).toISOString()).not.toThrow();

    // Delivery log: one successful attempt recorded.
    const log = await deliveryLog.listForSubscription(subscription.id);
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ attemptNumber: 1, status: "success", responseStatus: 200, error: null });
    expect(log[0].requestBody).toBe(request.rawBody);
  });

  it("retries on simulated failure with backoff and succeeds once the receiver recovers", async () => {
    receiver = createFakeWebhookReceiver([500, 503, 200]); // fails twice, then succeeds on the 3rd attempt
    const url = await receiver.url;

    const subscription = await createWebhookSubscription(subscriptions, {
      url,
      eventTypes: ["checkout.order.placed"],
    });

    const backoffCalls: number[] = [];
    createWebhookDeliveryService({
      events,
      subscriptions,
      deliveryLog,
      sleepImpl: async (ms) => {
        backoffCalls.push(ms);
      },
    });

    await events.publish("checkout.order.placed", { orderId: "order_retry" });

    expect(receiver.requests).toHaveLength(3);

    const log = await deliveryLog.listForSubscription(subscription.id);
    expect(log).toHaveLength(3);
    expect(log[0]).toMatchObject({ attemptNumber: 1, status: "failed", responseStatus: 500 });
    expect(log[1]).toMatchObject({ attemptNumber: 2, status: "failed", responseStatus: 503 });
    expect(log[2]).toMatchObject({ attemptNumber: 3, status: "success", responseStatus: 200 });

    // Backoff was actually invoked with increasing delays between the two failed attempts and the final success.
    expect(backoffCalls).toEqual([250, 500]);
  });

  it("stops after a fixed number of attempts (never infinite) when the receiver always fails", async () => {
    receiver = createFakeWebhookReceiver([500]); // always fails
    const url = await receiver.url;

    const subscription = await createWebhookSubscription(subscriptions, {
      url,
      eventTypes: ["checkout.order.placed"],
    });

    createWebhookDeliveryService({ events, subscriptions, deliveryLog, maxAttempts: 3, sleepImpl: noDelay });

    await events.publish("checkout.order.placed", { orderId: "order_dead" });

    expect(receiver.requests).toHaveLength(3); // exactly maxAttempts, not retried forever

    const log = await deliveryLog.listForSubscription(subscription.id);
    expect(log).toHaveLength(3);
    expect(log.every((entry) => entry.status === "failed")).toBe(true);
    expect(log.map((entry) => entry.attemptNumber)).toEqual([1, 2, 3]);
  });

  it("logs a network-error attempt (no response at all) distinctly from a non-2xx response", async () => {
    const subscription = await createWebhookSubscription(subscriptions, {
      url: "http://127.0.0.1:1/unreachable", // port 1 -- nothing listens there, a real connection failure
      eventTypes: ["checkout.order.placed"],
    });

    createWebhookDeliveryService({ events, subscriptions, deliveryLog, maxAttempts: 1, sleepImpl: noDelay });

    await events.publish("checkout.order.placed", { orderId: "order_unreachable" });

    const log = await deliveryLog.listForSubscription(subscription.id);
    expect(log).toHaveLength(1);
    expect(log[0].status).toBe("failed");
    expect(log[0].responseStatus).toBeNull();
    expect(log[0].error).toBeTruthy();
  });

  it("does NOT deliver to a subscription that never asked for the event type that fired", async () => {
    receiver = createFakeWebhookReceiver([200]);
    const url = await receiver.url;

    const subscription = await createWebhookSubscription(subscriptions, {
      url,
      eventTypes: ["checkout.order.placed"], // only this type
    });

    createWebhookDeliveryService({ events, subscriptions, deliveryLog, sleepImpl: noDelay });

    // Fire a real, different, known event type -- this subscription never asked for it.
    await events.publish("cart.item.added", { cartId: "cart_1", skuId: "sku_1", quantity: 2 });

    expect(receiver.requests).toHaveLength(0);
    expect(await deliveryLog.listForSubscription(subscription.id)).toHaveLength(0);
  });

  it("delivers to the right subset when two subscriptions want different event types", async () => {
    const receiverA = createFakeWebhookReceiver([200]);
    const receiverB = createFakeWebhookReceiver([200]);
    try {
      const subA = await createWebhookSubscription(subscriptions, { url: await receiverA.url, eventTypes: ["checkout.order.placed"] });
      const subB = await createWebhookSubscription(subscriptions, { url: await receiverB.url, eventTypes: ["cart.item.added"] });

      createWebhookDeliveryService({ events, subscriptions, deliveryLog, sleepImpl: noDelay });

      await events.publish("checkout.order.placed", { orderId: "order_1" });
      await events.publish("cart.item.added", { cartId: "cart_1", skuId: "sku_1", quantity: 1 });

      expect(receiverA.requests).toHaveLength(1);
      expect(receiverB.requests).toHaveLength(1);
      expect(await deliveryLog.listForSubscription(subA.id)).toHaveLength(1);
      expect(await deliveryLog.listForSubscription(subB.id)).toHaveLength(1);
    } finally {
      await receiverA.close();
      await receiverB.close();
    }
  });

  it("never delivers to an inactive (deactivated) subscription", async () => {
    receiver = createFakeWebhookReceiver([200]);
    const url = await receiver.url;

    const subscription = await createWebhookSubscription(subscriptions, { url, eventTypes: ["checkout.order.placed"], active: false });

    createWebhookDeliveryService({ events, subscriptions, deliveryLog, sleepImpl: noDelay });

    await events.publish("checkout.order.placed", { orderId: "order_inactive" });

    expect(receiver.requests).toHaveLength(0);
    expect(await deliveryLog.listForSubscription(subscription.id)).toHaveLength(0);
  });

  it("deliverNow redelivers a specific event to a specific subscription without re-publishing on the bus", async () => {
    receiver = createFakeWebhookReceiver([200]);
    const url = await receiver.url;

    const subscription = await createWebhookSubscription(subscriptions, { url, eventTypes: ["checkout.order.placed"] });

    const service = createWebhookDeliveryService({ events, subscriptions, deliveryLog, sleepImpl: noDelay });

    await service.deliverNow(subscription, "checkout.order.placed", { orderId: "manual_redelivery" });

    expect(receiver.requests).toHaveLength(1);
    const body = JSON.parse(receiver.requests[0].rawBody) as { payload: unknown };
    expect(body.payload).toEqual({ orderId: "manual_redelivery" });
  });
});

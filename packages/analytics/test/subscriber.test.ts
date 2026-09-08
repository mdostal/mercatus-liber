import { createInMemoryEventBus, type EventBus } from "@mercatus-liber/core";
import { beforeEach, describe, expect, it } from "vitest";
import { registerAnalyticsSync } from "../src/subscriber.js";
import type { AnalyticsAdapter } from "../src/types.js";

function recordingAdapter(): { adapter: AnalyticsAdapter; calls: { event: string; properties: unknown }[] } {
  const calls: { event: string; properties: unknown }[] = [];
  return {
    calls,
    adapter: {
      async track(eventName, properties) {
        calls.push({ event: eventName, properties });
      },
      async identify() {},
      async page() {},
    },
  };
}

describe("registerAnalyticsSync", () => {
  let events: EventBus;

  beforeEach(() => {
    events = createInMemoryEventBus();
  });

  it("forwards an allow-listed event to analytics.track() with the mapped name and the event's own payload", async () => {
    const { adapter, calls } = recordingAdapter();
    registerAnalyticsSync({ events, analytics: adapter });

    await events.publish("checkout.order.placed", { orderId: "order-1" });

    expect(calls).toEqual([{ event: "order_placed", properties: { orderId: "order-1" } }]);
  });

  it("forwards every allow-listed cart/checkout/payments event", async () => {
    const { adapter, calls } = recordingAdapter();
    registerAnalyticsSync({ events, analytics: adapter });

    await events.publish("cart.item.added", { cartId: "c1", skuId: "s1", quantity: 1 });
    await events.publish("checkout.order.paid", { orderId: "order-1" });
    await events.publish("payments.payment.succeeded", { sessionId: "sess-1", orderRef: "order-1" });

    expect(calls.map((c) => c.event)).toEqual(["cart_item_added", "order_paid", "payment_succeeded"]);
  });

  it("does NOT forward a non-allow-listed event (e.g. internal catalog admin CRUD)", async () => {
    const { adapter, calls } = recordingAdapter();
    registerAnalyticsSync({ events, analytics: adapter });

    await events.publish("catalog.product.created", { id: "prod-1" });

    expect(calls).toEqual([]);
  });
});

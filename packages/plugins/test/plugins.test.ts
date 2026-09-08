import { createInMemoryEventBus } from "@mercatus-liber/core";
import { describe, expect, it } from "vitest";
import { createOrderNotificationPlugin } from "../src/order-notification-plugin.js";
import { createPluginRegistry } from "../src/registry.js";
import type { Plugin } from "../src/types.js";

describe("plugin registry", () => {
  it("calls a registered plugin's init hook exactly once, with a context exposing only { events }", async () => {
    const events = createInMemoryEventBus();
    const registry = createPluginRegistry();
    let callCount = 0;
    let receivedCtxKeys: string[] = [];
    const plugin: Plugin = {
      name: "test-plugin",
      init(ctx) {
        callCount += 1;
        receivedCtxKeys = Object.keys(ctx);
      },
    };
    registry.register(plugin);
    await registry.initAll({ events });

    expect(callCount).toBe(1);
    expect(receivedCtxKeys).toEqual(["events"]);
  });

  it("initializes multiple plugins independently -- one throwing does not block another", async () => {
    const events = createInMemoryEventBus();
    const registry = createPluginRegistry();
    let goodPluginInitialized = false;

    registry.register({
      name: "broken-plugin",
      init() {
        throw new Error("boom");
      },
    });
    registry.register({
      name: "good-plugin",
      init() {
        goodPluginInitialized = true;
      },
    });

    await expect(registry.initAll({ events })).resolves.toBeUndefined();
    expect(goodPluginInitialized).toBe(true);
  });

  it("list returns every registered plugin", () => {
    const registry = createPluginRegistry();
    registry.register({ name: "a", init() {} });
    registry.register({ name: "b", init() {} });
    expect(registry.list().map((p) => p.name)).toEqual(["a", "b"]);
  });
});

describe("order-notification reference plugin", () => {
  it("records a notification when checkout.order.placed fires, proving the event-subscription extension point works", async () => {
    const events = createInMemoryEventBus();
    const plugin = createOrderNotificationPlugin();
    await plugin.init({ events });

    await events.publish("checkout.order.placed", { orderId: "order-1" });

    const notifications = plugin.listNotifications();
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ orderId: "order-1", message: "Order order-1 placed" });
  });

  it("registers cleanly through the PluginRegistry, not just standalone", async () => {
    const events = createInMemoryEventBus();
    const registry = createPluginRegistry();
    const plugin = createOrderNotificationPlugin();
    registry.register(plugin);
    await registry.initAll({ events });

    await events.publish("checkout.order.placed", { orderId: "order-2" });
    expect(plugin.listNotifications()).toHaveLength(1);
  });
});

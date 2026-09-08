import type { Plugin, PluginContext } from "./types.js";

export interface OrderNotification {
  orderId: string;
  message: string;
  /** ISO 8601 timestamp. */
  at: string;
}

export interface OrderNotificationPlugin extends Plugin {
  listNotifications(): OrderNotification[];
}

/**
 * Reference plugin proving the event-subscription extension point works for
 * something real, per docs/subsystems/12-plugins-extensibility.md's own
 * suggested example. A real deployment would send an email/Slack message
 * here instead of logging in-memory; this reference keeps it dependency-free.
 */
export function createOrderNotificationPlugin(): OrderNotificationPlugin {
  const notifications: OrderNotification[] = [];

  return {
    name: "order-notification",

    async init(ctx: PluginContext) {
      ctx.events.subscribe<{ orderId: string }>("checkout.order.placed", async ({ orderId }) => {
        notifications.push({
          orderId,
          message: `Order ${orderId} placed`,
          at: new Date().toISOString(),
        });
      });
    },

    listNotifications() {
      return [...notifications];
    },
  };
}

import { randomUUID } from "node:crypto";
import type { EventBus } from "@mercatus-liber/core";
import type { BiEventLogRepository } from "./types.js";

/**
 * Wires internal-bi's own funnel event log purely via events -- never a
 * direct call into cart/checkout-orders/promotions, which have zero
 * knowledge internal-bi exists (mirrors packages/inventory/src/subscriber.ts's
 * registerInventorySync exactly). Each handler appends one BiEvent per fire,
 * stamping occurredAt at the moment it fires -- never a timestamp read from
 * the event payload, since cart/promotion events don't carry one, and even
 * checkout.order.placed/paid's own timestamp would describe a different
 * moment (order creation/payment) than "when this subsystem observed it".
 * Populated strictly going forward from the moment this function runs -- no
 * backfill of history from before the subscriber was wired (see
 * docs/subsystems/20-internal-bi.md).
 */
export function registerBiEventLogSync(deps: { events: EventBus; eventLog: BiEventLogRepository }): void {
  const { events, eventLog } = deps;

  events.subscribe<Record<string, unknown>>("cart.item.added", async (payload) => {
    await eventLog.append({ id: randomUUID(), eventType: "cart.item.added", occurredAt: new Date().toISOString(), payload });
  });

  events.subscribe<Record<string, unknown>>("checkout.order.placed", async (payload) => {
    await eventLog.append({ id: randomUUID(), eventType: "checkout.order.placed", occurredAt: new Date().toISOString(), payload });
  });

  events.subscribe<Record<string, unknown>>("checkout.order.paid", async (payload) => {
    await eventLog.append({ id: randomUUID(), eventType: "checkout.order.paid", occurredAt: new Date().toISOString(), payload });
  });

  events.subscribe<Record<string, unknown>>("promotions.redeemed", async (payload) => {
    await eventLog.append({ id: randomUUID(), eventType: "promotions.redeemed", occurredAt: new Date().toISOString(), payload });
  });
}

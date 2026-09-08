import type { EventBus } from "@mercatus-liber/core";
import type { InventoryAdapter, OrderLookup } from "./types.js";

/**
 * Wires inventory to catalog/checkout/payments purely via events -- never a
 * direct call from those subsystems, which have zero knowledge inventory
 * exists. Order line items are fetched via the injected OrderLookup only
 * when an order-related event fires (event-triggered lookup, same pattern
 * as search's and account's subscribers), never at request time.
 */
export function registerInventorySync(deps: { events: EventBus; inventory: InventoryAdapter; orders: OrderLookup }): void {
  const { events, inventory, orders } = deps;

  events.subscribe<{ id: string }>("catalog.sku.created", async ({ id }) => {
    await inventory.setStock(id, 0);
  });

  events.subscribe<{ orderId: string }>("checkout.order.placed", async ({ orderId }) => {
    const order = await orders.getOrder(orderId);
    if (!order) return;
    for (const item of order.items) {
      await inventory.reserve(item.skuId, item.quantity);
    }
  });

  events.subscribe<{ orderId: string }>("checkout.order.paid", async ({ orderId }) => {
    const order = await orders.getOrder(orderId);
    if (!order) return;
    for (const item of order.items) {
      await inventory.commit(item.skuId, item.quantity);
    }
  });

  events.subscribe<{ orderRef: string | null }>("payments.payment.failed", async ({ orderRef }) => {
    if (!orderRef) return;
    const order = await orders.getOrder(orderRef);
    if (!order) return;
    for (const item of order.items) {
      await inventory.release(item.skuId, item.quantity);
    }
  });
}

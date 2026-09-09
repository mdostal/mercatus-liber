/**
 * Resolves docs/subsystems/13-analytics-tracking.md's open question 1: a lean
 * allow-list, not automatic pass-through of every bus event. Covers exactly
 * the commerce events this repo actually publishes today (grep-verified
 * against packages/*'/src for events.publish calls) -- deliberately excludes
 * internal catalog/sku admin CRUD events, which aren't business events a
 * marketer/analyst cares about. A new subsystem event only reaches analytics
 * once someone deliberately adds it here -- new events never leak in
 * silently.
 */
export const ANALYTICS_EVENT_MAP: Readonly<Record<string, string>> = Object.freeze({
  "cart.item.added": "cart_item_added",
  "cart.item.removed": "cart_item_removed",
  "cart.item.updated": "cart_item_updated",
  "cart.cleared": "cart_cleared",
  "checkout.order.placed": "order_placed",
  "checkout.order.paid": "order_paid",
  "payments.payment.succeeded": "payment_succeeded",
  "payments.payment.failed": "payment_failed",
  "promotions.redeemed": "promotion_redeemed",
});

export function resolveAnalyticsEventName(busTopic: string): string | undefined {
  return ANALYTICS_EVENT_MAP[busTopic];
}

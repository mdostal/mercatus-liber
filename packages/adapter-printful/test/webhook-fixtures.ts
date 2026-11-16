/**
 * One Printful webhook body per event type printfulOrderStatusUpdateFrom reads.
 *
 * Where each shape came from:
 *
 * - v2 events (`shipment_sent`, `shipment_delivered`, `shipment_returned`,
 *   `order_failed`, `order_canceled`): the "Webhook v2" section of
 *   developers.printful.com/docs/v2-beta/, read on 2026-11-15 through a fetch
 *   tool that summarises the page instead of returning it verbatim. It listed
 *   the envelope (`type`, `occurred_at`, `retries`, `store_id`, `data`),
 *   `data.shipment` (`id`, `status`, `store_id`, `tracking_number`,
 *   `tracking_url`, `created_at`, `ship_date`, `shipped_at`, `delivered_at`,
 *   `reshipment`), `data.order` (`id`, `external_id`, `status`, `store_id`,
 *   `dashboard_url`, `created_at`, `updated_at`) and `data.reason` on the
 *   returned, failed and canceled events. It listed no `carrier` on the v2
 *   shipment.
 * - v1 events (`package_shipped`, `package_returned`): the Webhook API section
 *   of developers.printful.com/docs/, read the same day the same way. Envelope
 *   `type`, `created`, `retries`, `store`, `data`; `data.shipment` has `id`,
 *   `carrier`, `service`, `tracking_number`, `tracking_url`, `created`,
 *   `ship_date`, `shipped_at`, `reshipment`, `items`; `data.order` has `id`,
 *   `external_id`, `status` and more; `package_returned` adds `data.reason`.
 * - The fields read here (`order.id`, `order.external_id`,
 *   `shipment.tracking_number`, `reason`) are also the ones the webhook
 *   handler of a store built on this framework reads from v2 deliveries. That
 *   store's own tests use hand-written payloads too.
 *
 * Only the field names come from those sources. Every value is made up, and
 * the value formats (date strings, status words, the dashboard URL, the v1
 * shipment item shape) are guesses. None of these bodies was captured from a
 * live Printful delivery.
 */

const order = (status: string) => ({
  id: 880011,
  external_id: "order-1001",
  status,
  store_id: 4242,
  dashboard_url: "https://www.printful.com/dashboard?order_id=880011",
  created_at: "2026-11-10T09:00:00Z",
  updated_at: "2026-11-12T15:30:00Z",
});

const shipment = (status: string, deliveredAt: string | null = null) => ({
  id: 5501,
  status,
  store_id: 4242,
  tracking_number: "TRACK-0001",
  tracking_url: "https://tracking.example/TRACK-0001",
  created_at: "2026-11-12T15:00:00Z",
  ship_date: "2026-11-12",
  shipped_at: "2026-11-12T15:30:00Z",
  delivered_at: deliveredAt,
  reshipment: false,
});

const v2 = (type: string, data: unknown) => ({ type, occurred_at: "2026-11-12T15:30:05Z", retries: 0, store_id: 4242, data });

const v1Shipment = {
  id: 5501,
  carrier: "USPS",
  service: "USPS Ground Advantage",
  tracking_number: "TRACK-0001",
  tracking_url: "https://tracking.example/TRACK-0001",
  created: 1794495600,
  ship_date: "2026-11-12",
  shipped_at: 1794497400,
  reshipment: false,
  items: [{ item_id: 1, quantity: 1 }],
};
const v1Order = { id: 880011, external_id: "order-1001", store: 4242, status: "fulfilled", created: 1794301200, updated: 1794497400 };

export const PRINTFUL_WEBHOOK_FIXTURES = {
  shipment_sent: v2("shipment_sent", { shipment: shipment("shipped"), order: order("fulfilled") }),
  shipment_delivered: v2("shipment_delivered", { shipment: shipment("shipped", "2026-11-15T18:02:00Z"), order: order("fulfilled") }),
  shipment_returned: v2("shipment_returned", { reason: "Address not found", shipment: shipment("returned"), order: order("fulfilled") }),
  order_failed: v2("order_failed", { reason: "Print file can't be downloaded", order: order("failed") }),
  order_canceled: v2("order_canceled", { reason: "Canceled by the store", order: order("canceled") }),
  package_shipped: { type: "package_shipped", created: 1794497405, retries: 0, store: 4242, data: { shipment: v1Shipment, order: v1Order } },
  package_returned: { type: "package_returned", created: 1794756605, retries: 0, store: 4242, data: { reason: "Address not found", shipment: v1Shipment, order: v1Order } },
};

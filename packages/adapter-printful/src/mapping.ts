import type { FulfillmentLineStatus } from "@mercatus-liber/fulfillment";
import type { PrintfulOrderStatus, PrintfulShipmentResponse } from "./printful-types.js";

/**
 * How this adapter resolves this framework's opaque `skuId` to the real
 * Printful catalog line Printful needs to actually print/ship something --
 * `SubmitFulfillmentOrderInput` (epic 41's real contract, packages/fulfillment/
 * src/types.ts) carries only `{ skuId, quantity }`, and Printful's confirmed v2
 * `order_items` schema (printful-types.ts) has no way to select a design/variant
 * from an arbitrary caller-assigned string -- `catalog_variant_id` is a
 * Printful-assigned integer. This is the one piece of caller-supplied mapping
 * this adapter cannot derive from either contract alone, so it's injected here,
 * the same shape as adapter-shopify needing its own id bridge (mapping.ts's
 * reserved metafield) -- except Printful's real, confirmed `external_id` field
 * (see printful-types.ts) already covers the *round-trip* id (our skuId is
 * stored as the item's own `external_id`), so no reserved-field workaround is
 * needed here, only this narrower "what to print" resolution.
 */
export interface PrintfulCatalogTarget {
  catalogVariantId: number;
  retailPrice?: string;
  name?: string;
  placements?: { placement: string; technique: string; layers: { type: "file"; url: string }[] }[];
}

/**
 * `SubmitFulfillmentOrderInput` also carries no shipping address at all (see the
 * same file) -- `FulfillmentRoutingRepository`/`OrderLookup` (fulfillment's own
 * subsystem) deliberately narrow `OrderLookup.getOrder` to `{ id, items }` only,
 * mirroring internal-bi's own narrow read discipline. A real POD provider's order
 * API genuinely cannot ship anything without a recipient address, so this adapter
 * needs its own bridge back to wherever shipping info actually lives (typically
 * checkout-orders' `Order.shippingInfo`) -- injected here rather than this
 * package reaching around `OrderLookup`'s narrow contract or importing
 * `@mercatus-liber/checkout-orders` directly (this package depends on
 * `@mercatus-liber/fulfillment` only, same narrow-dependency discipline every
 * other adapter in this repo follows).
 */
export interface PrintfulRecipientAddress {
  name?: string;
  address1?: string;
  address2?: string;
  city?: string;
  state_code?: string;
  country_code?: string;
  zip?: string;
  phone?: string;
  email?: string;
}

/**
 * Printful's real v2 order status (confirmed, printful-types.ts) has 8 values;
 * `FulfillmentLineStatus` (epic 41's real contract) has only 4
 * (`unfulfilled | submitted | shipped | delivered`), with no "failed"/"canceled"
 * state at all. This is a genuine, disclosed narrowing -- not a research gap,
 * a real mismatch between the two real contracts this adapter sits between.
 * `failed`/`canceled`/`onhold` all narrow to `"submitted"` (the order was
 * created/confirmed but has not yet shipped) rather than inventing a status
 * FulfillmentLineStatus doesn't have. `"delivered"` is never derived from
 * `Order.status` (there is no such order-level status, confirmed) -- only from
 * a matching shipment's real `delivery_status` field.
 */
export function mapPrintfulOrderStatus(orderStatus: PrintfulOrderStatus, shipments: PrintfulShipmentResponse[]): FulfillmentLineStatus {
  const anyDelivered = shipments.some((s) => s.delivery_status === "delivered");
  if (anyDelivered) return "delivered";

  const anyShipped = shipments.some((s) => s.shipment_status === "shipped") || orderStatus === "fulfilled";
  if (anyShipped) return "shipped";

  return "submitted";
}

/**
 * Confirmed: Printful's real v2 `Shipment` schema (printful-types.ts) has no
 * `tracking_number` field at all -- only `tracking_url` and a `tracking_events`
 * timeline. `FulfillmentLineRecord.trackingNumber` is therefore always `null`
 * from this adapter, not a placeholder -- a genuine, disclosed shape gap between
 * Printful's real API and this contract's field name, not an implementation
 * oversight.
 */
export function findTrackingUrlForItem(shipments: PrintfulShipmentResponse[], orderItemId: number): string | null {
  const match = shipments.find((s) => s.shipment_items?.some((item) => item.order_item_id === orderItemId));
  return match?.tracking_url ?? null;
}

import type { FulfillmentLineStatus, FulfillmentRecipient } from "@mercatus-liber/fulfillment";
import type { PrintifyOrderLineItemResponse, PrintifyOrderShipment } from "./printify-types.js";

/**
 * How this adapter resolves this framework's opaque `skuId` to the real
 * Printify catalog line Printify needs to actually print/ship something --
 * `SubmitFulfillmentOrderInput` (epic 41's real contract, packages/fulfillment/
 * src/types.ts) carries only `{ skuId, quantity }`, and Printify's confirmed v1
 * "order an existing product" line-item shape (printify-types.ts) addresses a
 * line by a Printify-assigned `product_id` (string) + `variant_id` (int), not
 * an arbitrary caller-assigned SKU string. This is the one piece of
 * caller-supplied mapping this adapter cannot derive from either contract
 * alone, so it's injected here -- same shape as adapter-printful's
 * `PrintfulCatalogTarget`, and the same real design-discussion.md §1a boundary:
 * which underlying Printify product/variant a SKU maps to (and which print
 * provider fulfills it) is set up in Printify's own dashboard, out of this
 * adapter's scope.
 */
export interface PrintifyCatalogTarget {
  productId: string;
  variantId: number;
}

/**
 * `SubmitFulfillmentOrderInput` also carries no shipping address at all (see
 * the same file) -- `FulfillmentRoutingRepository`/`OrderLookup` (fulfillment's
 * own subsystem) deliberately narrow `OrderLookup.getOrder` to `{ id, items }`
 * only. A real POD provider's order API genuinely cannot ship anything without
 * a recipient address, so this adapter needs its own bridge back to wherever
 * shipping info actually lives -- injected here rather than this package
 * reaching around `OrderLookup`'s narrow contract or importing
 * `@mercatus-liber/checkout-orders` directly (this package depends on
 * `@mercatus-liber/fulfillment` only, same narrow-dependency discipline every
 * other adapter in this repo follows). Every field mirrors `PrintifyAddress`
 * (printify-types.ts); Printify's docs mark `first_name`/`last_name`/
 * `address1`/`city`/`zip`/`email`/`phone`/`country` REQUIRED, but this bridge
 * type leaves them all optional (same posture as adapter-printful's own
 * `PrintfulRecipientAddress`) -- Printify itself rejects an insufficiently
 * populated address; this adapter does not re-validate ahead of that.
 */
export interface PrintifyRecipientAddress {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  country?: string;
  region?: string;
  address1?: string;
  address2?: string;
  city?: string;
  zip?: string;
  company?: string;
}

/**
 * Real address-mapping function, added for dp-02 (epic 82) now that
 * `SubmitFulfillmentOrderInput.recipient` (fulfillment's own contract,
 * `@mercatus-liber/fulfillment`'s `FulfillmentRecipient`) actually carries a
 * structured address -- mirrors adapter-printful's own
 * `mapRecipientToPrintfulAddress` (mapping.ts there), same priority-over-
 * resolveRecipient wiring in this file's index.ts. Field-for-field confirmed
 * against `PrintifyRecipientAddress` above: `street1`->`address1`,
 * `street2`->`address2`, `stateCode`->`region` (Printify's real, confirmed
 * field name -- genuinely NOT `state`/`state_code`), `countryCode`->`country`,
 * `postalCode`->`zip`, `phone`->`phone` unchanged.
 *
 * One real, disclosed gap this split cannot avoid: `FulfillmentRecipient`
 * (like checkout-orders' `ShippingInfo` it mirrors) carries a single free-text
 * `name`, never separate first/last fields, but Printify's real, confirmed
 * schema requires `first_name`/`last_name` as two fields (this file's own top
 * doc comment). This function makes the same best-effort split any
 * single-name-field source has to: the first whitespace-separated token
 * becomes `first_name`, everything after it (if anything) becomes
 * `last_name`, omitted entirely for a single-token name rather than sent as
 * an empty string. A genuinely single-name shopper (not uncommon) therefore
 * submits with no `last_name` at all -- Printify itself rejects an
 * insufficiently populated address; this function does not re-validate ahead
 * of that, same posture as `PrintifyRecipientAddress`'s own doc comment.
 */
export function mapRecipientToPrintifyAddress(recipient: FulfillmentRecipient): PrintifyRecipientAddress {
  const [firstName, ...rest] = recipient.name.trim().split(/\s+/);
  const lastName = rest.join(" ");

  return {
    first_name: firstName || recipient.name,
    ...(lastName ? { last_name: lastName } : {}),
    email: recipient.email,
    ...(recipient.phone !== undefined ? { phone: recipient.phone } : {}),
    ...(recipient.countryCode !== undefined ? { country: recipient.countryCode } : {}),
    ...(recipient.stateCode !== undefined ? { region: recipient.stateCode } : {}),
    ...(recipient.street1 !== undefined ? { address1: recipient.street1 } : {}),
    ...(recipient.street2 !== undefined ? { address2: recipient.street2 } : {}),
    ...(recipient.city !== undefined ? { city: recipient.city } : {}),
    ...(recipient.postalCode !== undefined ? { zip: recipient.postalCode } : {}),
  };
}

/**
 * Printify's real, confirmed per-LINE-ITEM status (6 values: `on-hold` |
 * `sending-to-production` | `in-production` | `has-issues` | `fulfilled` |
 * `canceled` -- printify-types.ts's top comment) is what this adapter maps
 * from, not the order-level 11-value status -- it is the more precise, real
 * per-line fact `FulfillmentLineRecord` (epic 41's contract) actually wants
 * one of per submitted line. `FulfillmentLineStatus` has only 4 values
 * (`unfulfilled | submitted | shipped | delivered`), with no "on-hold"/
 * "has-issues"/"canceled" equivalent -- a genuine, disclosed narrowing, not a
 * research gap (same discipline as adapter-printful's `mapPrintfulOrderStatus`
 * doc comment). `has-issues`/`canceled`/`on-hold`/`sending-to-production`/
 * `in-production` all narrow to `"submitted"` (the line was accepted and is
 * somewhere in Printify's own pipeline, but has not itself shipped) rather
 * than inventing a status `FulfillmentLineStatus` doesn't have. `"fulfilled"`
 * maps to `"shipped"`, upgraded to `"delivered"` only when at least one of the
 * order's real shipments carries a non-empty `delivered_at` (see
 * `findTrackingForLineItem` below for the real, disclosed limit on
 * per-line-item shipment attribution this adapter is honest about).
 */
export function mapPrintifyLineItemStatus(lineItemStatus: string | undefined, shipments: PrintifyOrderShipment[]): FulfillmentLineStatus {
  if (lineItemStatus === "fulfilled") {
    const anyDelivered = shipments.some((s) => Boolean(s.delivered_at));
    return anyDelivered ? "delivered" : "shipped";
  }
  return "submitted";
}

/**
 * Real, disclosed limitation confirmed during this story's research (see
 * printify-types.ts's top comment): unlike Printful's real v2 `Shipment`
 * schema (which carries `shipment_items[].order_item_id`), Printify's real,
 * confirmed `Order.shipments[]` shape (`carrier`/`number`/`url`/
 * `delivered_at`) carries NO per-line-item linkage at all -- there is no field
 * on a shipment naming which line item(s) it covers, and no field on a line
 * item naming which shipment fulfilled it. This is a genuine API-shape gap,
 * not an omission in this adapter: when an order has exactly one shipment,
 * attributing it to every line item is a safe, unambiguous read (the common
 * case for a small single-item-per-order shop, and the only case this
 * function will actually attach tracking for); when an order has zero or two
 * or more real shipments, this adapter cannot honestly attribute a specific
 * shipment to a specific line item from Printify's own response shape alone,
 * so it returns `null` rather than guessing.
 */
export function findTrackingForLineItem(shipments: PrintifyOrderShipment[]): { trackingNumber: string | null; trackingUrl: string | null } {
  if (shipments.length !== 1) return { trackingNumber: null, trackingUrl: null };
  const [only] = shipments;
  return { trackingNumber: only?.number ?? null, trackingUrl: only?.url ?? null };
}

/**
 * Resolves a line item's own `skuId` -- Printify's real, confirmed line-item
 * `external_id` is where this adapter puts it on submit (see printify-types.ts
 * finding 1), so this is the round-trip read. Checks both the top-level
 * `external_id` field AND the nested `metadata.external_id` field (Printify's
 * own docs disclose both shapes -- see `PrintifyOrderLineItemResponse`'s doc
 * comment), preferring the top-level one when both happen to be present.
 * Falls back to a synthesized id (mirroring adapter-printful's own fallback)
 * for a line item Printify doesn't echo an `external_id` for at all, which
 * should not happen for orders this adapter itself submitted.
 */
export function resolveSkuId(item: PrintifyOrderLineItemResponse, index: number): string {
  return item.external_id ?? item.metadata?.external_id ?? `pfy-item-${item.variant_id}-${index}`;
}

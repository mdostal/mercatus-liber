import { regionForProvider } from "@mercatus-liber/core";
import type { FulfillmentLineStatus, FulfillmentRecipient } from "@mercatus-liber/fulfillment";
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
 * Real address-mapping function, added for dp-01/dp-02 (epic 82) now that
 * `SubmitFulfillmentOrderInput.recipient` (fulfillment's own contract,
 * `@mercatus-liber/fulfillment`'s `FulfillmentRecipient`) actually carries a
 * structured address -- see index.ts's `submitOrder`, which calls this
 * instead of the caller-supplied `resolveRecipient` bridge whenever
 * `input.recipient` is present. Field-for-field confirmed against
 * `PrintfulRecipientAddress`/`PrintfulAddress` above (printful-types.ts):
 * `street1`->`address1`, `street2`->`address2`, `stateCode`->`state_code`,
 * `countryCode`->`country_code`, `postalCode`->`zip` (Printful's real,
 * confirmed field name -- genuinely NOT `postal_code`), `phone`->`phone`
 * unchanged. Every field stays omitted (not set to `undefined` or `""`)
 * when the corresponding `FulfillmentRecipient` field is absent, matching
 * `PrintfulAddress`'s own "every field is genuinely optional" doc comment --
 * this function never invents a placeholder value Printful didn't receive
 * from the real order.
 */
export function mapRecipientToPrintfulAddress(recipient: FulfillmentRecipient): PrintfulRecipientAddress {
  return {
    name: recipient.name,
    email: recipient.email,
    ...(recipient.street1 !== undefined ? { address1: recipient.street1 } : {}),
    ...(recipient.street2 !== undefined ? { address2: recipient.street2 } : {}),
    ...(recipient.city !== undefined ? { city: recipient.city } : {}),
    ...((recipient.stateCode ?? recipient.stateName) !== undefined ? { state_code: (recipient.stateCode ?? recipient.stateName)! } : {}),
    ...(recipient.countryCode !== undefined ? { country_code: recipient.countryCode } : {}),
    ...(recipient.postalCode !== undefined ? { zip: recipient.postalCode } : {}),
    ...(recipient.phone !== undefined ? { phone: recipient.phone } : {}),
  };
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

  // A draft hasn't been confirmed, so nothing is made or charged yet.
  if (orderStatus === "draft") return "held";
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

/** Thrown before calling Printful when a recipient lacks a field Printful needs to ship. */
export class IncompleteRecipientError extends Error {
  constructor(readonly missing: string[]) {
    super(`The shipping address is missing ${missing.join(", ")}, which Printful needs to ship.`);
    this.name = "IncompleteRecipientError";
  }
}

/**
 * The countries Printful keeps a state list for, and so wants a `state_code`
 * from: the countries with `states` in https://api.printful.com/countries on
 * 2026-11-20. Printful answered a real order to Nebraska sent as "Nebraska"
 * with `HTTP 400: Recipient: Shipping address state and ZIP code don't match`.
 */
export const PRINTFUL_STATE_CODE_COUNTRIES = ["US", "CA", "AU", "BR", "JP"] as const;

/**
 * The address as Printful wants it: the country upper-cased and, for
 * PRINTFUL_STATE_CODE_COUNTRIES, the state as its code ("Nebraska" becomes
 * "NE"). Throws UnresolvedRegionError (from @mercatus-liber/core) when such a
 * country's state can't be matched, before anything is sent to Printful.
 */
export function normalizePrintfulRecipient(address: PrintfulRecipientAddress): PrintfulRecipientAddress {
  const country = address.country_code?.trim().toUpperCase();
  if (!country) return address;
  const { state_code: _state, ...rest } = address;
  const state = regionForProvider(country, address.state_code, { codesFor: PRINTFUL_STATE_CODE_COUNTRIES, provider: "Printful" });
  return { ...rest, country_code: country, ...(state ? { state_code: state } : {}) };
}

/** Printful refuses an order without these, so check before sending rather than after. */
export function assertShippableRecipient(address: PrintfulRecipientAddress): void {
  const missing = (["address1", "city", "country_code", "zip"] as const).filter((key) => !address[key]?.trim());
  if (missing.length > 0) throw new IncompleteRecipientError(missing);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNDASHED_UUID = /^[0-9a-f]{32}$/i;

/** Printful's limit on an order's `external_id`, as its API reports it: "Maximum external_id string length is 32". */
export const PRINTFUL_EXTERNAL_ID_MAX_LENGTH = 32;

/** Thrown before calling Printful when an order id cannot be made to fit its `external_id`. */
export class PrintfulExternalIdTooLongError extends Error {
  constructor(readonly orderId: string) {
    super(`Order id "${orderId}" is ${orderId.length} characters and is not a UUID. Printful accepts an external_id of at most ${PRINTFUL_EXTERNAL_ID_MAX_LENGTH}.`);
    this.name = "PrintfulExternalIdTooLongError";
  }
}

/**
 * The `external_id` Printful is given for a store order. Printful refuses
 * anything over 32 characters, and a UUID with dashes is 36, so a UUID is sent
 * without its dashes. Any id of 32 characters or fewer is sent as it is.
 */
export function printfulExternalIdFor(orderId: string): string {
  if (orderId.length <= PRINTFUL_EXTERNAL_ID_MAX_LENGTH) return orderId;
  if (UUID.test(orderId)) return orderId.replace(/-/g, "");
  throw new PrintfulExternalIdTooLongError(orderId);
}

/**
 * The store order id for an `external_id` read back from Printful: 32 hex
 * characters are taken to be a UUID sent by printfulExternalIdFor and get
 * their dashes back (8-4-4-4-12); anything else is returned unchanged.
 *
 * A store whose own order ids are 32 hex characters with no dashes would have
 * dashes added here that it never had. Such a store should not use this.
 */
export function orderIdFromPrintfulExternalId(externalId: string): string {
  if (!UNDASHED_UUID.test(externalId)) return externalId;
  return `${externalId.slice(0, 8)}-${externalId.slice(8, 12)}-${externalId.slice(12, 16)}-${externalId.slice(16, 20)}-${externalId.slice(20)}`;
}

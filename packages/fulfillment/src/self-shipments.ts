import type { ProviderOrderLinkRepository, ProviderOrderStatusOutcome, ProviderOrderStatusUpdate } from "./provider-orders.js";
import { MANUAL_FULFILLMENT_PROVIDER, type FulfillmentProviderKey } from "./types.js";

/**
 * Lines a store ships itself (the manual provider) publish the same
 * `fulfillment.order.status_changed` event a print provider's webhook does, so
 * one subscriber can send every "your order shipped" email.
 *
 * The manual provider has no order of its own to link to, so each parcel gets
 * a made-up provider order id (see selfShipmentLinkId) stored in the same
 * ProviderOrderLinkRepository under provider "manual". The status recorder then
 * treats it like any other provider order: it publishes once per change and a
 * later "delivered" for the same id finds the store order and its lines.
 *
 * This file knows nothing about @mercatus-liber/shipping. A store calls these
 * from wherever it marks lines shipped, for example the `labelRecorded` and
 * `labelVoided` hooks of shipping's createOrderLabelService.
 */

/** The part of createProviderOrderStatusRecorder's result these helpers use. */
export interface SelfShipmentStatusRecorder {
  record(provider: FulfillmentProviderKey, update: ProviderOrderStatusUpdate): Promise<ProviderOrderStatusOutcome>;
}

export interface SelfShipment {
  orderId: string;
  /** The order lines in this parcel. */
  skuIds: string[];
  trackingNumber?: string | null;
  /** A plain carrier name such as "USPS", when known. */
  carrier?: string | null;
  /** The shipping provider's id for the label (shipping's `ShippingLabel.labelId`), when a label was bought through one. */
  labelId?: string | null;
}

/**
 * The id a self-shipped parcel is linked under: the label id when there is
 * one, otherwise the tracking number, otherwise `order:<orderId>:<skuIds>`
 * (sorted, comma-joined) for a line marked shipped with neither.
 *
 * The label id comes first because it is what a void names, and because
 * Shippo's tracking webhook carries it (as `transaction`), so a later
 * "delivered" can find the link without a search by tracking number.
 */
export function selfShipmentLinkId(shipment: Pick<SelfShipment, "orderId" | "skuIds" | "trackingNumber" | "labelId">): string {
  return shipment.labelId?.trim() || shipment.trackingNumber?.trim() || `order:${shipment.orderId}:${[...shipment.skuIds].sort().join(",")}`;
}

/**
 * Records that the store shipped these lines itself, and publishes
 * `fulfillment.order.status_changed` with provider "manual", status "shipped",
 * the tracking number, the carrier and the lines' `skuIds`.
 *
 * Calling it again for the same parcel publishes nothing ("unchanged"). Lines
 * marked one at a time under one tracking number, with no label id, share a
 * link: the first call publishes with that line, and later calls only add
 * their lines to the link, so the customer gets one notice per parcel.
 */
export async function recordSelfShipment(input: SelfShipment & { links: ProviderOrderLinkRepository; recorder: SelfShipmentStatusRecorder }): Promise<ProviderOrderStatusOutcome> {
  const { links, recorder, orderId } = input;
  if (input.skuIds.length === 0) throw new Error("recordSelfShipment: name at least one order line (sku) in the parcel.");
  const externalOrderId = selfShipmentLinkId(input);

  const existing = await links.findByExternalOrderId(MANUAL_FULFILLMENT_PROVIDER, externalOrderId);
  const skuIds = existing?.orderId === orderId ? [...new Set([...existing.skuIds, ...input.skuIds])] : [...input.skuIds];
  await links.link({ orderId, provider: MANUAL_FULFILLMENT_PROVIDER, externalOrderId, skuIds });

  return recorder.record(MANUAL_FULFILLMENT_PROVIDER, { externalOrderId, status: "shipped", trackingNumber: input.trackingNumber?.trim() || null, carrier: input.carrier?.trim() || null });
}

/**
 * Records that a bought label was voided: publishes a change back to
 * "submitted" for the lines that label covered. It finds them by the label
 * id, so it only works for a shipment recorded with one; anything else returns
 * "unlinked" and publishes nothing.
 *
 * The event still carries the voided label's tracking number and carrier,
 * because the recorder keeps the last ones it was given. Read `status`, not
 * the presence of a tracking number. This does not change the manual
 * fulfillment adapter's own line record, which has no way to go back from
 * "shipped".
 */
export async function recordSelfShipmentVoided(input: { recorder: SelfShipmentStatusRecorder; labelId: string }): Promise<ProviderOrderStatusOutcome> {
  return input.recorder.record(MANUAL_FULFILLMENT_PROVIDER, { externalOrderId: input.labelId, status: "submitted", trackingNumber: null, carrier: null });
}

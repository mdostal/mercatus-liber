/**
 * Shippo's `track_updated` webhook, turned into a status update for an order
 * line the store shipped itself.
 *
 * This file only maps a body. It does not receive or authenticate anything:
 * Shippo does not sign webhooks unless the account has asked Shippo to set up
 * HMAC signing, so a store must protect its own endpoint before calling this
 * (see the README's "Tracking webhooks").
 *
 * The body shape is from docs.goshippo.com/docs/tracking/webhooks/ and
 * docs.goshippo.com/docs/tracking/tracking/, read on 2026-11-15 through a
 * fetch tool that summarises the page: top level `event`, `test`, `data`;
 * `data` is a tracking object with `carrier`, `tracking_number`,
 * `transaction`, `metadata`, `tracking_status` (`status`, `status_details`,
 * `status_date`, `substatus`, `location`), `tracking_history` and more. No
 * delivery from a live Shippo account has been seen by this repo.
 */

/**
 * A status update for @mercatus-liber/fulfillment's
 * createProviderOrderStatusRecorder. It has the fields of that package's
 * ProviderOrderStatusUpdate, written out here so this package does not depend
 * on fulfillment; pass it to `recorder.record("manual", update)` as it is.
 */
export interface ShippoTrackingUpdate {
  /** The id the shipment was linked under: Shippo's transaction id when the body has one, otherwise the tracking number. */
  externalOrderId: string;
  status: "shipped" | "delivered";
  trackingNumber: string;
  /** Always null, so the carrier name stored when the label was bought is kept (Shippo sends a token such as "usps" here, and a changed carrier would publish a second "shipped"). */
  carrier: null;
}

export class ShippoWebhookPayloadParseError extends Error {
  constructor(cause: unknown) {
    super(`Shippo webhook payload could not be read: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "ShippoWebhookPayloadParseError";
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/**
 * What a Shippo webhook body says about a self-shipped parcel, or null when it
 * says nothing new in line-status terms. Takes the raw body (string or Buffer)
 * or the already-parsed JSON; a raw body that isn't JSON throws
 * ShippoWebhookPayloadParseError.
 *
 * - Only `event: "track_updated"` is read. Other events give null.
 * - `DELIVERED` gives "delivered". `TRANSIT`, `RETURNED` and `FAILURE` give
 *   "shipped": the parcel left, and there is no line status for a return or a
 *   delivery problem. For a parcel already recorded as shipped the recorder
 *   publishes nothing for these.
 * - `PRE_TRANSIT` and `UNKNOWN` give null. The label exists but the carrier
 *   has not scanned the parcel, which is what buying the label already
 *   recorded, and a voided label must not be moved back to "shipped".
 *
 * `externalOrderId` is `data.transaction` when present. That is the id Shippo
 * gave the label purchase, which this adapter returns as
 * `ShippingLabel.labelId` and fulfillment's `recordSelfShipment` links under.
 * Shippo's docs describe the field as the related transaction id "if any" and
 * show only a placeholder value, so that it is filled in for labels bought
 * through the API is not confirmed. Without it the tracking number is used,
 * which matches a shipment that was recorded without a label id. If the
 * recorder answers "unlinked", try again with `externalOrderId` set to
 * `trackingNumber`.
 *
 * A test delivery (`test: true`) is mapped like any other; its made-up
 * tracking number matches no link, so the recorder ignores it.
 */
export function shippoTrackingUpdateFrom(body: unknown): ShippoTrackingUpdate | null {
  let payload = body;
  if (typeof body === "string" || Buffer.isBuffer(body)) {
    try {
      payload = JSON.parse(typeof body === "string" ? body : body.toString("utf-8"));
    } catch (err) {
      throw new ShippoWebhookPayloadParseError(err);
    }
  }
  if (!isObject(payload) || payload.event !== "track_updated" || !isObject(payload.data)) return null;

  const data = payload.data;
  const trackingNumber = text(data.tracking_number);
  if (!trackingNumber) return null;
  const shippoStatus = isObject(data.tracking_status) ? text(data.tracking_status.status).toUpperCase() : "";

  let status: ShippoTrackingUpdate["status"];
  if (shippoStatus === "DELIVERED") status = "delivered";
  else if (shippoStatus === "TRANSIT" || shippoStatus === "RETURNED" || shippoStatus === "FAILURE") status = "shipped";
  else return null;

  return { externalOrderId: text(data.transaction) || trackingNumber, status, trackingNumber, carrier: null };
}

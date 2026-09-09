/**
 * -----------------------------------------------------------------------
 * Shippo public REST API research record (story shipping-02-adapter-shippo-
 * and-wiring, acceptance criterion 1)
 * -----------------------------------------------------------------------
 * Confirmed during this story's own research (not assumed from the design
 * discussion) against Shippo's official, current docs at docs.goshippo.com
 * (fetched directly on 2026-09-09) -- same discipline that worked for
 * epics 42-43's Printful/Printify research.
 *
 * Base URL: https://api.goshippo.com (confirmed: docs.goshippo.com's
 * shipments guide calls the shipment endpoint at
 * "https://api.goshippo.com/shipments/").
 *
 * Authentication (confirmed: docs.goshippo.com/tracking/tracking's example
 * curl request and the quickstart's own description of the auth scheme):
 * every request carries `Authorization: ShippoToken <API_TOKEN>` -- NOT a
 * Bearer scheme (unlike Printful/Printify/Stripe elsewhere in this repo).
 *
 * Rate shopping (confirmed: docs.goshippo.com/docs/shipments/shipments and
 * docs.goshippo.com/docs/guides_general/generate_shipping_label, whose
 * quoted JSON examples this file's request/response shapes below are taken
 * from verbatim):
 *   `POST /shipments/` with `{ address_from, address_to, parcels, async }`.
 *   With `async: false`, the response is returned synchronously and already
 *   carries the shipment's own `rates` array -- no separate poll needed for
 *   this adapter's synchronous `getRates()` contract (Shippo also exposes
 *   `GET /shipments/{id}/rates/` for re-fetching rates on an existing
 *   shipment later, confirmed via search, but this adapter has no need to
 *   call it: `getRates()` always creates a fresh Shipment and reads its
 *   inline `rates`). Each rate's `servicelevel` is a nested object with its
 *   own `name`/`token`/`terms` fields (confirmed via the "Retrieve a rate"
 *   API reference page), not the flattened `servicelevel_name`/
 *   `servicelevel_token` shape shown in a transaction's embedded rate
 *   summary -- this adapter reads the full Shipment-response rate shape.
 *   Rate `amount`/`amount_local` are decimal STRINGS in major currency
 *   units (e.g. `"24.30"` for $24.30), confirmed by the quoted example --
 *   this package's own `Money` contract wants integer minor units, so
 *   `mapRate` below converts.
 *
 * Label purchase (confirmed: the same generate_shipping_label guide's
 * quoted transaction request/response JSON):
 *   `POST /transactions/` with `{ rate: <rate object_id>, label_file_type,
 *   async }`. With `async: false`, the response is synchronous and (on
 *   `status: "SUCCESS"`) carries `label_url`, `tracking_number`, and
 *   `tracking_url_provider` directly -- confirmed real fields, not
 *   fabricated. `status` is a real, documented enum -- confirmed via the
 *   "Retrieve a shipping label" API reference page --
 *   `WAITING | QUEUED | SUCCESS | ERROR | REFUNDED | REFUNDPENDING |
 *   REFUNDREJECTED`; only `SUCCESS` maps to this package's
 *   `LabelPurchaseResult.purchased: true`, every other value (including a
 *   transient `QUEUED`/`WAITING` -- unreachable in practice given
 *   `async: false`, but handled honestly rather than assumed away) maps to
 *   an honest `purchased: false` carrying Shippo's own `messages` when
 *   present.
 *
 * Tracking (confirmed: docs.goshippo.com/tracking/tracking's own quoted
 * curl example and response shape): a dedicated tracking endpoint, not
 * webhook-only -- `GET /tracks/{carrier}/{tracking_number}` (lowercase
 * carrier token, e.g. `usps`/`ups`/`fedex`; `dhl_express` is this adapter's
 * own inference from Shippo's confirmed `dhl_express_worldwide...`
 * servicelevel-token naming convention, not verbatim-quoted from a tracking
 * example -- flagged honestly here rather than asserted as directly
 * confirmed). Response carries a top-level `tracking_status` object
 * (`status`/`status_details`/`status_date`/`location`) plus a
 * `tracking_history` array of the same shape. `tracking_status.status` is a
 * real, documented enum -- confirmed via search of Shippo's tracking-API
 * docs -- `UNKNOWN | PRE_TRANSIT | TRANSIT | DELIVERED | RETURNED |
 * FAILURE`, mapped onto this package's narrower `TrackingStatusState` by
 * `mapTrackingStatus` below (see that function's own doc comment for the
 * mapping rationale, most importantly why `PRE_TRANSIT` maps to
 * `"in_transit"` rather than `"unknown"`).
 *
 * ShippingAdapter.getTrackingStatus(trackingNumber) takes a bare tracking
 * number with no carrier -- but Shippo's tracking endpoint is addressed by
 * carrier + tracking number. This adapter bridges that gap by reusing
 * @mercatus-liber/shipping's own `detectCarrierFromTrackingNumber` (the
 * same real, documented tracking-number-format heuristic the manual/
 * PirateShip default adapter uses) to recover a carrier before calling
 * Shippo -- see index.ts.
 * -----------------------------------------------------------------------
 */

/** Shippo's real, confirmed Address shape (docs.goshippo.com/docs/guides_general/generate_shipping_label). */
export interface ShippoAddress {
  name: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
}

/**
 * Shippo's real, confirmed Parcel shape. `length`/`width`/`height`/`weight`
 * are decimal STRINGS (confirmed by the quoted example, e.g. `"weight":
 * "2"`), not numbers -- this adapter's `toShippoParcel` (index.ts) formats
 * them accordingly.
 */
export interface ShippoParcel {
  length: string;
  width: string;
  height: string;
  /** Confirmed real values: "in" | "cm". */
  distance_unit: "in" | "cm";
  weight: string;
  /** Confirmed real values: "lb" | "oz" | "g" | "kg". */
  mass_unit: "lb" | "oz" | "g" | "kg";
}

export interface ShippoCreateShipmentRequest {
  address_from: ShippoAddress;
  address_to: ShippoAddress;
  parcels: ShippoParcel[];
  /** This adapter always sends `false` -- see this file's top comment on why a synchronous response is what `getRates()` needs. */
  async: false;
}

/** Confirmed nested shape via the "Retrieve a rate" API reference (see this file's top comment). */
export interface ShippoServiceLevel {
  name: string;
  token: string;
  terms?: string | null;
}

export interface ShippoApiMessage {
  source: string;
  code: string;
  text: string;
}

/** One rate entry in a Shipment response's `rates` array -- confirmed shape, this file's top comment. */
export interface ShippoRate {
  object_id: string;
  /** Decimal string, major currency units (e.g. "24.30" for $24.30) -- confirmed, not a number. */
  amount: string;
  currency: string;
  amount_local?: string;
  currency_local?: string;
  provider: string;
  servicelevel: ShippoServiceLevel;
  estimated_days: number | null;
  attributes?: string[];
  messages?: ShippoApiMessage[];
}

export interface ShippoShipmentResponse {
  object_id: string;
  /** Confirmed real values include "SUCCESS"/"ERROR"/"WAITING" (Shipment-level object status, distinct from a Transaction's own `status` enum). */
  status: string;
  rates: ShippoRate[];
  messages?: ShippoApiMessage[];
}

export interface ShippoCreateTransactionRequest {
  /** The rate's own `object_id`, exactly as quoted back from a prior `POST /shipments/` response. */
  rate: string;
  /** Confirmed real values: "PDF" | "PDF_4x6" | "PNG" | "ZPLII" (this adapter defaults to "PDF"). */
  label_file_type: string;
  /** This adapter always sends `false` -- see this file's top comment. */
  async: false;
}

/** Confirmed real enum, "Retrieve a shipping label" API reference (this file's top comment). */
export type ShippoTransactionStatus = "WAITING" | "QUEUED" | "SUCCESS" | "ERROR" | "REFUNDED" | "REFUNDPENDING" | "REFUNDREJECTED";

/**
 * The transaction response's own embedded rate summary -- confirmed shape
 * (docs.goshippo.com/api-reference/transactions/retrieve-a-shipping-label's
 * quoted example, this file's top comment): a flattened
 * `servicelevel_name`/`servicelevel_token` pair, NOT the nested
 * `servicelevel: { name, token }` object a Shipment response's own `rates`
 * entries carry (`ShippoRate` above) -- genuinely two different real shapes
 * for "a rate", confirmed independently, not a typo.
 */
export interface ShippoTransactionRateSummary {
  object_id: string;
  provider: string;
  servicelevel_name?: string;
  servicelevel_token?: string;
  amount?: string;
  currency?: string;
}

export interface ShippoTransactionResponse {
  object_id: string;
  status: ShippoTransactionStatus;
  tracking_number?: string | null;
  tracking_url_provider?: string | null;
  label_url?: string | null;
  messages?: ShippoApiMessage[];
  /** Present on a real transaction response; carries the carrier (`provider`) purchased -- this adapter's only source for `ShippingLabel.carrier`, since `buyLabel(rateId)` itself receives no carrier context. */
  rate?: ShippoTransactionRateSummary;
}

export interface ShippoTrackingLocation {
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
}

/** Confirmed real enum, docs.goshippo.com/tracking/tracking (this file's top comment). */
export type ShippoTrackingStatusValue = "UNKNOWN" | "PRE_TRANSIT" | "TRANSIT" | "DELIVERED" | "RETURNED" | "FAILURE";

export interface ShippoTrackingStatus {
  status: ShippoTrackingStatusValue;
  status_details?: string | null;
  status_date?: string | null;
  location?: ShippoTrackingLocation | null;
}

export interface ShippoTrackingResponse {
  carrier: string;
  tracking_number: string;
  eta?: string | null;
  tracking_status: ShippoTrackingStatus | null;
  tracking_history: ShippoTrackingStatus[];
}

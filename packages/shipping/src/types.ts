import type { Money } from "@mercatus-liber/core";

/**
 * A physical postal address, as either endpoint of a shipment. Deliberately
 * this package's own shape, not a re-export of checkout-orders' ShippingInfo
 * (which carries a single free-text `address` string today) -- rate shopping
 * and label purchase need real structured fields (city/state/postalCode/
 * country), and this subsystem owns them independently, the same
 * "adapters/subsystems own their own shapes, never fork or reach into
 * another subsystem's types" discipline fulfillment's OrderLookup follows
 * (see fulfillment/src/types.ts and design-discussion.md §1a).
 */
export interface ShippingAddress {
  name: string;
  company?: string | null;
  street1: string;
  street2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2 country code, e.g. "US". */
  country: string;
  phone?: string | null;
}

/** The physical package being shipped. Weight is the one field every carrier rate/label API requires; dimensions are optional (some carriers rate on weight alone for small parcels). */
export interface Parcel {
  weightOz: number;
  lengthIn?: number | null;
  widthIn?: number | null;
  heightIn?: number | null;
}

export interface GetRatesInput {
  fromAddress: ShippingAddress;
  toAddress: ShippingAddress;
  parcel: Parcel;
}

/** One real, quotable rate option from a carrier. */
export interface ShippingRate {
  /** Opaque id this adapter itself assigns/recognizes -- passed back into buyLabel() to purchase this exact quoted rate. Never a fabricated placeholder; only ever produced alongside a real quoted rate. */
  rateId: string;
  carrier: string;
  serviceLevel: string;
  amount: Money;
  /** Carrier's own estimated transit days, or null when the carrier doesn't provide one for this service level. */
  estimatedDays: number | null;
}

/**
 * getRates()'s result. A discriminated union, not a bare `ShippingRate[]` --
 * deliberate, see manual-adapter.ts's doc comment and
 * design-discussion.md §1b / this story's acceptance criteria: an adapter
 * that has no real rates to offer (the manual/PirateShip default, always;
 * any adapter, occasionally -- e.g. an unsupported route) must be able to
 * say so honestly. Returning `[]` for that case would be ambiguous ("zero
 * carriers service this route" vs. "this adapter can't quote rates at all")
 * and an empty array carries no explanation or next step for the caller --
 * exactly the kind of quiet, misleading half-truth this subsystem's design
 * explicitly rejects.
 */
export type RateQuoteResult =
  | { available: true; rates: ShippingRate[] }
  | { available: false; reason: string; instructionsUrl: string };

/** A real, purchased shipping label. */
export interface ShippingLabel {
  /** URL to the actual purchased label (PDF/PNG), fetchable/printable by the operator. */
  labelUrl: string;
  trackingNumber: string;
  trackingUrl: string | null;
  carrier: string;
}

/** buyLabel()'s result -- same discriminated-union discipline as RateQuoteResult, and for the same reason. */
export type LabelPurchaseResult =
  | { purchased: true; label: ShippingLabel }
  | { purchased: false; reason: string; instructionsUrl: string };

/**
 * Coarse tracking status. "unknown" is a first-class, honest value -- not an
 * error -- for exactly the case documented in manual-adapter.ts: this
 * subsystem has no live tracking-events API integration, so it reports what
 * it actually knows (nothing beyond "here's where to look") rather than
 * fabricating a plausible-looking timeline.
 */
export type TrackingStatusState = "unknown" | "in_transit" | "delivered" | "exception";

export interface TrackingEvent {
  timestamp: string;
  status: string;
  description: string;
  location?: string | null;
}

export interface TrackingStatus {
  status: TrackingStatusState;
  /** ISO 8601 timestamp of the last known status change, or null when there is none (never fabricated). */
  lastUpdate: string | null;
  /** Real, adapter-reported tracking events only -- empty when the adapter has none to report, never synthesized. */
  events: TrackingEvent[];
  /**
   * A real, honest link to check this tracking number directly with the
   * detected carrier (or the generic "search this yourself" affordance when
   * no carrier could be confidently detected from the number's format) --
   * not a fabricated tracking page, a real carrier tracking URL template.
   * Optional: only adapters with nothing live to report (the manual
   * default) need this; a real API-backed adapter's events/status already
   * carry the useful information.
   */
  carrierTrackingUrl?: string | null;
  /** Carrier detected from the tracking number's format, when this adapter has no live API to ask (see manual-adapter.ts). Null when undetected. */
  detectedCarrier?: string | null;
}

/**
 * The adapter interface every shipping-carrier provider implements
 * (epic shipping-rate-and-labels). Mirrors @mercatus-liber/payments'
 * PaymentAdapter and @mercatus-liber/fulfillment's FulfillmentAdapter shape:
 * a plain structural interface, no base class, every real adapter
 * (e.g. the epic's later @mercatus-liber/adapter-shippo) and the zero-infra
 * manual default implement it identically.
 */
export interface ShippingAdapter {
  /** Real, quotable rates for a shipment, or an honest "not available" result -- see RateQuoteResult. */
  getRates(input: GetRatesInput): Promise<RateQuoteResult>;
  /** Purchases the rate previously quoted as `rateId` by getRates(), or an honest "not available" result -- see LabelPurchaseResult. */
  buyLabel(rateId: string): Promise<LabelPurchaseResult>;
  /** Looks up status for a real tracking number an operator has in hand (e.g. entered by hand into fulfillment's FulfillmentLineRecord.trackingNumber -- see fulfillment/src/types.ts). Never throws for an unrecognized number; reports status "unknown" instead. */
  getTrackingStatus(trackingNumber: string): Promise<TrackingStatus>;
}

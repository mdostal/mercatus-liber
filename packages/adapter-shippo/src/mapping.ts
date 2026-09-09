import type { Money } from "@mercatus-liber/core";
import type { Parcel, ShippingAddress, TrackingEvent, TrackingStatusState } from "@mercatus-liber/shipping";
import type { ShippoAddress, ShippoParcel, ShippoRate, ShippoTrackingStatus, ShippoTrackingStatusValue } from "./shippo-types.js";

/** Real, confirmed field-for-field mapping (shippo-types.ts's ShippoAddress). No structural gap here -- every ShippingAddress field has a direct Shippo counterpart. */
export function toShippoAddress(address: ShippingAddress): ShippoAddress {
  return {
    name: address.name,
    ...(address.company ? { company: address.company } : {}),
    street1: address.street1,
    ...(address.street2 ? { street2: address.street2 } : {}),
    city: address.city,
    state: address.state,
    zip: address.postalCode,
    country: address.country,
    ...(address.phone ? { phone: address.phone } : {}),
  };
}

/**
 * Real, disclosed gap: Shippo's Parcel object requires `length`/`width`/
 * `height` (confirmed required fields, see this package's shippo-02 research
 * record) -- but @mercatus-liber/shipping's own `Parcel` type
 * (packages/shipping/src/types.ts) deliberately makes `lengthIn`/`widthIn`/
 * `heightIn` optional ("some carriers rate on weight alone for small
 * parcels"). Rather than fabricate a plausible-looking default dimension
 * (exactly the kind of dishonest guess this epic's whole design rejects,
 * mirroring adapter-printful/adapter-printify's own resolveCatalogTarget
 * throwing instead of inventing a mapping), this adapter throws a clear,
 * actionable error when a dimension is missing -- a real deployment must
 * supply real package dimensions to get a real Shippo quote.
 */
export function toShippoParcel(parcel: Parcel): ShippoParcel {
  if (parcel.lengthIn == null || parcel.widthIn == null || parcel.heightIn == null) {
    throw new Error(
      "toShippoParcel: Shippo's real Parcel object requires length/width/height, but this Parcel is missing one or " +
        `more dimensions (lengthIn=${String(parcel.lengthIn)}, widthIn=${String(parcel.widthIn)}, heightIn=${String(parcel.heightIn)}) -- ` +
        "supply real package dimensions to get a real Shippo rate quote.",
    );
  }
  return {
    length: String(parcel.lengthIn),
    width: String(parcel.widthIn),
    height: String(parcel.heightIn),
    distance_unit: "in",
    weight: String(parcel.weightOz),
    mass_unit: "oz",
  };
}

/**
 * Converts Shippo's real decimal-string `amount` (major currency units, e.g.
 * "24.30" for $24.30 -- confirmed, shippo-types.ts's top comment) into this
 * package's `Money` (integer minor units), rounding to the nearest cent
 * rather than truncating (a naive `Math.floor` would silently lose a cent on
 * some decimal-string values).
 */
export function toMoney(amountDecimalString: string, currency: string): Money {
  return { amount: Math.round(Number.parseFloat(amountDecimalString) * 100), currency };
}

/** Maps one real Shippo rate (Shipment response) to this package's `ShippingRate` shape. */
export function mapRate(rate: ShippoRate): { rateId: string; carrier: string; serviceLevel: string; amount: Money; estimatedDays: number | null } {
  return {
    rateId: rate.object_id,
    carrier: rate.provider,
    serviceLevel: rate.servicelevel.name,
    amount: toMoney(rate.amount, rate.currency),
    estimatedDays: rate.estimated_days,
  };
}

/**
 * Maps Shippo's real, confirmed `tracking_status.status` enum (`UNKNOWN |
 * PRE_TRANSIT | TRANSIT | DELIVERED | RETURNED | FAILURE` -- shippo-types.ts's
 * top comment) onto this package's narrower `TrackingStatusState` (`unknown |
 * in_transit | delivered | exception`). `PRE_TRANSIT` (label created, not
 * yet handed to the carrier) maps to `"in_transit"` rather than `"unknown"`:
 * this package's contract treats "unknown" as "no real data at all" (see
 * types.ts's doc comment), but Shippo genuinely knows the shipment exists
 * and is progressing -- `"in_transit"` is the closer honest fit of the four
 * available states, not a guess. `RETURNED`/`FAILURE` both map to
 * `"exception"` -- both are real, documented off-happy-path outcomes, and
 * this package's contract has no separate "returned" state.
 */
export function mapTrackingStatusState(status: ShippoTrackingStatusValue): TrackingStatusState {
  switch (status) {
    case "DELIVERED":
      return "delivered";
    case "TRANSIT":
    case "PRE_TRANSIT":
      return "in_transit";
    case "RETURNED":
    case "FAILURE":
      return "exception";
    case "UNKNOWN":
    default:
      return "unknown";
  }
}

/** Maps one real Shippo tracking-history entry to this package's `TrackingEvent` shape. `timestamp`/`description` fall back to empty-but-real values (never fabricated) when Shippo omits `status_date`/`status_details`. */
export function mapTrackingEvent(entry: ShippoTrackingStatus): TrackingEvent {
  const location = entry.location;
  const locationParts = location ? [location.city, location.state, location.zip, location.country].filter((part): part is string => Boolean(part)) : [];
  return {
    timestamp: entry.status_date ?? "",
    status: entry.status,
    description: entry.status_details ?? "",
    location: locationParts.length > 0 ? locationParts.join(", ") : null,
  };
}

/**
 * Shippo's real, confirmed lowercase tracking carrier tokens for the four
 * carrier names @mercatus-liber/shipping's own
 * `detectCarrierFromTrackingNumber` (manual-adapter.ts) can detect --
 * `usps`/`ups`/`fedex` directly confirmed via Shippo's tracking docs;
 * `dhl_express` is this adapter's own inference from Shippo's confirmed
 * `dhl_express_worldwide...` servicelevel-token naming convention (flagged
 * honestly, not asserted as directly quoted -- see shippo-types.ts's top
 * comment).
 */
const CARRIER_TOKEN_BY_DETECTED_NAME: Record<string, string> = {
  UPS: "ups",
  FedEx: "fedex",
  USPS: "usps",
  DHL: "dhl_express",
};

/** Returns Shippo's own lowercase carrier token for a carrier name detected by `detectCarrierFromTrackingNumber`, or `null` if that name has no known Shippo token (defensive -- every name that function can return has one today). */
export function toShippoCarrierToken(detectedCarrierName: string): string | null {
  return CARRIER_TOKEN_BY_DETECTED_NAME[detectedCarrierName] ?? null;
}

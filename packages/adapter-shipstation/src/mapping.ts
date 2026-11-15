import type { Money } from "@mercatus-liber/core";
import type { Parcel, ShippingAddress, ShippingRate, TrackingEvent, TrackingStatusState } from "@mercatus-liber/shipping";
import type {
  ShipStationAddress,
  ShipStationError,
  ShipStationMonetaryValue,
  ShipStationPackage,
  ShipStationRate,
  ShipStationTrackEvent,
  ShipStationTrackingStatusCode,
} from "./shipstation-types.js";

/**
 * ShippingAddress -> ShipStation `shipping_address`.
 *
 * The spec marks `phone` as required on both `ship_to` and `ship_from`, but
 * this package's ShippingAddress makes it optional. Rather than send a
 * made-up phone number, this throws a clear error so the caller supplies a
 * real one. Not verified against a live account: whether ShipStation rejects
 * a rate request without a phone is untested; the spec says it is required.
 *
 * `address_residential_indicator` is also required; ShippingAddress has no
 * such field, so this sends `"unknown"`, the spec's own default value.
 */
export function toShipStationAddress(address: ShippingAddress, role: "ship_to" | "ship_from"): ShipStationAddress {
  if (!address.phone || address.phone.trim() === "") {
    throw new Error(
      `toShipStationAddress: ShipStation's ${role} address requires a phone number (the v2 OpenAPI spec lists phone as required), but none was given for "${address.name}". Supply a real phone number; this adapter will not invent one.`,
    );
  }
  return {
    name: address.name,
    phone: address.phone,
    ...(address.company ? { company_name: address.company } : {}),
    address_line1: address.street1,
    ...(address.street2 ? { address_line2: address.street2 } : {}),
    city_locality: address.city,
    state_province: address.state,
    postal_code: address.postalCode,
    country_code: address.country,
    address_residential_indicator: "unknown",
  };
}

/**
 * Parcel -> ShipStation `package`. Weight goes in ounces (`unit: "ounce"`).
 * Dimensions are optional in ShipStation's `package`, but when sent all of
 * length/width/height are required, so they are sent only when all three
 * are present. A partial set throws instead of being quietly dropped, since
 * dropping it would change what the carrier rates.
 */
export function toShipStationPackage(parcel: Parcel): ShipStationPackage {
  const dims = [parcel.lengthIn, parcel.widthIn, parcel.heightIn];
  const given = dims.filter((value) => value != null).length;
  if (given !== 0 && given !== 3) {
    throw new Error(
      `toShipStationPackage: give all of lengthIn/widthIn/heightIn or none (got lengthIn=${String(parcel.lengthIn)}, widthIn=${String(parcel.widthIn)}, heightIn=${String(parcel.heightIn)}).`,
    );
  }
  return {
    package_code: "package",
    weight: { value: parcel.weightOz, unit: "ounce" },
    ...(given === 3 ? { dimensions: { unit: "inch" as const, length: parcel.lengthIn!, width: parcel.widthIn!, height: parcel.heightIn! } } : {}),
  };
}

/** Decimal major units -> integer minor units, rounded to the nearest cent. Currency is upper-cased to ISO 4217 form (ShipStation's examples use "usd"). Assumes a 2-decimal currency, same as adapter-shippo. */
export function toMoney(value: ShipStationMonetaryValue): Money {
  return { amount: Math.round(value.amount * 100), currency: value.currency.toUpperCase() };
}

/**
 * The rate's total price. The rate-shopping guide says "the total rate is
 * the sum of" shipping, insurance, confirmation and other amounts, and the
 * spec describes each as "should be added with" the other three. Each part
 * is converted to cents before summing so float error doesn't accumulate.
 */
export function rateTotal(rate: ShipStationRate): Money {
  const parts = [rate.shipping_amount, rate.insurance_amount, rate.confirmation_amount, rate.other_amount].filter(
    (part): part is ShipStationMonetaryValue => part != null,
  );
  const currency = rate.shipping_amount.currency.toUpperCase();
  for (const part of parts) {
    if (part.currency.toUpperCase() !== currency) {
      throw new Error(`rateTotal: rate ${rate.rate_id} mixes currencies (${currency} and ${part.currency.toUpperCase()}); refusing to add them.`);
    }
  }
  return { amount: parts.reduce((sum, part) => sum + toMoney(part).amount, 0), currency };
}

export function mapRate(rate: ShipStationRate): ShippingRate {
  return {
    rateId: rate.rate_id,
    carrier: rate.carrier_friendly_name || rate.carrier_code,
    serviceLevel: rate.service_type,
    amount: rateTotal(rate),
    estimatedDays: rate.delivery_days ?? null,
  };
}

/**
 * ShipStation `status_code` -> TrackingStatusState. The tracking guide
 * (https://docs.shipstation.com/tracking) maps IT and NY to the label status
 * `in_transit`, DE to `delivered`, SP to `delivered_to_service_point`, EX to
 * `error` and UN to `unknown`; AC and AT have no label equivalent there.
 *
 * - AC (Accepted): the carrier has the package, so `in_transit`.
 * - SP (Delivered To Collection Location): `delivered`, the closest of the
 *   four states this package offers.
 * - AT (Delivery Attempt): `exception`. A failed attempt needs someone to act,
 *   and this package has no separate "attempted" state. This one is this
 *   adapter's judgement call, not something ShipStation's docs state.
 */
export function mapTrackingStatusCode(code: ShipStationTrackingStatusCode | null | undefined): TrackingStatusState {
  switch (code) {
    case "AC":
    case "IT":
    case "NY":
      return "in_transit";
    case "DE":
    case "SP":
      return "delivered";
    case "EX":
    case "AT":
      return "exception";
    case "UN":
    default:
      return "unknown";
  }
}

export function mapTrackEvent(event: ShipStationTrackEvent): TrackingEvent {
  const locationParts = [event.city_locality, event.state_province, event.postal_code, event.country_code].filter(
    (part): part is string => typeof part === "string" && part.length > 0,
  );
  return {
    timestamp: event.occurred_at ?? event.carrier_occurred_at ?? "",
    status: event.status_code ?? event.event_code ?? "",
    description: event.description ?? event.status_description ?? "",
    location: locationParts.length > 0 ? locationParts.join(", ") : null,
  };
}

/** The latest `occurred_at` among the events, or null when there are none. The docs don't state the events' order, so this doesn't assume one. */
export function latestEventTime(events: ShipStationTrackEvent[]): string | null {
  let latest: { iso: string; ms: number } | null = null;
  for (const event of events) {
    const iso = event.occurred_at;
    if (!iso) continue;
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) continue;
    if (!latest || ms > latest.ms) latest = { iso, ms };
  }
  return latest?.iso ?? null;
}

/** " -- msg1; msg2" from ShipStation's `errors[]`, or "" when there are none. */
export function formatErrors(errors: ShipStationError[] | undefined): string {
  if (!errors || errors.length === 0) return "";
  return " -- " + errors.map((error) => (error.error_code ? `${error.error_code}: ${error.message}` : error.message)).join("; ");
}

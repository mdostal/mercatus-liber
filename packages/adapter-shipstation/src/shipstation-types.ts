/**
 * -----------------------------------------------------------------------
 * ShipStation API v2 research record
 * -----------------------------------------------------------------------
 * Every shape below comes from ShipStation's own published OpenAPI
 * description for "ShipStation API v2 (2.0.0)", downloaded on 2026-11-15
 * from https://docs.shipstation.com/_bundle/apis/@shipstation-v2/openapi.json,
 * cross-checked against the guide pages linked next to each type. Nothing
 * here is from memory; fields this adapter doesn't read are left out.
 *
 * Base URL: `https://api.shipstation.com` (the spec's only `servers` entry,
 * "Production"). Paths below all start with `/v2/`.
 *
 * Auth: an `API-Key` header on every request (the spec's `api_keys` security
 * scheme is `type: apiKey, in: header`; the header is spelled `API-Key` in
 * https://docs.shipstation.com/authentication). Keys prefixed `TEST_` are
 * ShipStation API sandbox keys and use the same base URL.
 *
 * Endpoints used:
 *   GET  /v2/carriers                  list_carriers           (carrier ids for rating)
 *   POST /v2/rates                     calculate_rates         (getRates)
 *   POST /v2/labels/rates/{rate_id}    create_label_from_rate  (buyLabel)
 *   PUT  /v2/labels/{label_id}/void    void_label              (voidLabel)
 *   GET  /v2/labels/{label_id}/track   get_tracking_log_from_label (getTrackingStatusForLabel)
 *
 * Not used: GET /v2/tracking (get_tracking_log), which looks a package up by
 * `carrier_code` + `tracking_number`. Its endpoint-access table lists only
 * the ShipStation API Advanced and Enterprise plans (not ShipStation API
 * Free, and no ShipStation platform plan), and it needs a carrier this
 * adapter would have to guess from the number's format. See index.ts.
 * -----------------------------------------------------------------------
 */

/** `monetary_value`: `amount` is a decimal number in major units; `currency` is ISO 4217 (the docs' examples use lowercase, e.g. "usd"). */
export interface ShipStationMonetaryValue {
  currency: string;
  amount: number;
}

/**
 * `shipping_address` / `shipping_address_to`. The spec marks `name`, `phone`,
 * `address_line1`, `city_locality`, `state_province`, `postal_code`,
 * `country_code` and `address_residential_indicator` as required.
 */
export interface ShipStationAddress {
  name: string;
  phone: string;
  company_name?: string | null;
  address_line1: string;
  address_line2?: string | null;
  city_locality: string;
  state_province: string;
  postal_code: string;
  /** Two-letter ISO 3166-1 country code. */
  country_code: string;
  address_residential_indicator: "unknown" | "yes" | "no";
}

/** `weight`: `unit` enum is `pound | ounce | gram | kilogram`. */
export interface ShipStationWeight {
  value: number;
  unit: "pound" | "ounce" | "gram" | "kilogram";
}

/** `dimensions`: `unit` enum is `inch | centimeter`; all four fields required when the object is sent. */
export interface ShipStationDimensions {
  unit: "inch" | "centimeter";
  length: number;
  width: number;
  height: number;
}

/** `package`: only `weight` is required. `package_code: "package"` means a custom or unknown package type. */
export interface ShipStationPackage {
  package_code?: string;
  weight: ShipStationWeight;
  dimensions?: ShipStationDimensions;
}

/** The inline-shipment form of `calculate_rates_request_body` (https://docs.shipstation.com/rate-shopping, "Find Rates with Shipment Details"). */
export interface ShipStationCalculateRatesRequest {
  rate_options: {
    /** Required, `minItems: 1`: "you'll always need the carrier_ids" (rate-shopping guide). */
    carrier_ids: string[];
  };
  shipment: {
    validate_address?: "no_validation" | "validate_only" | "validate_and_clean";
    ship_to: ShipStationAddress;
    ship_from: ShipStationAddress;
    packages: ShipStationPackage[];
  };
}

/** `error` (error_response_body.errors[]). */
export interface ShipStationError {
  error_source?: string;
  error_type?: string;
  error_code?: string;
  message: string;
}

/** `error_response_body`, returned with HTTP 400/404/500. */
export interface ShipStationErrorResponse {
  request_id?: string;
  errors?: ShipStationError[];
}

/** One `rate` in `rate_response.rates`. */
export interface ShipStationRate {
  rate_id: string;
  carrier_id: string;
  carrier_code: string;
  carrier_friendly_name: string;
  service_type: string;
  service_code: string;
  /** The rate-shopping guide: the total rate is the sum of shipping, insurance, confirmation and other amounts. */
  shipping_amount: ShipStationMonetaryValue;
  insurance_amount: ShipStationMonetaryValue;
  confirmation_amount: ShipStationMonetaryValue;
  other_amount: ShipStationMonetaryValue;
  delivery_days?: number | null;
  error_messages?: string[];
  warning_messages?: string[];
}

/** `rates_information`. `status` enum is `working | completed | partial | error`. */
export interface ShipStationRatesInformation {
  rates?: ShipStationRate[];
  invalid_rates?: ShipStationRate[];
  rate_request_id?: string;
  shipment_id?: string;
  status?: "working" | "completed" | "partial" | "error";
  errors?: ShipStationError[];
}

/** `calculate_rates_response_body` (required: `rate_response`). */
export interface ShipStationCalculateRatesResponse {
  shipment_id?: string;
  rate_response: ShipStationRatesInformation;
}

/** `label_format` enum. The spec's default is `pdf`. */
export type ShipStationLabelFormat = "pdf" | "png" | "zpl";

/** `create_label_from_rate_request_body`. Every field is optional. */
export interface ShipStationCreateLabelFromRateRequest {
  label_format?: ShipStationLabelFormat;
  label_layout?: "4x6" | "letter";
  label_download_type?: "url" | "inline";
}

/** `label_download`: URLs per format, plus `href` for the requested format. */
export interface ShipStationLabelDownload {
  href?: string;
  pdf?: string;
  png?: string;
  zpl?: string;
}

/** `label_status` enum: `processing | completed | error | voided`. */
export type ShipStationLabelStatus = "processing" | "completed" | "error" | "voided";

/** `label` (create_label_from_rate_response_body). */
export interface ShipStationLabel {
  label_id: string;
  status: ShipStationLabelStatus;
  shipment_id?: string;
  tracking_number?: string | null;
  tracking_url?: string | null;
  carrier_id?: string;
  carrier_code?: string;
  service_code?: string;
  label_format?: ShipStationLabelFormat;
  label_download?: ShipStationLabelDownload | null;
  voided?: boolean;
}

/** `reason_code` enum on a void response that was not approved. */
export type ShipStationVoidReasonCode =
  | "unknown"
  | "unspecified"
  | "validation_failed"
  | "label_not_found_within_void_period"
  | "label_already_used"
  | "label_already_voided"
  | "contact_carrier";

/** `void_label_response_body` (required: `approved`, `message`). https://docs.shipstation.com/void-labels */
export interface ShipStationVoidLabelResponse {
  approved: boolean;
  message: string;
  voided_label_ids?: number[];
  reason_code?: ShipStationVoidReasonCode;
}

/** `tracking_status_code` enum (https://docs.shipstation.com/tracking, "Tracking Status Codes"). */
export type ShipStationTrackingStatusCode = "UN" | "AC" | "IT" | "DE" | "EX" | "AT" | "NY" | "SP";

/** `track_event`. */
export interface ShipStationTrackEvent {
  occurred_at?: string | null;
  carrier_occurred_at?: string | null;
  description?: string | null;
  city_locality?: string | null;
  state_province?: string | null;
  postal_code?: string | null;
  country_code?: string | null;
  event_code?: string | null;
  status_code?: ShipStationTrackingStatusCode | null;
  status_description?: string | null;
}

/** `tracking_information` (get_tracking_log_from_label_response_body). */
export interface ShipStationTrackingInformation {
  tracking_number: string;
  tracking_url?: string | null;
  status_code: ShipStationTrackingStatusCode;
  status_description?: string | null;
  carrier_code?: string | null;
  estimated_delivery_date?: string | null;
  actual_delivery_date?: string | null;
  exception_description?: string | null;
  events: ShipStationTrackEvent[];
}

/** `carrier` (list_carriers_response_body.carriers[]), fields this adapter reads. */
export interface ShipStationCarrier {
  carrier_id: string;
  carrier_code?: string;
  friendly_name?: string;
  /** "The carrier is disabled by the current ShipStation account's billing plan." */
  disabled_by_billing_plan?: boolean;
  /** "The carrier provides rates for the shipment." */
  send_rates?: boolean;
}

/** `list_carriers_response_body` (paged: `page`, `pages`). */
export interface ShipStationListCarriersResponse {
  carriers: ShipStationCarrier[];
  total?: number;
  page?: number;
  pages?: number;
}

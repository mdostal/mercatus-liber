import { detectCarrierFromTrackingNumber } from "@mercatus-liber/shipping";
import type { GetRatesInput, LabelPurchaseResult, LabelVoidResult, RateQuoteResult, ShippingAdapter, TrackingStatus } from "@mercatus-liber/shipping";
import { createShipStationHttpClient, ShipStationApiError, type ShipStationHttpClient } from "./http-client.js";
import { formatErrors, latestEventTime, mapRate, mapTrackEvent, mapTrackingStatusCode, toShipStationAddress, toShipStationPackage } from "./mapping.js";
import type { ShipStationLabelFormat, ShipStationRate } from "./shipstation-types.js";

export * from "./shipstation-types.js";
export { createShipStationHttpClient, SHIPSTATION_DEFAULT_BASE_URL, ShipStationApiError, type ShipStationHttpClient, type ShipStationHttpClientConfig } from "./http-client.js";
export * from "./mapping.js";

/** ShipStation's web app (the API Settings page linked from https://docs.shipstation.com/authentication lives here). Shown as `instructionsUrl` on honest "not available" results. */
export const SHIPSTATION_APP_URL = "https://ship.shipstation.com";

/** The rate-shopping guide's "Requirements" section, which explains carrier ids. */
export const SHIPSTATION_RATES_DOCS_URL = "https://docs.shipstation.com/rate-shopping";

export interface ShipStationShippingAdapterConfig {
  /** ShipStation v2 API key (read it from SHIPSTATION_API_KEY). Sent only as the `API-Key` header; never logged or put in error messages. */
  apiKey: string;
  /** Defaults to https://api.shipstation.com. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Test/advanced injection point; bypasses apiKey/baseUrl/fetchImpl when given. */
  httpClient?: ShipStationHttpClient;
  /** `label_format` for purchased labels. Defaults to "pdf", the spec's default and the format the docs recommend. */
  labelFormat?: ShipStationLabelFormat;
  /**
   * Carrier ids (`se-...`) to rate against. POST /v2/rates requires at least
   * one. When omitted, getRates() lists the account's carriers with
   * GET /v2/carriers on every call and uses every carrier that is not
   * `disabled_by_billing_plan` and doesn't have `send_rates: false`.
   */
  carrierIds?: string[];
  /** Where "not available" results send the operator. Defaults to SHIPSTATION_APP_URL. */
  instructionsUrl?: string;
}

/** ShippingAdapter plus the optional voidLabel, plus a label-id tracking lookup ShipStation supports and the base interface has no slot for. */
export interface ShipStationShippingAdapter extends ShippingAdapter {
  voidLabel(labelId: string): Promise<LabelVoidResult>;
  /** Tracking by ShipStation label id via GET /v2/labels/{label_id}/track. Use ShippingLabel.labelId from buyLabel(). */
  getTrackingStatusForLabel(labelId: string): Promise<TrackingStatus>;
}

/** HTTP 400/404 are ShipStation's documented request/business-rule failures (error_response_body). Everything else non-2xx (401, 403, 429, 5xx) is thrown. */
function isRequestRejection(error: unknown): error is ShipStationApiError {
  return error instanceof ShipStationApiError && (error.status === 400 || error.status === 404);
}

function describeInvalidRates(invalid: ShipStationRate[] | undefined): string {
  if (!invalid || invalid.length === 0) return "";
  const messages = invalid.flatMap((rate) => (rate.error_messages ?? []).map((message) => `${rate.carrier_friendly_name || rate.carrier_code} ${rate.service_type}: ${message}`));
  return messages.length > 0 ? ` -- invalid rates: ${messages.join("; ")}` : "";
}

/**
 * ShippingAdapter backed by ShipStation API v2 (api.shipstation.com/v2). Built
 * from the published OpenAPI spec and guides (see shipstation-types.ts for
 * the research record), tested against fakes, and never called against a
 * live ShipStation account.
 *
 * getRates: POST /v2/rates with an inline shipment. Requires carrier ids,
 * either from config.carrierIds or GET /v2/carriers. Zero rates, zero usable
 * carriers, or an HTTP 400/404 come back as `available: false` with
 * ShipStation's own messages.
 *
 * buyLabel: POST /v2/labels/rates/{rate_id}. Only `status: "completed"` is a
 * purchase. `processing` and `error` come back as `purchased: false`, and so
 * does an HTTP 400/404 (e.g. an unknown rate id or insufficient funds).
 *
 * getTrackingStatus(trackingNumber): always `status: "unknown"` with no API
 * call. ShipStation's tracking-by-number endpoint (GET /v2/tracking) takes a
 * `carrier_code`, which a bare tracking number doesn't carry, and its access
 * table lists only ShipStation API Advanced/Enterprise plans. This adapter
 * won't guess a carrier for a live lookup. It does return the carrier
 * tracking link from the shipping package's format detection, same as the
 * manual adapter. Use getTrackingStatusForLabel(labelId) for a real lookup.
 *
 * voidLabel: PUT /v2/labels/{label_id}/void. `approved: true` -> voided,
 * with `pending: true`, because the void guide says the refund is "in most
 * cases" instant but "can take up to 28 days", and the response doesn't say
 * which. `approved: false` or HTTP 400/404 -> `voided: false` with
 * ShipStation's message and reason_code.
 */
export function createShipStationShippingAdapter(config: ShipStationShippingAdapterConfig): ShipStationShippingAdapter {
  const client =
    config.httpClient ??
    createShipStationHttpClient({
      apiKey: config.apiKey,
      ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
      ...(config.fetchImpl !== undefined ? { fetchImpl: config.fetchImpl } : {}),
    });
  const labelFormat: ShipStationLabelFormat = config.labelFormat ?? "pdf";
  const instructionsUrl = config.instructionsUrl ?? SHIPSTATION_APP_URL;

  async function resolveCarrierIds(): Promise<string[]> {
    if (config.carrierIds && config.carrierIds.length > 0) return config.carrierIds;
    const carriers = await client.listCarriers();
    return carriers.filter((carrier) => carrier.disabled_by_billing_plan !== true && carrier.send_rates !== false).map((carrier) => carrier.carrier_id);
  }

  return {
    async getRates(input: GetRatesInput): Promise<RateQuoteResult> {
      const shipment = {
        validate_address: "no_validation" as const,
        ship_to: toShipStationAddress(input.toAddress, "ship_to"),
        ship_from: toShipStationAddress(input.fromAddress, "ship_from"),
        packages: [toShipStationPackage(input.parcel)],
      };

      const carrierIds = await resolveCarrierIds();
      if (carrierIds.length === 0) {
        return {
          available: false,
          reason: "ShipStation has no carrier on this account that can be rated (GET /v2/carriers returned none that are enabled and send rates). Connect a carrier in ShipStation, or set carrierIds.",
          instructionsUrl: SHIPSTATION_RATES_DOCS_URL,
        };
      }

      let response;
      try {
        response = await client.calculateRates({ rate_options: { carrier_ids: carrierIds }, shipment });
      } catch (error) {
        if (isRequestRejection(error)) {
          return {
            available: false,
            reason: `ShipStation rejected the rate request (HTTP ${error.status})${formatErrors(error.errors)}.`,
            instructionsUrl,
          };
        }
        throw error;
      }

      const rateResponse = response.rate_response;
      const rates = rateResponse.rates ?? [];
      if (rates.length === 0) {
        return {
          available: false,
          reason: `ShipStation returned no rates (rate_response.status: ${rateResponse.status ?? "missing"})${formatErrors(rateResponse.errors)}${describeInvalidRates(rateResponse.invalid_rates)} -- the connected carriers may not serve this route or package.`,
          instructionsUrl,
        };
      }

      return { available: true, rates: rates.map(mapRate) };
    },

    async buyLabel(rateId: string): Promise<LabelPurchaseResult> {
      let label;
      try {
        label = await client.createLabelFromRate(rateId, { label_format: labelFormat, label_download_type: "url" });
      } catch (error) {
        if (isRequestRejection(error)) {
          return {
            purchased: false,
            reason: `ShipStation did not create a label for rate ${rateId} (HTTP ${error.status})${formatErrors(error.errors)}.`,
            instructionsUrl,
          };
        }
        throw error;
      }

      if (label.status !== "completed") {
        const extra = label.status === "processing" ? " The label exists but isn't finished; check it in ShipStation before buying again so you aren't charged twice." : "";
        return {
          purchased: false,
          reason: `ShipStation label ${label.label_id} for rate ${rateId} has status "${label.status}", not "completed".${extra}`,
          instructionsUrl,
        };
      }

      const download = label.label_download ?? {};
      const labelUrl = download[labelFormat] ?? download.href;
      if (!labelUrl || !label.tracking_number) {
        throw new Error(`buyLabel: ShipStation label ${label.label_id} is "completed" but has no label_download URL or tracking_number; refusing to make them up.`);
      }
      if (!label.carrier_code) {
        throw new Error(`buyLabel: ShipStation label ${label.label_id} is "completed" but has no carrier_code; refusing to make up the carrier.`);
      }

      return {
        purchased: true,
        label: {
          labelUrl,
          trackingNumber: label.tracking_number,
          trackingUrl: label.tracking_url ?? null,
          carrier: label.carrier_code,
          labelId: label.label_id,
        },
      };
    },

    async getTrackingStatus(trackingNumber: string): Promise<TrackingStatus> {
      const detected = detectCarrierFromTrackingNumber(trackingNumber);
      return { status: "unknown", lastUpdate: null, events: [], detectedCarrier: detected?.carrier ?? null, carrierTrackingUrl: detected?.url ?? null };
    },

    async getTrackingStatusForLabel(labelId: string): Promise<TrackingStatus> {
      const info = await client.getLabelTracking(labelId);
      if (!info) {
        return { status: "unknown", lastUpdate: null, events: [], carrierTrackingUrl: null, detectedCarrier: null };
      }
      return {
        status: mapTrackingStatusCode(info.status_code),
        lastUpdate: latestEventTime(info.events ?? []) ?? info.actual_delivery_date ?? null,
        events: (info.events ?? []).map(mapTrackEvent),
        carrierTrackingUrl: info.tracking_url ?? null,
        detectedCarrier: info.carrier_code ?? null,
      };
    },

    async voidLabel(labelId: string): Promise<LabelVoidResult> {
      let response;
      try {
        response = await client.voidLabel(labelId);
      } catch (error) {
        if (isRequestRejection(error)) {
          return { voided: false, reason: `ShipStation could not void label ${labelId} (HTTP ${error.status})${formatErrors(error.errors)}.` };
        }
        throw error;
      }

      if (!response.approved) {
        return {
          voided: false,
          reason: `ShipStation did not approve voiding label ${labelId}${response.reason_code ? ` (${response.reason_code})` : ""}: ${response.message || "no message given"}`,
        };
      }
      return { voided: true, pending: true };
    },
  };
}

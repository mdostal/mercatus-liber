import { detectCarrierFromTrackingNumber } from "@mercatus-liber/shipping";
import type { GetRatesInput, LabelPurchaseResult, LabelVoidResult, RateQuoteResult, ShippingAdapter, TrackingStatus } from "@mercatus-liber/shipping";
import { createShippoHttpClient, ShippoApiError, type ShippoHttpClient } from "./http-client.js";
import { mapRate, mapTrackingEvent, mapTrackingStatusState, toShippoAddress, toShippoCarrierToken, toShippoParcel } from "./mapping.js";
import type { ShippoApiMessage } from "./shippo-types.js";

export * from "./shippo-types.js";
export { ShippoApiError, type ShippoHttpClient, type ShippoHttpClientConfig } from "./http-client.js";
export * from "./mapping.js";
export * from "./webhook.js";

/**
 * Real link to Shippo's real, live web dashboard -- never a placeholder --
 * shown to the operator wherever this adapter reports an honest "not
 * available" result (a Shipment/Transaction that genuinely didn't succeed,
 * confirmed via Shippo's own real API response, not this adapter guessing).
 * Confirmed via research (this file's shippo-types.ts top comment).
 */
export const SHIPPO_DASHBOARD_URL = "https://apps.goshippo.com";

export interface ShippoShippingAdapterConfig {
  apiToken: string;
  /** Defaults to Shippo's real, confirmed base URL -- see http-client.ts. */
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Test/advanced-use injection point: bypasses `apiToken`/`baseUrl`/`fetchImpl` entirely when supplied. */
  httpClient?: ShippoHttpClient;
  /** Defaults to "PDF" -- Shippo's real, confirmed `label_file_type` values also include "PDF_4x6"/"PNG"/"ZPLII" (shippo-types.ts). */
  labelFileType?: string;
}

function formatMessages(messages: ShippoApiMessage[] | undefined): string {
  if (!messages || messages.length === 0) return "";
  return " -- " + messages.map((message) => `${message.source}: ${message.text}`).join("; ");
}

/**
 * Real, deployed ShippingAdapter (@mercatus-liber/shipping) implementation
 * backed by Shippo's real, current REST API (see shippo-types.ts's top doc
 * comment for the full research record this implementation is grounded in,
 * confirmed against docs.goshippo.com on 2026-09-09).
 *
 * `getRates` -- creates a real, synchronous (`async: false`) Shippo
 * Shipment via `POST /shipments/` and reads back its real, confirmed
 * `rates` array. Honestly reports `available: false` (never a fabricated
 * empty-looking success) when Shippo's own Shipment object didn't reach
 * `status: "SUCCESS"` or came back with zero rates (e.g. an unsupported
 * route -- see types.ts's `RateQuoteResult` doc comment for why this
 * package's contract distinguishes that from "this adapter can't quote
 * rates at all").
 *
 * `buyLabel` -- purchases the previously-quoted `rateId` via a real,
 * synchronous `POST /transactions/`. Only `status: "SUCCESS"` maps to
 * `purchased: true`; every other real, documented status (`WAITING` /
 * `QUEUED` / `ERROR` / `REFUNDED` / `REFUNDPENDING` / `REFUNDREJECTED`)
 * honestly reports `purchased: false` with Shippo's own `messages` folded
 * into `reason` when present, never fabricating a label.
 *
 * `getTrackingStatus` -- bridges this package's carrier-less
 * `getTrackingStatus(trackingNumber)` contract onto Shippo's real
 * carrier-addressed `GET /tracks/{carrier}/{tracking_number}` endpoint by
 * reusing @mercatus-liber/shipping's own `detectCarrierFromTrackingNumber`
 * (the same real, documented tracking-number-format heuristic the manual/
 * PirateShip default adapter uses) -- see mapping.ts's
 * `toShippoCarrierToken`. When no carrier can be confidently detected, or
 * Shippo has no record for the number (a real 404), this honestly falls
 * back to `status: "unknown"` with no live API call fabricated -- same
 * honesty discipline as the manual adapter, just with a real API genuinely
 * consulted first when possible.
 *
 * No live Shippo account/token exists in this environment (design-
 * discussion.md's "Real credential gate", same disclosed pattern as epics
 * 27/42/43/46) -- this adapter is built and unit-tested for real
 * correctness against Shippo's actual, current API shape, not exercised
 * against a live API in this environment.
 */
export function createShippoShippingAdapter(config: ShippoShippingAdapterConfig): ShippingAdapter {
  const client = config.httpClient ?? createShippoHttpClient({ apiToken: config.apiToken, ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}), ...(config.fetchImpl !== undefined ? { fetchImpl: config.fetchImpl } : {}) });
  const labelFileType = config.labelFileType ?? "PDF";
  // The carrier of each rate this instance quoted, so a bought label can name its carrier without another request.
  const quotedCarriers = new Map<string, string>();

  /**
   * The carrier of a bought label. Shippo's real transaction response gives
   * only the rate's id, so this looks in three places: the response itself
   * (the documented object form), what getRates quoted, then `GET /rates/{id}`.
   * It never throws: by this point the label is bought and paid for, and
   * losing it over a missing carrier name would be worse than reporting
   * "unknown".
   */
  async function carrierOf(rate: string | { provider?: string } | undefined, rateId: string, trackingNumber: string): Promise<string> {
    if (typeof rate === "object" && rate?.provider) return rate.provider;
    const quoted = quotedCarriers.get(rateId);
    if (quoted) return quoted;
    try {
      const fetched = await client.getRate?.(rateId);
      if (fetched?.provider) return fetched.provider;
    } catch {
      // Fall through: the label is bought either way.
    }
    return detectCarrierFromTrackingNumber(trackingNumber)?.carrier ?? "unknown";
  }

  return {
    async getRates(input: GetRatesInput): Promise<RateQuoteResult> {
      const shipment = await client.createShipment({
        address_from: toShippoAddress(input.fromAddress),
        address_to: toShippoAddress(input.toAddress),
        parcels: [toShippoParcel(input.parcel)],
        async: false,
      });

      if (shipment.status !== "SUCCESS" || shipment.rates.length === 0) {
        return {
          available: false,
          reason: `Shippo shipment ${shipment.object_id} returned no usable rates (status: ${shipment.status})${formatMessages(shipment.messages)} -- this route may not be serviced by any carrier on this account, or the account may need configuration.`,
          instructionsUrl: SHIPPO_DASHBOARD_URL,
        };
      }

      for (const rate of shipment.rates) quotedCarriers.set(rate.object_id, rate.provider);
      return { available: true, rates: shipment.rates.map(mapRate) };
    },

    async buyLabel(rateId: string): Promise<LabelPurchaseResult> {
      const transaction = await client.createTransaction({ rate: rateId, label_file_type: labelFileType, async: false });

      if (transaction.status !== "SUCCESS") {
        return {
          purchased: false,
          reason: `Shippo transaction ${transaction.object_id} did not succeed (status: ${transaction.status})${formatMessages(transaction.messages)}.`,
          instructionsUrl: SHIPPO_DASHBOARD_URL,
        };
      }

      if (!transaction.label_url || !transaction.tracking_number) {
        // Structurally unreachable given Shippo's own documented contract (a SUCCESS transaction always carries
        // both), kept as a guard against trusting an inconsistent real API response rather than fabricating values.
        throw new Error(`buyLabel: Shippo transaction ${transaction.object_id} reported status SUCCESS but omitted label_url/tracking_number -- refusing to fabricate them.`);
      }
      return {
        purchased: true,
        label: {
          labelUrl: transaction.label_url,
          trackingNumber: transaction.tracking_number,
          trackingUrl: transaction.tracking_url_provider ?? null,
          carrier: await carrierOf(transaction.rate, rateId, transaction.tracking_number),
          labelId: transaction.object_id,
        },
      };
    },

    async voidLabel(labelId: string): Promise<LabelVoidResult> {
      let refund;
      try {
        refund = await client.createRefund({ transaction: labelId, async: false });
      } catch (err) {
        if (err instanceof ShippoApiError && err.status >= 400 && err.status < 500) {
          return { voided: false, reason: `Shippo refused the refund for transaction ${labelId} (HTTP ${err.status}).` };
        }
        throw err;
      }
      if (refund.status === "ERROR") {
        return { voided: false, reason: `Shippo refund ${refund.object_id} for transaction ${labelId} failed (status: ERROR).` };
      }
      return { voided: true, pending: refund.status !== "SUCCESS" };
    },

    async getTrackingStatus(trackingNumber: string): Promise<TrackingStatus> {
      const detected = detectCarrierFromTrackingNumber(trackingNumber);
      const carrierToken = detected ? toShippoCarrierToken(detected.carrier) : null;

      if (!detected || !carrierToken) {
        // No confidently-detected carrier -- Shippo's tracking endpoint requires one, so no live call is made
        // (never guessed). Same honest "nothing live to report" shape as the manual adapter.
        return { status: "unknown", lastUpdate: null, events: [], detectedCarrier: detected?.carrier ?? null, carrierTrackingUrl: detected?.url ?? null };
      }

      let response;
      try {
        response = await client.getTrackingStatus(carrierToken, trackingNumber);
      } catch (err) {
        // Shippo refused the lookup. With a test token it does so for every real carrier
        // ('usps is not a valid test tracking carrier. Please use 'shippo'', HTTP 400, seen 2026-11-16).
        // A refusal is "nothing to report", not a failure of the caller's request; a 5xx or a network error still throws.
        if (!(err instanceof ShippoApiError && err.status >= 400 && err.status < 500)) throw err;
        response = null;
      }
      if (!response) {
        return { status: "unknown", lastUpdate: null, events: [], detectedCarrier: detected.carrier, carrierTrackingUrl: detected.url };
      }

      return {
        status: response.tracking_status ? mapTrackingStatusState(response.tracking_status.status) : "unknown",
        lastUpdate: response.tracking_status?.status_date ?? null,
        events: response.tracking_history.map(mapTrackingEvent),
        detectedCarrier: detected.carrier,
      };
    },
  };
}

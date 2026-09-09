import { detectCarrierFromTrackingNumber } from "@mercatus-liber/shipping";
import type { GetRatesInput, LabelPurchaseResult, RateQuoteResult, ShippingAdapter, TrackingStatus } from "@mercatus-liber/shipping";
import { createShippoHttpClient, type ShippoHttpClient } from "./http-client.js";
import { mapRate, mapTrackingEvent, mapTrackingStatusState, toShippoAddress, toShippoCarrierToken, toShippoParcel } from "./mapping.js";
import type { ShippoApiMessage } from "./shippo-types.js";

export * from "./shippo-types.js";
export { ShippoApiError, type ShippoHttpClient, type ShippoHttpClientConfig } from "./http-client.js";
export * from "./mapping.js";

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
      if (!transaction.rate?.provider) {
        throw new Error(`buyLabel: Shippo transaction ${transaction.object_id} reported status SUCCESS but omitted rate.provider -- refusing to fabricate the label's carrier.`);
      }

      return {
        purchased: true,
        label: {
          labelUrl: transaction.label_url,
          trackingNumber: transaction.tracking_number,
          trackingUrl: transaction.tracking_url_provider ?? null,
          carrier: transaction.rate.provider,
        },
      };
    },

    async getTrackingStatus(trackingNumber: string): Promise<TrackingStatus> {
      const detected = detectCarrierFromTrackingNumber(trackingNumber);
      const carrierToken = detected ? toShippoCarrierToken(detected.carrier) : null;

      if (!detected || !carrierToken) {
        // No confidently-detected carrier -- Shippo's tracking endpoint requires one, so no live call is made
        // (never guessed). Same honest "nothing live to report" shape as the manual adapter.
        return { status: "unknown", lastUpdate: null, events: [], detectedCarrier: detected?.carrier ?? null, carrierTrackingUrl: detected?.url ?? null };
      }

      const response = await client.getTrackingStatus(carrierToken, trackingNumber);
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

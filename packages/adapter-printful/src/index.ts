import type { FulfillmentAdapter, FulfillmentLineRecord, FulfillmentProviderKey, SubmitFulfillmentOrderInput } from "@mercatus-liber/fulfillment";
import { createPrintfulHttpClient, type PrintfulHttpClient } from "./http-client.js";
import { findTrackingUrlForItem, mapPrintfulOrderStatus, mapRecipientToPrintfulAddress, type PrintfulCatalogTarget, type PrintfulRecipientAddress } from "./mapping.js";
import type { PrintfulCatalogOrderItemInput, PrintfulOrderResponse, PrintfulShipmentResponse } from "./printful-types.js";
import { parsePrintfulWebhookPayload, PrintfulWebhookSignatureInvalidError, PrintfulWebhookSignatureUnconfirmedError, verifyPrintfulSignature, type PrintfulWebhookEvent } from "./webhook.js";

export * from "./printful-types.js";
export * from "./mapping.js";
export { PrintfulApiError, type PrintfulHttpClient } from "./http-client.js";
export {
  parsePrintfulWebhookPayload,
  verifyPrintfulSignature,
  PrintfulWebhookPayloadParseError,
  PrintfulWebhookSignatureInvalidError,
  PrintfulWebhookSignatureUnconfirmedError,
  type PrintfulWebhookEvent,
} from "./webhook.js";

/** The provider key this adapter registers itself under in a FulfillmentService's `adapters` map (see design-discussion.md and fulfillment's own test suite, which already uses this exact string as its example third-party provider key). */
export const PRINTFUL_PROVIDER: FulfillmentProviderKey = "printful";

export interface PrintfulFulfillmentAdapterConfig {
  apiToken: string;
  /** Required only for an account-level (not store-level) API token -- see http-client.ts. */
  storeId?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Test/advanced-use injection point: bypasses `apiToken`/`storeId`/`baseUrl`/`fetchImpl` entirely when supplied. */
  httpClient?: PrintfulHttpClient;

  /**
   * Resolves `orderId` to a real shipping address -- the fallback bridge used
   * only when `SubmitFulfillmentOrderInput.recipient` (dp-01/epic 82) is
   * absent. Originally required because `SubmitFulfillmentOrderInput` carried
   * no address at all; now that `FulfillmentService.submitOrder` (service.ts,
   * `@mercatus-liber/fulfillment`) actually populates `input.recipient` from
   * `OrderLookup.getOrder()`'s own `shippingInfo`, `submitOrder` below prefers
   * that real data (mapped via `mapRecipientToPrintfulAddress`, mapping.ts)
   * and only falls back to calling this when a caller's `OrderLookup`
   * implementation has no address to report. Still required (not optional)
   * so every existing caller of this config keeps compiling unchanged.
   */
  resolveRecipient(orderId: string): Promise<PrintfulRecipientAddress>;

  /**
   * Resolves `skuId` to the real Printful catalog variant (+ design placements)
   * to order. Required because Printful's confirmed v2 order-item schema
   * addresses a line by a Printful-assigned `catalog_variant_id`, not an
   * arbitrary caller-assigned SKU string -- see mapping.ts's
   * `PrintfulCatalogTarget` doc comment.
   */
  resolveCatalogTarget(skuId: string): Promise<PrintfulCatalogTarget>;

  /**
   * The webhook configuration's own secret key, hex-encoded exactly as
   * `POST /v2/webhooks` returned it at setup time (re-confirmed live
   * 2026-10-15, dp-02/epic 82 -- see webhook.ts's `verifyPrintfulSignature`
   * doc comment). When supplied (and `verifyWebhookSignature` is not),
   * `handleWebhookEvent` verifies the real `x-pf-webhook-signature` header
   * using Printful's now-confirmed HMAC-SHA256 scheme by default, mirroring
   * adapter-printify's own `webhookSecret` config field.
   */
  webhookSecretKeyHex?: string;

  /**
   * Overrides the default `webhookSecretKeyHex`-based verifier entirely --
   * useful for a rotated/multi-configuration setup, or if the residual gap
   * `verifyPrintfulSignature`'s doc comment discloses (exactly which bytes
   * Printful signs is inferred, not spelled out verbatim in their docs) ever
   * turns out wrong for a live account. If neither this nor
   * `webhookSecretKeyHex` is supplied, `handleWebhookEvent` fails closed with
   * `PrintfulWebhookSignatureUnconfirmedError` rather than trusting an
   * unverified payload.
   */
  verifyWebhookSignature?(rawBody: string | Buffer, signature: string): boolean | Promise<boolean>;

  /** Invoked with the parsed, signature-verified webhook event -- e.g. to notify the host application of a shipment update. Optional: a verified-but-unhandled webhook is not an error. */
  onWebhookEvent?(event: PrintfulWebhookEvent): void | Promise<void>;
}

function toPrintfulOrderItems(items: SubmitFulfillmentOrderInput["items"], targets: Map<string, PrintfulCatalogTarget>): PrintfulCatalogOrderItemInput[] {
  return items.map((item) => {
    const target = targets.get(item.skuId);
    if (!target) {
      // Structurally unreachable given how submitOrder below populates `targets` (one entry per input item), kept as a guard against a future refactor silently dropping an entry.
      throw new Error(`No resolved Printful catalog target for skuId "${item.skuId}"`);
    }
    return {
      source: "catalog",
      catalog_variant_id: target.catalogVariantId,
      quantity: item.quantity,
      external_id: item.skuId,
      ...(target.retailPrice !== undefined ? { retail_price: target.retailPrice } : {}),
      ...(target.name !== undefined ? { name: target.name } : {}),
      ...(target.placements !== undefined ? { placements: target.placements } : {}),
    };
  });
}

function buildRecordsFromOrder(orderId: string, order: PrintfulOrderResponse, shipments: PrintfulShipmentResponse[]): FulfillmentLineRecord[] {
  const status = mapPrintfulOrderStatus(order.status, shipments);
  return order.order_items.map((item) => ({
    orderId,
    skuId: item.external_id ?? `pf-item-${item.id}`,
    provider: PRINTFUL_PROVIDER,
    externalOrderId: String(order.id),
    status,
    trackingNumber: null, // confirmed absent from Printful's real v2 Shipment schema -- see mapping.ts
    trackingUrl: findTrackingUrlForItem(shipments, item.id),
  }));
}

/**
 * Real, deployed FulfillmentAdapter (subsystem 41) implementation backed by
 * Printful's real v2 order API (see printful-types.ts's top doc comment for the
 * full research record this implementation is grounded in).
 *
 * `submitOrder` -- draft-then-confirm, per the addendum's own confirmed flow and
 * this story's description: `POST /v2/orders` creates an uncharged draft,
 * `POST /v2/orders/{id}/confirmation` moves it to production and charges the
 * merchant's prepaid Wallet (addendum's own confirmed billing model). Both
 * calls happen inside this single `submitOrder` call because
 * `FulfillmentAdapter`'s contract (epic 41) has no separate "confirm" step of
 * its own.
 *
 * `getOrderStatus` -- polls `GET /v2/orders/@{orderId}` (using our own orderId
 * as Printful's real `external_id`, confirmed field, set at submit time) plus
 * `GET /v2/orders/{orderId}/shipments` for delivery/tracking facts Printful's
 * `Order` resource itself doesn't carry.
 *
 * `handleWebhookEvent` -- real event-type parsing for the four real, documented
 * v2 event types this story names, gated behind a caller-supplied
 * `verifyWebhookSignature` (see `PrintfulWebhookSignatureUnconfirmedError`).
 *
 * No live Printful account/token exists in this environment (design-discussion.md's
 * "Real credential gate", same disclosed pattern as epics 27/46) -- this adapter is
 * built and unit-tested for real correctness against Printful's actual, current API
 * shape, not exercised against a live API in this environment.
 */
export function createPrintfulFulfillmentAdapter(config: PrintfulFulfillmentAdapterConfig): FulfillmentAdapter {
  const client =
    config.httpClient ??
    createPrintfulHttpClient({
      apiToken: config.apiToken,
      ...(config.storeId !== undefined ? { storeId: config.storeId } : {}),
      ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
      ...(config.fetchImpl !== undefined ? { fetchImpl: config.fetchImpl } : {}),
    });

  return {
    async submitOrder(input: SubmitFulfillmentOrderInput): Promise<FulfillmentLineRecord[]> {
      // Real recipient data (dp-01/dp-02, epic 82) is now preferred over the
      // resolveRecipient bridge whenever the caller's OrderLookup actually
      // supplied one -- see mapRecipientToPrintfulAddress's doc comment
      // (mapping.ts) and this config's resolveRecipient doc comment above.
      const recipient = input.recipient ? mapRecipientToPrintfulAddress(input.recipient) : await config.resolveRecipient(input.orderId);

      const targets = new Map<string, PrintfulCatalogTarget>();
      for (const item of input.items) {
        targets.set(item.skuId, await config.resolveCatalogTarget(item.skuId));
      }

      const draft = await client.createOrder({
        external_id: input.orderId,
        recipient,
        order_items: toPrintfulOrderItems(input.items, targets),
      });

      const confirmed = await client.confirmOrder(draft.data.id);

      return buildRecordsFromOrder(input.orderId, confirmed.data, []);
    },

    async getOrderStatus(orderId: string): Promise<FulfillmentLineRecord[]> {
      const orderEnvelope = await client.getOrder(`@${orderId}`);
      if (!orderEnvelope) return [];

      const shipmentsEnvelope = await client.getShipments(`@${orderId}`);
      return buildRecordsFromOrder(orderId, orderEnvelope.data, shipmentsEnvelope.data);
    },

    async handleWebhookEvent(rawBody: string | Buffer, signature: string): Promise<void> {
      let isValid: boolean;
      if (config.verifyWebhookSignature) {
        isValid = await config.verifyWebhookSignature(rawBody, signature);
      } else if (config.webhookSecretKeyHex) {
        isValid = verifyPrintfulSignature(config.webhookSecretKeyHex, rawBody, signature);
      } else {
        throw new PrintfulWebhookSignatureUnconfirmedError();
      }
      if (!isValid) {
        throw new PrintfulWebhookSignatureInvalidError();
      }

      const event = parsePrintfulWebhookPayload(rawBody);
      await config.onWebhookEvent?.(event);
    },
  };
}

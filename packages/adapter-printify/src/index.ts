import type { FulfillmentAdapter, FulfillmentLineRecord, FulfillmentProviderKey, SubmitFulfillmentOrderInput } from "@mercatus-liber/fulfillment";
import { createPrintifyHttpClient, type PrintifyHttpClient } from "./http-client.js";
import { findTrackingForLineItem, mapPrintifyLineItemStatus, resolveSkuId, type PrintifyCatalogTarget, type PrintifyRecipientAddress } from "./mapping.js";
import type { PrintifyOrderResponse, PrintifyProductLineItemInput } from "./printify-types.js";
import {
  parsePrintifyWebhookPayload,
  PrintifyWebhookSignatureInvalidError,
  PrintifyWebhookSignatureNotConfiguredError,
  verifyPrintifySignature,
  type PrintifyWebhookEvent,
} from "./webhook.js";

export * from "./printify-types.js";
export * from "./mapping.js";
export { PrintifyApiError, DEFAULT_PRINTIFY_USER_AGENT, type PrintifyHttpClient } from "./http-client.js";
export {
  parsePrintifyWebhookPayload,
  verifyPrintifySignature,
  PrintifyWebhookPayloadParseError,
  PrintifyWebhookSignatureInvalidError,
  PrintifyWebhookSignatureNotConfiguredError,
  type PrintifyWebhookEvent,
} from "./webhook.js";

/** The provider key this adapter registers itself under in a FulfillmentService's `adapters` map (mirrors adapter-printful's own `PRINTFUL_PROVIDER` convention, and fulfillment's own test suite's example third-party provider key shape). */
export const PRINTIFY_PROVIDER: FulfillmentProviderKey = "printify";

export interface PrintifyFulfillmentAdapterConfig {
  apiToken: string;
  /** Required -- real Printify accounts can have multiple shops, no auto-discovery (design-discussion.md §1b). */
  shopId: string;
  baseUrl?: string;
  /** Defaults to DEFAULT_PRINTIFY_USER_AGENT -- see http-client.ts. Every request this adapter builds carries a User-Agent header (Printify's confirmed requirement, printify-types.ts's top comment). */
  userAgent?: string;
  fetchImpl?: typeof fetch;
  /** Test/advanced-use injection point: bypasses `apiToken`/`shopId`/`baseUrl`/`userAgent`/`fetchImpl` entirely when supplied. */
  httpClient?: PrintifyHttpClient;

  /**
   * Resolves `orderId` to a real shipping address. Required because
   * `SubmitFulfillmentOrderInput` (epic 41's contract) carries no address at
   * all -- see mapping.ts's `PrintifyRecipientAddress` doc comment for why
   * this bridge has to live here rather than in `OrderLookup`.
   */
  resolveRecipient(orderId: string): Promise<PrintifyRecipientAddress>;

  /**
   * Resolves `skuId` to the real Printify catalog product/variant to order.
   * Required because Printify's confirmed v1 order-item schema addresses a
   * line by a Printify-assigned `product_id` + `variant_id`, not an
   * arbitrary caller-assigned SKU string -- see mapping.ts's
   * `PrintifyCatalogTarget` doc comment.
   */
  resolveCatalogTarget(skuId: string): Promise<PrintifyCatalogTarget>;

  /**
   * Resolves our own `orderId` to Printify's own order id (the string
   * `submitOrder` received back from `POST /v1/shops/{shop_id}/orders.json`
   * and stored on the returned `FulfillmentLineRecord.externalOrderId`),
   * or `null` if this adapter never submitted that order. Required for
   * `getOrderStatus` because Printify's real, confirmed
   * `GET /v1/shops/{shop_id}/orders/{order_id}.json` addresses an order by
   * PRINTIFY'S OWN id -- unlike Printful's confirmed `@external_id` lookup
   * trick (adapter-printful's http-client.ts), Printify's docs show no
   * equivalent "look this order up by the external_id I submitted" endpoint
   * (see printify-types.ts's top comment, finding 1's disclosed follow-up).
   * A host application is expected to persist `externalOrderId` from
   * `submitOrder`'s return value and hand it back here -- the same
   * "narrow contract, host bridges the rest" shape as `resolveRecipient`/
   * `resolveCatalogTarget` above.
   */
  resolveExternalOrderId(orderId: string): Promise<string | null>;

  /**
   * The webhook subscription's own `secret` (set via `POST
   * /v1/shops/{shop_id}/webhooks.json`'s real, confirmed `secret` field) --
   * when supplied, `handleWebhookEvent` verifies `X-Pfy-Signature` using
   * Printify's real, confirmed HMAC-SHA256 scheme (`verifyPrintifySignature`,
   * webhook.ts). Ignored if `verifyWebhookSignature` is also supplied.
   */
  webhookSecret?: string;

  /**
   * Overrides the default `webhookSecret`-based verifier entirely -- useful
   * for a rotated/multi-secret setup. If neither this nor `webhookSecret` is
   * supplied, `handleWebhookEvent` fails closed with
   * `PrintifyWebhookSignatureNotConfiguredError` rather than trusting an
   * unverified payload.
   */
  verifyWebhookSignature?(rawBody: string | Buffer, signature: string): boolean | Promise<boolean>;

  /** Invoked with the parsed, signature-verified webhook event -- e.g. to notify the host application of a shipment update. Optional: a verified-but-unhandled webhook is not an error. */
  onWebhookEvent?(event: PrintifyWebhookEvent): void | Promise<void>;
}

function toPrintifyLineItems(items: SubmitFulfillmentOrderInput["items"], targets: Map<string, PrintifyCatalogTarget>): PrintifyProductLineItemInput[] {
  return items.map((item) => {
    const target = targets.get(item.skuId);
    if (!target) {
      // Structurally unreachable given how submitOrder below populates `targets` (one entry per input item), kept as a guard against a future refactor silently dropping an entry.
      throw new Error(`No resolved Printify catalog target for skuId "${item.skuId}"`);
    }
    return {
      product_id: target.productId,
      variant_id: target.variantId,
      quantity: item.quantity,
      external_id: item.skuId,
    };
  });
}

function buildRecordsFromOrder(orderId: string, order: PrintifyOrderResponse): FulfillmentLineRecord[] {
  const shipments = order.shipments ?? [];
  return order.line_items.map((item, index) => {
    const tracking = findTrackingForLineItem(shipments);
    return {
      orderId,
      skuId: resolveSkuId(item, index),
      provider: PRINTIFY_PROVIDER,
      externalOrderId: order.id,
      status: mapPrintifyLineItemStatus(item.status, shipments),
      trackingNumber: tracking.trackingNumber,
      trackingUrl: tracking.trackingUrl,
    };
  });
}

/**
 * Real, deployed FulfillmentAdapter (subsystem 41) implementation backed by
 * Printify's real, current v1 order API (see printify-types.ts's top doc
 * comment for the full research record this implementation is grounded in,
 * fetched directly from developers.printify.com's raw HTML on 2026-09-09).
 *
 * `submitOrder` -- create-then-send-to-production, mirroring Printful's own
 * draft-then-confirm shape for the analogous reason: `POST
 * /v1/shops/{shop_id}/orders.json` creates the order UNCHARGED (`pending`/
 * `on-hold`), `POST /v1/shops/{shop_id}/orders/{order_id}/send_to_production.json`
 * moves it to production and is the real point Printify charges the merchant
 * (design-discussion.md's confirmed billing model). Both calls happen inside
 * this single `submitOrder` call because `FulfillmentAdapter`'s contract
 * (epic 41) has no separate "confirm"/"send to production" step of its own.
 *
 * `getOrderStatus` -- resolves our own `orderId` to Printify's own order id
 * via the required `resolveExternalOrderId` bridge (see its doc comment for
 * why this adapter needs one, unlike adapter-printful), then polls `GET
 * /v1/shops/{shop_id}/orders/{orderId}.json` for the real, current per-line
 * `status` and shipment/tracking facts.
 *
 * `handleWebhookEvent` -- real event-type parsing for the five real,
 * documented order-lifecycle event types this story names, verified against
 * Printify's real, CONFIRMED `X-Pfy-Signature` HMAC-SHA256 scheme (genuinely
 * different posture than adapter-printful's fail-closed-with-no-default: see
 * webhook.ts's doc comments).
 *
 * No live Printify account/token exists in this environment (design-discussion.md's
 * "Real credential gate", same disclosed pattern as epics 27/42/46) -- this adapter is
 * built and unit-tested for real correctness against Printify's actual, current API
 * shape, not exercised against a live API in this environment.
 */
export function createPrintifyFulfillmentAdapter(config: PrintifyFulfillmentAdapterConfig): FulfillmentAdapter {
  const client =
    config.httpClient ??
    createPrintifyHttpClient({
      apiToken: config.apiToken,
      shopId: config.shopId,
      ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
      ...(config.userAgent !== undefined ? { userAgent: config.userAgent } : {}),
      ...(config.fetchImpl !== undefined ? { fetchImpl: config.fetchImpl } : {}),
    });

  return {
    async submitOrder(input: SubmitFulfillmentOrderInput): Promise<FulfillmentLineRecord[]> {
      const recipient = await config.resolveRecipient(input.orderId);

      const targets = new Map<string, PrintifyCatalogTarget>();
      for (const item of input.items) {
        targets.set(item.skuId, await config.resolveCatalogTarget(item.skuId));
      }

      const draft = await client.createOrder({
        external_id: input.orderId,
        line_items: toPrintifyLineItems(input.items, targets),
        address_to: recipient,
      });

      const production = await client.sendToProduction(draft.id);

      return buildRecordsFromOrder(input.orderId, production);
    },

    async getOrderStatus(orderId: string): Promise<FulfillmentLineRecord[]> {
      const printifyOrderId = await config.resolveExternalOrderId(orderId);
      if (!printifyOrderId) return [];

      const order = await client.getOrder(printifyOrderId);
      if (!order) return [];

      return buildRecordsFromOrder(orderId, order);
    },

    async handleWebhookEvent(rawBody: string | Buffer, signature: string): Promise<void> {
      let isValid: boolean;
      if (config.verifyWebhookSignature) {
        isValid = await config.verifyWebhookSignature(rawBody, signature);
      } else if (config.webhookSecret) {
        isValid = verifyPrintifySignature(config.webhookSecret, rawBody, signature);
      } else {
        throw new PrintifyWebhookSignatureNotConfiguredError();
      }

      if (!isValid) {
        throw new PrintifyWebhookSignatureInvalidError();
      }

      const event = parsePrintifyWebhookPayload(rawBody);
      await config.onWebhookEvent?.(event);
    },
  };
}

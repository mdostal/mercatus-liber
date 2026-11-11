import type { FulfillmentAdapter, FulfillmentLineRecord, SubmitFulfillmentOrderInput } from "@mercatus-liber/fulfillment";
import { InvalidCatalogMappingError, requireCatalogTarget, type ProviderCatalogMappingRepository } from "@mercatus-liber/fulfillment";
import { createSlant3dHttpClient, type Slant3dHttpClient } from "./http-client.js";
import { assertShippableRecipient, buildSlant3dLineRecords, mapRecipientToSlant3d, type Slant3dCatalogTarget, type Slant3dRecipient } from "./mapping.js";
import { SLANT3D_PROVIDER } from "./provider.js";
import {
  parseSlant3dWebhookPayload,
  Slant3dWebhookSignatureInvalidError,
  Slant3dWebhookSignatureNotConfiguredError,
  verifySlant3dWebhook,
  type Slant3dWebhookEvent,
} from "./webhook.js";

export * from "./slant3d-types.js";
export * from "./catalog.js";
export * from "./products.js";
export * from "./mapping.js";
export * from "./webhook.js";
export { createSlant3dHttpClient, DEFAULT_SLANT3D_BASE_URL, Slant3dApiError, type Slant3dDraftOrderResult, type Slant3dHttpClient, type Slant3dHttpClientConfig } from "./http-client.js";
export { SLANT3D_PROVIDER };

export interface Slant3dFulfillmentAdapterConfig {
  /** A Slant API key ("sl-..."). */
  apiKey: string;
  /** The Slant platform orders are created under. Its webhook URL and secret are the ones that apply. */
  platformId: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Used instead of apiKey, baseUrl and fetchImpl when supplied. */
  httpClient?: Slant3dHttpClient;

  /** Resolves a SKU to the uploaded file and filament to print it in. See slant3dCatalogTargetsFrom. */
  resolveCatalogTarget(skuId: string): Promise<Slant3dCatalogTarget>;

  /** Loads the shipping address for an order. Only called when the order arrives without a recipient. */
  resolveRecipient?(orderId: string): Promise<Slant3dRecipient>;

  /**
   * Resolves an order id to the Slant order id (`externalOrderId` on the
   * records submitOrder returned), or null if the order was never sent. Slant
   * has no lookup by a caller's own order id, so getOrderStatus needs this.
   * Without it the adapter only knows the orders this instance submitted, and
   * forgets them when the process restarts.
   */
  resolveExternalOrderId?(orderId: string): Promise<string | null>;

  /**
   * Leaves new orders as drafts at Slant instead of processing them, so nothing
   * is charged or printed until the draft is processed. Use it for testing
   * against a real account. Defaults to false.
   */
  holdOrders?: boolean;

  /** The platform's webhook secret. With it, handleWebhookEvent verifies the signature and the timestamp's age. */
  webhookSecret?: string;
  /** How old a webhook's timestamp may be, in milliseconds. Defaults to 5 minutes. */
  webhookToleranceMs?: number;
  /** Replaces the webhookSecret check. Receives the combined signature string (see slant3dWebhookSignatureFrom). */
  verifyWebhookSignature?(rawBody: string | Buffer, signature: string): boolean | Promise<boolean>;
  /** Called with each verified webhook, e.g. to record a tracking number. */
  onWebhookEvent?(event: Slant3dWebhookEvent): void | Promise<void>;
  /** The clock used for webhook timestamps. Defaults to Date.now. */
  now?(): number;
}

/** Thrown when a draft was created but processing it failed. The draft still exists at Slant under `publicOrderId`. */
export class Slant3dOrderProcessError extends Error {
  constructor(
    readonly orderId: string,
    readonly publicOrderId: string,
    override readonly cause: unknown,
  ) {
    super(`Slant 3D drafted order ${publicOrderId} for order ${orderId} but could not process it: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "Slant3dOrderProcessError";
  }
}

export interface Slant3dFulfillmentAdapter extends FulfillmentAdapter {
  handleWebhookEvent(rawBody: string | Buffer, signature: string): Promise<void>;
  /** Processes a held draft by its Slant order id: charges it and queues it for printing. */
  processHeldOrder(publicOrderId: string): Promise<void>;
  /** Cancels an order by its Slant order id. Slant refunds it. */
  cancelOrder(publicOrderId: string): Promise<void>;
}

/**
 * A FulfillmentAdapter that has Slant 3D print and ship orders.
 *
 * submitOrder drafts the order (POST /orders), then processes it
 * (POST /orders/{publicId}), which is when Slant charges and queues it. With
 * `holdOrders` it stops after the draft and reports the lines as "held".
 *
 * getOrderStatus reads the order back from Slant; the adapter stores no line
 * records of its own, like the Printful and Printify adapters.
 *
 * handleWebhookEvent expects `signature` to be the two signing headers joined
 * by slant3dWebhookSignatureFrom, verifies them, and passes the parsed event
 * to `onWebhookEvent`.
 *
 * Built from Slant's published spec and docs and tested against a fake fetch.
 * It has not been run against a live Slant account.
 */
export function createSlant3dFulfillmentAdapter(config: Slant3dFulfillmentAdapterConfig): Slant3dFulfillmentAdapter {
  const client =
    config.httpClient ??
    createSlant3dHttpClient({
      apiKey: config.apiKey,
      ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
      ...(config.fetchImpl !== undefined ? { fetchImpl: config.fetchImpl } : {}),
    });

  /** Orders this instance submitted: order id -> Slant order id and the SKU of each item, in order. */
  const submitted = new Map<string, { publicOrderId: string; skuIds: string[] }>();

  return {
    async submitOrder(input: SubmitFulfillmentOrderInput): Promise<FulfillmentLineRecord[]> {
      const recipient = input.recipient ? mapRecipientToSlant3d(input.recipient) : await config.resolveRecipient?.(input.orderId);
      const { email, address } = assertShippableRecipient(recipient ?? { address: {} });

      const items = [];
      for (const item of input.items) {
        const target = await config.resolveCatalogTarget(item.skuId);
        // SKU is how a line is matched back to its SKU when the order is read later.
        items.push({ type: "PRINT" as const, publicFileServiceId: target.fileId, filamentId: target.filamentId, quantity: item.quantity, SKU: item.skuId });
      }
      const skuIds = input.items.map((item) => item.skuId);

      const draft = await client.draftOrder({
        platformId: config.platformId,
        customer: { platformId: config.platformId, details: { email, address } },
        items,
        // Lets the order be traced back to the store's from Slant's side.
        metadata: { storeOrderId: input.orderId },
      });
      submitted.set(input.orderId, { publicOrderId: draft.order.publicId, skuIds });

      if (config.holdOrders) return buildSlant3dLineRecords(input.orderId, draft.order, skuIds);

      let processed;
      try {
        processed = await client.processOrder(draft.order.publicId);
      } catch (err) {
        throw new Slant3dOrderProcessError(input.orderId, draft.order.publicId, err);
      }
      return buildSlant3dLineRecords(input.orderId, processed, skuIds);
    },

    async getOrderStatus(orderId: string): Promise<FulfillmentLineRecord[]> {
      const remembered = submitted.get(orderId);
      const publicOrderId = (await config.resolveExternalOrderId?.(orderId)) ?? remembered?.publicOrderId ?? null;
      if (!publicOrderId) return [];

      const order = await client.getOrder(publicOrderId);
      if (!order) return [];
      return buildSlant3dLineRecords(orderId, order, remembered?.publicOrderId === publicOrderId ? remembered.skuIds : []);
    },

    async handleWebhookEvent(rawBody: string | Buffer, signature: string): Promise<void> {
      let isValid: boolean;
      if (config.verifyWebhookSignature) {
        isValid = await config.verifyWebhookSignature(rawBody, signature);
      } else if (config.webhookSecret) {
        isValid = verifySlant3dWebhook(config.webhookSecret, rawBody, signature, {
          nowMs: (config.now ?? Date.now)(),
          ...(config.webhookToleranceMs !== undefined ? { toleranceMs: config.webhookToleranceMs } : {}),
        });
      } else {
        throw new Slant3dWebhookSignatureNotConfiguredError();
      }
      if (!isValid) throw new Slant3dWebhookSignatureInvalidError();

      await config.onWebhookEvent?.(parseSlant3dWebhookPayload(rawBody));
    },

    async processHeldOrder(publicOrderId: string): Promise<void> {
      await client.processOrder(publicOrderId);
    },

    async cancelOrder(publicOrderId: string): Promise<void> {
      await client.cancelOrder(publicOrderId);
    },
  };
}

/**
 * A `resolveCatalogTarget` that reads stored mappings (see
 * @mercatus-liber/fulfillment's ProviderCatalogMappingRepository), checking each
 * has a file id and a filament id.
 */
export function slant3dCatalogTargetsFrom(repository: ProviderCatalogMappingRepository): (skuId: string) => Promise<Slant3dCatalogTarget> {
  return async (skuId) => {
    const target = await requireCatalogTarget(repository, skuId, SLANT3D_PROVIDER);
    if (typeof target.fileId !== "string" || !target.fileId) throw new InvalidCatalogMappingError(skuId, SLANT3D_PROVIDER, "fileId must be a non-empty string");
    if (typeof target.filamentId !== "string" || !target.filamentId) throw new InvalidCatalogMappingError(skuId, SLANT3D_PROVIDER, "filamentId must be a non-empty string");
    return { fileId: target.fileId, filamentId: target.filamentId };
  };
}

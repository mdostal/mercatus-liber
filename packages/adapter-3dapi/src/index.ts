import type { FulfillmentAdapter, FulfillmentLineRecord, SubmitFulfillmentOrderInput } from "@mercatus-liber/fulfillment";
import { InvalidCatalogMappingError, requireCatalogTarget, type ProviderCatalogMappingRepository } from "@mercatus-liber/fulfillment";
import { createDapiHttpClient, DapiApiError, type DapiHttpClient } from "./http-client.js";
import type { DapiOrder, DapiOrderItem } from "./dapi-types.js";
import {
  assertShippableRecipient,
  dapiIdempotencyKeyForOrder,
  dapiReferenceForOrder,
  mapDapiOrderStatus,
  mapRecipientToDapi,
  parseDapiCatalogTarget,
  toDapiOrderLine,
  type DapiCatalogTarget,
  type DapiRecipient,
} from "./mapping.js";
import { DAPI_PROVIDER } from "./provider.js";
import {
  createInMemoryDapiWebhookEventStore,
  DapiWebhookSignatureInvalidError,
  DapiWebhookSignatureNotConfiguredError,
  DapiWebhookTimestampError,
  parseDapiWebhookPayload,
  parseDapiWebhookSignature,
  verifyDapiSignature,
  type DapiWebhookEvent,
  type DapiWebhookEventStore,
} from "./webhook.js";

export * from "./dapi-types.js";
export * from "./catalog.js";
export * from "./products.js";
export * from "./mapping.js";
export * from "./webhook.js";
export { createDapiHttpClient, DAPI_DEFAULT_BASE_URL, type DapiHttpClient, type DapiHttpClientConfig, type DapiRequestOptions } from "./http-client.js";
export { DAPI_PROVIDER, DapiApiError };

/** One line of a 3DAPI order, as much as is needed to work out which SKU it is. */
export interface DapiOrderLineIdentity {
  orderId: string;
  quoteId: string;
  /** The line's catalog material ids, in slot order. */
  materialIds: string[];
  quantity: number;
}

export interface DapiFulfillmentAdapterConfig {
  /** An integrator API key with the `orders:read` and `orders:write` scopes. */
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Replaces the client built from `apiKey`, `baseUrl` and `fetchImpl`. */
  httpClient?: DapiHttpClient;

  /** Loads the shipping details for an order. Only used when the order arrives without a recipient. */
  resolveRecipient?(orderId: string): Promise<DapiRecipient>;

  /** Says which quote and materials a SKU is printed from. See `dapiCatalogTargetsFrom`. */
  resolveCatalogTarget(skuId: string): Promise<DapiCatalogTarget>;

  /**
   * Says which SKU a 3DAPI order line is, for `getOrderStatus`. 3DAPI order
   * lines carry a quote and materials but no id of yours, so without this a
   * line is reported under the placeholder SKU id `3dapi-item-<line id>`.
   * See `dapiSkuIdsFrom`.
   */
  resolveSkuId?(line: DapiOrderLineIdentity): Promise<string | null>;

  /**
   * Places nothing at 3DAPI. 3DAPI has no draft order: a wallet order is paid
   * and sent to production as it is created. So with this on, `submitOrder`
   * checks the address and the SKU mappings, calls nothing, and reports each
   * line as "held" with no external order id. To release a held order, submit
   * it again with this off. Defaults to false.
   */
  holdOrders?: boolean;

  /** Sends `use_sample_credit: true`, so 3DAPI spends sample credit before the wallet balance. 3DAPI applies it only to orders shipped to the account's own country. */
  useSampleCredit?: boolean;

  /** The webhook endpoint's signing secret (`whsec_...`), shown once when the endpoint is created in the 3DAPI dashboard. */
  webhookSecret?: string;
  /** Replaces the built-in check. Receives the same combined `signature` string `handleWebhookEvent` does. */
  verifyWebhookSignature?(rawBody: string | Buffer, signature: string): boolean | Promise<boolean>;
  /** How far a delivery's timestamp may be from this server's clock. Defaults to 300, 3DAPI's documented limit. */
  webhookToleranceSeconds?: number;
  /** Where handled event ids are kept so a retried delivery is not handled twice. Defaults to an in-memory store. */
  webhookEventStore?: DapiWebhookEventStore;
  /** Called with each verified event that was not handled before. */
  onWebhookEvent?(event: DapiWebhookEvent): void | Promise<void>;
  /** The clock, in milliseconds. For tests. */
  now?(): number;
}

function lineMaterialIds(item: DapiOrderItem): string[] {
  const slots = [...(item.material_slots ?? [])].sort((a, b) => a.slot - b.slot);
  const refs = slots.length > 0 ? slots.map((s) => s.material) : (item.materials ?? []);
  return refs.map((m) => m.id).filter((id): id is string => typeof id === "string");
}

/**
 * A FulfillmentAdapter that orders prints from 3DAPI as an integrator in
 * wallet mode: the store has already been paid at its own checkout and pays
 * 3DAPI the production price plus shipping from its 3DAPI wallet.
 *
 * `submitOrder` places one 3DAPI order for the lines it is given, with the
 * Mercatus order id as the order's `reference`. Before ordering it asks 3DAPI
 * for orders with that reference and returns the existing one if there is one
 * that is not cancelled, so submitting an order again never orders twice. The
 * `Idempotency-Key` is derived from the same reference, which covers two
 * submissions racing each other. After a 5xx from 3DAPI the next attempt makes
 * the same check and, finding no order, uses a new key.
 *
 * `getOrderStatus` finds the order by its reference. A 3DAPI order has one
 * status for all its lines, so every line reports the same status.
 *
 * Built from 3DAPI's published spec and never run against a live account.
 */
export function createDapiFulfillmentAdapter(config: DapiFulfillmentAdapterConfig): FulfillmentAdapter {
  const client =
    config.httpClient ??
    createDapiHttpClient({
      apiKey: config.apiKey,
      ...(config.baseUrl !== undefined ? { baseUrl: config.baseUrl } : {}),
      ...(config.fetchImpl !== undefined ? { fetchImpl: config.fetchImpl } : {}),
    });
  const eventStore = config.webhookEventStore ?? createInMemoryDapiWebhookEventStore();
  // Orders held by `holdOrders` exist nowhere else, so they are remembered here
  // for getOrderStatus. This is lost when the process restarts.
  const held = new Map<string, FulfillmentLineRecord[]>();
  // How many times placing an order for a reference ended in a 5xx, so the next
  // attempt uses a new idempotency key (see dapiIdempotencyKeyForOrder). Also
  // lost on restart: the first attempt after one gets the stored 5xx back once.
  const serverErrors = new Map<string, number>();

  const record = (orderId: string, skuId: string, order: DapiOrder): FulfillmentLineRecord => ({
    orderId,
    skuId,
    provider: DAPI_PROVIDER,
    externalOrderId: order.id,
    status: mapDapiOrderStatus(order.status),
    trackingNumber: order.shipping?.tracking_number ?? null,
    // 3DAPI's docs: "There is no tracking URL." The carrier name reaches the host through onWebhookEvent.
    trackingUrl: null,
  });

  /** The order that counts for a reference: the newest that is not cancelled, else the newest. 3DAPI lists newest first. */
  const pickOrder = (orders: DapiOrder[]): DapiOrder | undefined => orders.find((o) => o.status !== "cancelled") ?? orders[0];

  return {
    async submitOrder(input: SubmitFulfillmentOrderInput): Promise<FulfillmentLineRecord[]> {
      const recipient = input.recipient ? mapRecipientToDapi(input.recipient) : ((await config.resolveRecipient?.(input.orderId)) ?? { shipping_address: {}, customer: {} });
      const { shipping_address, customer } = assertShippableRecipient(recipient);

      const lines = [];
      for (const item of input.items) {
        const parsed = parseDapiCatalogTarget({ ...(await config.resolveCatalogTarget(item.skuId)) });
        if (!parsed.ok) throw new InvalidCatalogMappingError(item.skuId, DAPI_PROVIDER, parsed.reason);
        lines.push(toDapiOrderLine(parsed.target, item.quantity));
      }

      if (config.holdOrders) {
        const records = input.items.map((item): FulfillmentLineRecord => ({ orderId: input.orderId, skuId: item.skuId, provider: DAPI_PROVIDER, externalOrderId: null, status: "held", trackingNumber: null, trackingUrl: null }));
        held.set(input.orderId, records);
        return records;
      }

      const reference = dapiReferenceForOrder(input.orderId);
      const existing = await client.listOrdersByReference(reference);
      const live = existing.find((o) => o.status !== "cancelled");
      let order = live;
      if (!order) {
        try {
          order = await client.createOrder(
            { mode: "wallet", items: lines, shipping_address, customer, reference, ...(config.useSampleCredit ? { use_sample_credit: true } : {}) },
            dapiIdempotencyKeyForOrder(reference, existing.length, serverErrors.get(reference) ?? 0),
          );
        } catch (err) {
          if (err instanceof DapiApiError && err.status >= 500) serverErrors.set(reference, (serverErrors.get(reference) ?? 0) + 1);
          throw err;
        }
      }

      serverErrors.delete(reference);
      held.delete(input.orderId);
      return input.items.map((item) => record(input.orderId, item.skuId, order));
    },

    async getOrderStatus(orderId: string): Promise<FulfillmentLineRecord[]> {
      const listed = pickOrder(await client.listOrdersByReference(dapiReferenceForOrder(orderId)));
      if (!listed) return held.get(orderId) ?? [];
      // The list is asked for lines (`expand[]=items`); read the order itself if they are not there.
      const order = listed.items ? listed : ((await client.getOrder(listed.id)) ?? listed);

      const records: FulfillmentLineRecord[] = [];
      for (const item of order.items ?? []) {
        const skuId = await config.resolveSkuId?.({ orderId, quoteId: item.quote.id, materialIds: lineMaterialIds(item), quantity: item.quantity });
        records.push(record(orderId, skuId ?? `3dapi-item-${item.id}`, order));
      }
      return records;
    },

    /**
     * `signature` is `t=<X-Dapi-Webhook-Timestamp>,v1=<X-Dapi-Webhook-Signature>`,
     * which `dapiWebhookSignatureFromHeaders(request.headers)` builds. See webhook.ts.
     * A delivery whose event id was already handled returns without calling
     * `onWebhookEvent`. An event id is recorded only after `onWebhookEvent`
     * returns, so a delivery whose handler threw is handled again when 3DAPI retries it.
     */
    async handleWebhookEvent(rawBody: string | Buffer, signature: string): Promise<void> {
      if (config.verifyWebhookSignature) {
        if (!(await config.verifyWebhookSignature(rawBody, signature))) throw new DapiWebhookSignatureInvalidError();
      } else if (config.webhookSecret) {
        const parts = parseDapiWebhookSignature(signature);
        if (!parts) throw new DapiWebhookSignatureInvalidError();
        const check = verifyDapiSignature(config.webhookSecret, rawBody, parts, {
          ...(config.now ? { nowMs: config.now() } : {}),
          ...(config.webhookToleranceSeconds !== undefined ? { toleranceSeconds: config.webhookToleranceSeconds } : {}),
        });
        if (check === "bad_signature") throw new DapiWebhookSignatureInvalidError();
        if (check === "stale_timestamp") throw new DapiWebhookTimestampError();
      } else {
        throw new DapiWebhookSignatureNotConfiguredError();
      }

      const event = parseDapiWebhookPayload(rawBody);
      if (await eventStore.has(event.id)) return;
      await config.onWebhookEvent?.(event);
      await eventStore.add(event.id);
    },
  };
}

/**
 * A `resolveCatalogTarget` that reads stored mappings (see
 * @mercatus-liber/fulfillment's ProviderCatalogMappingRepository) and checks
 * each is a usable DapiCatalogTarget: a quote id, and either `materials` or
 * `useSuggestedMaterials: true`.
 */
export function dapiCatalogTargetsFrom(repository: ProviderCatalogMappingRepository): (skuId: string) => Promise<DapiCatalogTarget> {
  return async (skuId) => {
    const parsed = parseDapiCatalogTarget(await requireCatalogTarget(repository, skuId, DAPI_PROVIDER));
    if (!parsed.ok) throw new InvalidCatalogMappingError(skuId, DAPI_PROVIDER, parsed.reason);
    return parsed.target;
  };
}

/**
 * A `resolveSkuId` that reads stored mappings backwards: the SKU whose mapping
 * names the line's quote. When several SKUs share a quote, the one whose
 * listed materials match the line's wins, then the first by SKU id. Two SKUs
 * mapped to the same quote and the same materials cannot be told apart.
 */
export function dapiSkuIdsFrom(repository: ProviderCatalogMappingRepository): (line: DapiOrderLineIdentity) => Promise<string | null> {
  return async (line) => {
    const candidates = (await repository.list(DAPI_PROVIDER)).filter((m) => m.target.quoteId === line.quoteId);
    if (candidates.length <= 1) return candidates[0]?.skuId ?? null;
    const wanted = line.materialIds.join(",");
    const exact = candidates.find((m) => {
      const parsed = parseDapiCatalogTarget(m.target);
      const materials = parsed.ok ? parsed.target.materials : undefined;
      if (!materials) return false;
      const ids = materials.every((x) => typeof x === "string") ? (materials as string[]) : [...(materials as { slot: number; material: string }[])].sort((a, b) => a.slot - b.slot).map((x) => x.material);
      return ids.join(",") === wanted;
    });
    return (exact ?? candidates[0]!).skuId;
  };
}

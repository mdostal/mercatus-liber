import type {
  FulfillmentAdapter,
  FulfillmentLineRecord,
  FulfillmentProviderKey,
  OrderLookup,
} from "./types.js";
import type { FulfillmentRoutingRepository } from "./routing-repository.js";

export class OrderNotFoundForFulfillmentError extends Error {
  constructor(orderId: string) {
    super(`Order not found for fulfillment: ${orderId}`);
    this.name = "OrderNotFoundForFulfillmentError";
  }
}

export class NoAdapterForProviderError extends Error {
  constructor(provider: FulfillmentProviderKey) {
    super(`No FulfillmentAdapter configured for provider '${provider}'`);
    this.name = "NoAdapterForProviderError";
  }
}

/**
 * Thrown by markLineShipped when the sku's routed provider's adapter doesn't
 * support a direct, operator-driven status update (e.g. a real webhook-driven
 * provider, which receives status changes via handleWebhookEvent instead).
 */
export class ManualStatusUpdateNotSupportedError extends Error {
  constructor(provider: FulfillmentProviderKey) {
    super(`Provider '${provider}' does not support marking a line shipped directly -- it receives status updates via its own webhook.`);
    this.name = "ManualStatusUpdateNotSupportedError";
  }
}

interface MarksShipped {
  markShipped(
    orderId: string,
    skuId: string,
    tracking?: { trackingNumber?: string | null; trackingUrl?: string | null },
  ): Promise<FulfillmentLineRecord>;
}

/** Structural check, not an instanceof -- any adapter (manual or a future one) can offer this capability by shape alone. */
function supportsMarkShipped(adapter: FulfillmentAdapter): adapter is FulfillmentAdapter & MarksShipped {
  return typeof (adapter as Partial<MarksShipped>).markShipped === "function";
}

/**
 * The orchestration layer (subsystem 41) tying the FulfillmentAdapter
 * contract, the FulfillmentRoutingRepository, and orders (read via the
 * narrow OrderLookup interface) together into the operations an admin
 * surface needs (story fulfillment-02): list fulfillment records for an
 * order, route+submit an order's lines, and mark a line shipped/update
 * tracking. Mirrors internal-bi's createDefaultBiAdapter pattern: a plain
 * factory function closing over its injected structural dependencies, no
 * class, no hidden state beyond what those dependencies themselves hold.
 */
export interface FulfillmentService {
  /** Every provider's current records for an order's lines, aggregated across whichever adapters those lines are routed to. */
  listForOrder(orderId: string): Promise<FulfillmentLineRecord[]>;
  /** Groups an order's lines by their routed provider and submits each group to that provider's adapter. */
  submitOrder(orderId: string): Promise<FulfillmentLineRecord[]>;
  /** The operator-driven "mark shipped by hand" action -- only supported by adapters that expose it (see ManualFulfillmentAdapter). */
  markLineShipped(
    orderId: string,
    skuId: string,
    tracking?: { trackingNumber?: string | null; trackingUrl?: string | null },
  ): Promise<FulfillmentLineRecord>;
}

export function createFulfillmentService(deps: {
  orders: OrderLookup;
  routing: FulfillmentRoutingRepository;
  /** Keyed by provider key, e.g. `{ manual: createManualFulfillmentAdapter() }`. A SKU routed to a provider key with no entry here throws NoAdapterForProviderError. */
  adapters: Record<string, FulfillmentAdapter>;
}): FulfillmentService {
  const { orders, routing, adapters } = deps;

  function resolveAdapter(provider: FulfillmentProviderKey): FulfillmentAdapter {
    const adapter = adapters[provider];
    if (!adapter) throw new NoAdapterForProviderError(provider);
    return adapter;
  }

  return {
    async listForOrder(orderId: string): Promise<FulfillmentLineRecord[]> {
      const order = await orders.getOrder(orderId);
      if (!order) throw new OrderNotFoundForFulfillmentError(orderId);

      const providers = new Set<FulfillmentProviderKey>();
      for (const item of order.items) {
        providers.add(await routing.getProviderForSku(item.skuId));
      }

      const records: FulfillmentLineRecord[] = [];
      for (const provider of providers) {
        const adapter = adapters[provider];
        if (!adapter) continue; // an unconfigured provider simply has no records to report here, not a hard error for a read path
        records.push(...(await adapter.getOrderStatus(orderId)));
      }
      return records;
    },

    async submitOrder(orderId: string): Promise<FulfillmentLineRecord[]> {
      const order = await orders.getOrder(orderId);
      if (!order) throw new OrderNotFoundForFulfillmentError(orderId);

      const itemsByProvider = new Map<FulfillmentProviderKey, { skuId: string; quantity: number }[]>();
      for (const item of order.items) {
        const provider = await routing.getProviderForSku(item.skuId);
        const bucket = itemsByProvider.get(provider) ?? [];
        bucket.push({ skuId: item.skuId, quantity: item.quantity });
        itemsByProvider.set(provider, bucket);
      }

      const records: FulfillmentLineRecord[] = [];
      for (const [provider, items] of itemsByProvider) {
        const adapter = resolveAdapter(provider);
        records.push(...(await adapter.submitOrder({ orderId, items })));
      }
      return records;
    },

    async markLineShipped(orderId, skuId, tracking) {
      const provider = await routing.getProviderForSku(skuId);
      const adapter = resolveAdapter(provider);
      if (!supportsMarkShipped(adapter)) {
        throw new ManualStatusUpdateNotSupportedError(provider);
      }
      return adapter.markShipped(orderId, skuId, tracking);
    },
  };
}

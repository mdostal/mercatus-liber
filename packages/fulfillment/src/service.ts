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

/**
 * Thrown by `submitOrder` when one or more providers could not be submitted.
 * Every provider was still tried. `records` are the lines that are placed
 * (now or earlier); `failures` name each provider that failed and why.
 * Submitting the order again sends only the lines that have no record yet.
 */
export class PartialFulfillmentSubmitError extends Error {
  constructor(
    readonly orderId: string,
    readonly records: FulfillmentLineRecord[],
    readonly failures: { provider: FulfillmentProviderKey; error: unknown }[],
  ) {
    super(
      `Order ${orderId}: could not submit to ${failures.map((failure) => `"${failure.provider}"`).join(", ")}. ${records.length} line(s) are placed. First error: ${failures[0]!.error instanceof Error ? failures[0]!.error.message : String(failures[0]!.error)}`,
      { cause: failures[0]!.error },
    );
    this.name = "PartialFulfillmentSubmitError";
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
  /**
   * Groups an order's lines by their routed provider and submits each group to that provider's adapter.
   * A line the provider already has a live record for is not sent again. If any provider fails, the rest
   * are still submitted and a PartialFulfillmentSubmitError is thrown at the end.
   */
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

      const itemsByProvider = new Map<FulfillmentProviderKey, { skuId: string; quantity: number; lineId?: string }[]>();
      for (const item of order.items) {
        const provider = await routing.getProviderForSku(item.skuId);
        const bucket = itemsByProvider.get(provider) ?? [];
        bucket.push({ skuId: item.skuId, quantity: item.quantity, ...(item.lineId !== undefined ? { lineId: item.lineId } : {}) });
        itemsByProvider.set(provider, bucket);
      }

      // Real recipient, read straight off OrderLookup.getOrder()'s own
      // shippingInfo field (dp-01, epic 82) -- previously there was no
      // address anywhere on this path at all, so every adapter's
      // resolveRecipient-style bridge was the only way one could ever
      // arrive. Omitted entirely (not just undefined) when the order has
      // none, so an adapter's own `recipient?:` handling sees a real
      // absence rather than a present-but-empty object.
      const recipient = order.shippingInfo;

      // Every provider's adapter must exist before anything is sent.
      for (const provider of itemsByProvider.keys()) resolveAdapter(provider);

      const records: FulfillmentLineRecord[] = [];
      const failures: { provider: FulfillmentProviderKey; error: unknown }[] = [];
      for (const [provider, items] of itemsByProvider) {
        const adapter = resolveAdapter(provider);
        try {
          // A line this provider already has a record for is not sent again,
          // so an order whose submit half-failed can be submitted again
          // safely. A line the provider gave up on ("unfulfilled": cancelled
          // or rejected) is sent again.
          //
          // A line is matched to a record by line id when both have one. A
          // record with no line id (an adapter that does not report them, or
          // one made before lines had ids) covers every line of its SKU.
          const live = (await adapter.getOrderStatus(orderId)).filter((record) => record.status !== "unfulfilled");
          const placedFor = (item: { skuId: string; lineId?: string }): FulfillmentLineRecord | undefined =>
            (item.lineId !== undefined ? live.find((record) => record.lineId === item.lineId) : undefined) ??
            live.find((record) => record.skuId === item.skuId && (record.lineId === undefined || item.lineId === undefined));
          const missing = items.filter((item) => !placedFor(item));
          records.push(...items.filter((item) => placedFor(item)).map((item) => placedFor(item)!));
          if (missing.length > 0) records.push(...(await adapter.submitOrder({ orderId, items: missing, ...(recipient ? { recipient } : {}) })));
        } catch (error) {
          // One provider failing does not stop the others being submitted.
          failures.push({ provider, error });
        }
      }
      if (failures.length > 0) throw new PartialFulfillmentSubmitError(orderId, records, failures);
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

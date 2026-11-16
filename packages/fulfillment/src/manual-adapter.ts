import {
  FulfillmentLineNotFoundError,
  MANUAL_FULFILLMENT_PROVIDER,
  type FulfillmentAdapter,
  type FulfillmentLineRecord,
  type SubmitFulfillmentOrderInput,
} from "./types.js";

/**
 * The manual provider's own extra capability, on top of the generic
 * FulfillmentAdapter contract -- the operator-driven "mark shipped by hand"
 * action, the only way a manual-provider line's status ever changes after
 * submitOrder, since (unlike a real POD provider) no external system exists
 * to push a webhook for it. FulfillmentService (service.ts) depends on this
 * only structurally, via a narrow runtime check -- not every FulfillmentAdapter
 * needs to support it (a webhook-driven provider updates status via
 * handleWebhookEvent instead).
 */
export interface ManualFulfillmentAdapter extends FulfillmentAdapter {
  markShipped(
    orderId: string,
    skuId: string,
    tracking?: { trackingNumber?: string | null; trackingUrl?: string | null },
  ): Promise<FulfillmentLineRecord>;
  /**
   * Puts a shipped line back to "submitted" and clears its tracking, for a
   * label that was voided before the parcel left. Does nothing to a line that
   * is not "shipped".
   */
  markNotShipped(orderId: string, skuId: string): Promise<FulfillmentLineRecord>;
}

/**
 * Zero-infra default reference implementation (design-discussion.md §1d) --
 * models exactly today's real *implicit* behavior across every shop built on
 * this framework so far: an operator fulfills a line by hand and marks it
 * shipped. Needed regardless of whether any real POD adapter ever gets built
 * (epics 42/43), and the permanent fallback for self-fulfilled SKUs even
 * after one does.
 *
 * submitOrder creates one FulfillmentLineRecord per line with status
 * "submitted" -- meaning "created and awaiting manual fulfillment," not
 * "sent to an external system" (there is nothing external to submit to).
 * getOrderStatus reads back exactly what submitOrder created/markShipped
 * last updated for that order -- this adapter is its own source of truth,
 * kept in a ManualFulfillmentRecordStore (in memory unless one is passed).
 * No handleWebhookEvent -- no external system sends webhooks to a manual
 * adapter.
 */
/**
 * Where the manual adapter keeps its line records. They are the only place a
 * self-shipped line's status and tracking number live, so a store on
 * serverless hosting needs a durable one (see adapter-postgres's
 * createPostgresManualFulfillmentRecordStore): the default is in memory and
 * is lost on a restart and not shared between instances.
 */
export interface ManualFulfillmentRecordStore {
  /** An order's records, in the order they were first saved. */
  list(orderId: string): Promise<FulfillmentLineRecord[]>;
  /** Inserts each record, or replaces the one with the same orderId and skuId. */
  save(records: FulfillmentLineRecord[]): Promise<void>;
}

export function createInMemoryManualFulfillmentRecordStore(): ManualFulfillmentRecordStore {
  const recordsByOrder = new Map<string, FulfillmentLineRecord[]>();
  return {
    async list(orderId) {
      return (recordsByOrder.get(orderId) ?? []).map((record) => structuredClone(record));
    },
    async save(records) {
      for (const record of records) {
        const existing = recordsByOrder.get(record.orderId) ?? [];
        const index = existing.findIndex((candidate) => candidate.skuId === record.skuId);
        if (index === -1) existing.push(structuredClone(record));
        else existing[index] = structuredClone(record);
        recordsByOrder.set(record.orderId, existing);
      }
    },
  };
}

export function createManualFulfillmentAdapter(options: { store?: ManualFulfillmentRecordStore } = {}): ManualFulfillmentAdapter {
  const store = options.store ?? createInMemoryManualFulfillmentRecordStore();

  return {
    // `input.recipient` (dp-01, epic 82) is deliberately still ignored here,
    // same as today: an operator fulfilling by hand reads the real address
    // from the order itself (checkout-orders' own admin view), not from
    // this adapter's record -- there is nothing external for this
    // zero-infra default to ship a structured address to.
    //
    // A line that already has a record keeps it: submitting an order again
    // returns the existing record and does not put a shipped line back to
    // "submitted" or add a second record for it.
    async submitOrder(input: SubmitFulfillmentOrderInput): Promise<FulfillmentLineRecord[]> {
      const existing = new Map((await store.list(input.orderId)).map((record) => [record.skuId, record]));
      const created: FulfillmentLineRecord[] = [];
      const result: FulfillmentLineRecord[] = [];
      for (const item of input.items) {
        const known = existing.get(item.skuId);
        if (known) {
          result.push(known);
          continue;
        }
        const record: FulfillmentLineRecord = {
          orderId: input.orderId,
          skuId: item.skuId,
          provider: MANUAL_FULFILLMENT_PROVIDER,
          externalOrderId: null,
          // "submitted" here means "created and awaiting manual fulfillment" --
          // an operator marks it "shipped" by hand via markShipped below.
          status: "submitted",
          trackingNumber: null,
          trackingUrl: null,
        };
        existing.set(item.skuId, record);
        created.push(record);
        result.push(record);
      }
      if (created.length > 0) await store.save(created);
      return result.map((record) => structuredClone(record));
    },

    async getOrderStatus(orderId: string): Promise<FulfillmentLineRecord[]> {
      return store.list(orderId);
    },

    async markShipped(
      orderId: string,
      skuId: string,
      tracking?: { trackingNumber?: string | null; trackingUrl?: string | null },
    ): Promise<FulfillmentLineRecord> {
      const existing = (await store.list(orderId)).find((record) => record.skuId === skuId);
      if (!existing) {
        throw new FulfillmentLineNotFoundError(orderId, skuId);
      }

      const updated: FulfillmentLineRecord = {
        ...existing,
        status: "shipped",
        trackingNumber: tracking?.trackingNumber ?? existing.trackingNumber,
        trackingUrl: tracking?.trackingUrl ?? existing.trackingUrl,
      };
      await store.save([updated]);
      return structuredClone(updated);
    },

    async markNotShipped(orderId: string, skuId: string): Promise<FulfillmentLineRecord> {
      const existing = (await store.list(orderId)).find((record) => record.skuId === skuId);
      if (!existing) {
        throw new FulfillmentLineNotFoundError(orderId, skuId);
      }
      if (existing.status !== "shipped") return existing;
      const updated: FulfillmentLineRecord = { ...existing, status: "submitted", trackingNumber: null, trackingUrl: null };
      await store.save([updated]);
      return structuredClone(updated);
    },
  };
}

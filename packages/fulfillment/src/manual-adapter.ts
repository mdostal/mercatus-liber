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
 * an in-memory store scoped to this created instance's lifetime (mirrors
 * internal-bi's in-memory-repository.ts structuredClone-in/out discipline
 * so callers can never mutate stored state through a returned reference).
 * No handleWebhookEvent -- no external system sends webhooks to a manual
 * adapter.
 */
export function createManualFulfillmentAdapter(): ManualFulfillmentAdapter {
  const recordsByOrder = new Map<string, FulfillmentLineRecord[]>();

  return {
    async submitOrder(input: SubmitFulfillmentOrderInput): Promise<FulfillmentLineRecord[]> {
      const created: FulfillmentLineRecord[] = input.items.map((item) => ({
        orderId: input.orderId,
        skuId: item.skuId,
        provider: MANUAL_FULFILLMENT_PROVIDER,
        externalOrderId: null,
        // "submitted" here means "created and awaiting manual fulfillment" --
        // an operator marks it "shipped" by hand via markShipped below.
        status: "submitted",
        trackingNumber: null,
        trackingUrl: null,
      }));

      const existing = recordsByOrder.get(input.orderId) ?? [];
      recordsByOrder.set(
        input.orderId,
        [...existing, ...created].map((record) => structuredClone(record)),
      );

      return created.map((record) => structuredClone(record));
    },

    async getOrderStatus(orderId: string): Promise<FulfillmentLineRecord[]> {
      return (recordsByOrder.get(orderId) ?? []).map((record) => structuredClone(record));
    },

    async markShipped(
      orderId: string,
      skuId: string,
      tracking?: { trackingNumber?: string | null; trackingUrl?: string | null },
    ): Promise<FulfillmentLineRecord> {
      const records = recordsByOrder.get(orderId);
      const existing = records?.find((record) => record.skuId === skuId);
      if (!records || !existing) {
        throw new FulfillmentLineNotFoundError(orderId, skuId);
      }

      const updated: FulfillmentLineRecord = {
        ...existing,
        status: "shipped",
        trackingNumber: tracking?.trackingNumber ?? existing.trackingNumber,
        trackingUrl: tracking?.trackingUrl ?? existing.trackingUrl,
      };

      recordsByOrder.set(
        orderId,
        records.map((record) => (record.skuId === skuId ? structuredClone(updated) : record)),
      );

      return structuredClone(updated);
    },
  };
}

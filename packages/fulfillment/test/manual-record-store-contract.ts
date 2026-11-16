import { describe, expect, it } from "vitest";
import { createManualFulfillmentAdapter, type ManualFulfillmentRecordStore } from "../src/manual-adapter.js";

/** What every backend's manual fulfillment record store must do. `open` returns a store; calling it again returns a new one on the same data. */
export function describeManualRecordStoreContract(name: string, setup: () => Promise<{ open(): ManualFulfillmentRecordStore }>, options: { timeout?: number } = {}): void {
  describe(`${name}: manual fulfillment record store contract`, { timeout: options.timeout ?? 5_000 }, () => {
    const items = [{ skuId: "sku-b", quantity: 1 }, { skuId: "sku-a", quantity: 2 }];

    it("keeps a shipped line's tracking across adapter instances, in submit order", async () => {
      const backend = await setup();
      const first = createManualFulfillmentAdapter({ store: backend.open() });
      await first.submitOrder({ orderId: "order-1", items });
      await first.markShipped("order-1", "sku-a", { trackingNumber: "TRK1", trackingUrl: "https://track.example/TRK1" });

      // A new instance: a cold start, or another server.
      const second = createManualFulfillmentAdapter({ store: backend.open() });
      expect((await second.getOrderStatus("order-1")).map((r) => [r.skuId, r.status, r.trackingNumber, r.trackingUrl])).toEqual([
        ["sku-b", "submitted", null, null],
        ["sku-a", "shipped", "TRK1", "https://track.example/TRK1"],
      ]);
      expect(await second.getOrderStatus("order-2")).toEqual([]);
    });

    it("submitting again keeps what is there and adds only new lines", async () => {
      const adapter = createManualFulfillmentAdapter({ store: (await setup()).open() });
      await adapter.submitOrder({ orderId: "order-1", items });
      await adapter.markShipped("order-1", "sku-a", { trackingNumber: "TRK1" });
      const again = await adapter.submitOrder({ orderId: "order-1", items: [...items, { skuId: "sku-c", quantity: 1 }] });
      expect(again.map((r) => [r.skuId, r.status])).toEqual([["sku-b", "submitted"], ["sku-a", "shipped"], ["sku-c", "submitted"]]);
      expect(await adapter.getOrderStatus("order-1")).toHaveLength(3);
    });

    it("keeps two orders with the same SKU apart", async () => {
      const adapter = createManualFulfillmentAdapter({ store: (await setup()).open() });
      await adapter.submitOrder({ orderId: "order-1", items: [{ skuId: "sku-a", quantity: 1 }] });
      await adapter.submitOrder({ orderId: "order-2", items: [{ skuId: "sku-a", quantity: 1 }] });
      await adapter.markShipped("order-2", "sku-a", { trackingNumber: "TRK2" });
      expect((await adapter.getOrderStatus("order-1"))[0]!.status).toBe("submitted");
      expect((await adapter.getOrderStatus("order-2"))[0]!.trackingNumber).toBe("TRK2");
    });
  });
}

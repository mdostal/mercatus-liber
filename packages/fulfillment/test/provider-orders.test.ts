import { createInMemoryEventBus } from "@mercatus-liber/core";
import { describe, expect, it } from "vitest";
import {
  createInMemoryProviderOrderLinkRepository,
  createProviderOrderStatusRecorder,
  externalOrderIdsFrom,
  FULFILLMENT_ORDER_STATUS_CHANGED,
  withProviderOrderLinks,
  type FulfillmentOrderStatusChanged,
} from "../src/provider-orders.js";
import type { FulfillmentAdapter, FulfillmentLineRecord } from "../src/types.js";
import { describeProviderOrderLinkContract } from "./provider-order-links-contract.js";

describeProviderOrderLinkContract("in-memory", async () => {
  const repo = createInMemoryProviderOrderLinkRepository();
  return { open: () => repo };
});

function setup() {
  const links = createInMemoryProviderOrderLinkRepository();
  const events = createInMemoryEventBus();
  const published: FulfillmentOrderStatusChanged[] = [];
  events.subscribe<FulfillmentOrderStatusChanged>(FULFILLMENT_ORDER_STATUS_CHANGED, async (payload) => {
    published.push(payload);
  });
  return { links, events, published, recorder: createProviderOrderStatusRecorder({ links, events }) };
}

describe("createProviderOrderStatusRecorder", () => {
  it("publishes a linked order's new status with the store's order id", async () => {
    const { links, recorder, published } = setup();
    await links.link({ orderId: "order-1", provider: "slant3d", externalOrderId: "SL-1" });
    expect(await recorder.record("slant3d", { externalOrderId: "SL-1", status: "shipped", trackingNumber: "TRK1", carrier: null })).toBe("published");
    expect(published).toEqual([{ orderId: "order-1", provider: "slant3d", externalOrderId: "SL-1", status: "shipped", trackingNumber: "TRK1", carrier: null, previousStatus: null }]);
    expect((await links.findByExternalOrderId("slant3d", "SL-1"))!.status).toBe("shipped");
  });

  it("publishes once when the provider repeats itself", async () => {
    const { links, recorder, published } = setup();
    await links.link({ orderId: "order-1", provider: "slant3d", externalOrderId: "SL-1" });
    const update = { externalOrderId: "SL-1", status: "submitted" as const, trackingNumber: null, carrier: null };
    expect(await recorder.record("slant3d", update)).toBe("published");
    expect(await recorder.record("slant3d", update)).toBe("unchanged");
    expect(published).toHaveLength(1);
  });

  it("reports the previous status, and keeps tracking a later update leaves out", async () => {
    const { links, recorder, published } = setup();
    await links.link({ orderId: "order-1", provider: "3dapi", externalOrderId: "ord_1" });
    await recorder.record("3dapi", { externalOrderId: "ord_1", status: "shipped", trackingNumber: "TRK1", carrier: "DHL" });
    await recorder.record("3dapi", { externalOrderId: "ord_1", status: "delivered", trackingNumber: null, carrier: null });
    expect(published[1]).toMatchObject({ status: "delivered", previousStatus: "shipped", trackingNumber: "TRK1", carrier: "DHL" });
  });

  it("does not go back from delivered to shipped", async () => {
    const { links, recorder, published } = setup();
    await links.link({ orderId: "order-1", provider: "slant3d", externalOrderId: "SL-1" });
    await recorder.record("slant3d", { externalOrderId: "SL-1", status: "delivered", trackingNumber: null, carrier: null });
    expect(await recorder.record("slant3d", { externalOrderId: "SL-1", status: "shipped", trackingNumber: null, carrier: null })).toBe("unchanged");
    expect(published).toHaveLength(1);
  });

  it("publishes nothing for a provider order nobody linked", async () => {
    const { recorder, published } = setup();
    expect(await recorder.record("slant3d", { externalOrderId: "ghost", status: "shipped", trackingNumber: null, carrier: null })).toBe("unlinked");
    expect(published).toHaveLength(0);
  });

  it("links an unlinked order when the provider's payload names the store order", async () => {
    const { links, recorder, published } = setup();
    expect(await recorder.record("3dapi", { externalOrderId: "ord_9", orderId: "order-9", status: "shipped", trackingNumber: null, carrier: null })).toBe("published");
    expect(published[0]!.orderId).toBe("order-9");
    expect((await links.latestForOrder("order-9", "3dapi"))!.externalOrderId).toBe("ord_9");
  });

  it("trusts a stored link over the payload's order id", async () => {
    const { links, recorder, published } = setup();
    await links.link({ orderId: "order-1", provider: "3dapi", externalOrderId: "ord_1" });
    await recorder.record("3dapi", { externalOrderId: "ord_1", orderId: "someone-elses", status: "shipped", trackingNumber: null, carrier: null });
    expect(published[0]!.orderId).toBe("order-1");
  });

  it("publishes again on the provider's retry when a subscriber failed", async () => {
    const links = createInMemoryProviderOrderLinkRepository();
    const events = createInMemoryEventBus();
    let fail = true;
    let delivered = 0;
    events.subscribe(FULFILLMENT_ORDER_STATUS_CHANGED, async () => {
      if (fail) throw new Error("email down");
      delivered += 1;
    });
    const recorder = createProviderOrderStatusRecorder({ links, events });
    await links.link({ orderId: "order-1", provider: "slant3d", externalOrderId: "SL-1" });
    const update = { externalOrderId: "SL-1", status: "shipped" as const, trackingNumber: null, carrier: null };
    await expect(recorder.record("slant3d", update)).rejects.toThrow();
    fail = false;
    expect(await recorder.record("slant3d", update)).toBe("published");
    expect(delivered).toBe(1);
  });
});

describe("withProviderOrderLinks", () => {
  const record = (externalOrderId: string | null): FulfillmentLineRecord => ({ orderId: "order-1", skuId: "sku-1", provider: "slant3d", externalOrderId, status: "submitted", trackingNumber: null, trackingUrl: null });
  const adapter = (externalOrderId: string | null): FulfillmentAdapter => ({ submitOrder: async () => [record(externalOrderId)], getOrderStatus: async () => [] });

  it("links the provider order a submit returns, for later lookup", async () => {
    const links = createInMemoryProviderOrderLinkRepository();
    await withProviderOrderLinks(adapter("SL-1"), "slant3d", links).submitOrder({ orderId: "order-1", items: [] });
    expect(await externalOrderIdsFrom(links, "slant3d")("order-1")).toBe("SL-1");
    expect(await externalOrderIdsFrom(links, "slant3d")("order-2")).toBeNull();
  });

  it("stores nothing when the provider returned no order id", async () => {
    const links = createInMemoryProviderOrderLinkRepository();
    await withProviderOrderLinks(adapter(null), "slant3d", links).submitOrder({ orderId: "order-1", items: [] });
    expect(await links.latestForOrder("order-1", "slant3d")).toBeNull();
  });

  it("still returns the records when storing the link fails", async () => {
    const links = createInMemoryProviderOrderLinkRepository();
    links.link = async () => {
      throw new Error("db down");
    };
    const errors: unknown[] = [];
    const records = await withProviderOrderLinks(adapter("SL-1"), "slant3d", links, (err) => errors.push(err)).submitOrder({ orderId: "order-1", items: [] });
    expect(records).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });
});

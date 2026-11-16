import { createInMemoryEventBus } from "@mercatus-liber/core";
import { describe, expect, it } from "vitest";
import { createInMemoryProviderOrderLinkRepository, createProviderOrderStatusRecorder, FULFILLMENT_ORDER_STATUS_CHANGED, type FulfillmentOrderStatusChanged } from "../src/provider-orders.js";
import { recordSelfShipment, recordSelfShipmentVoided, selfShipmentLinkId } from "../src/self-shipments.js";

function setup() {
  const links = createInMemoryProviderOrderLinkRepository();
  const events = createInMemoryEventBus();
  const published: FulfillmentOrderStatusChanged[] = [];
  events.subscribe<FulfillmentOrderStatusChanged>(FULFILLMENT_ORDER_STATUS_CHANGED, async (payload) => {
    published.push(payload);
  });
  return { links, published, recorder: createProviderOrderStatusRecorder({ links, events }) };
}

describe("selfShipmentLinkId", () => {
  it("prefers the label id, then the tracking number, then the order and its lines", () => {
    expect(selfShipmentLinkId({ orderId: "o1", skuIds: ["b", "a"], trackingNumber: "TRK1", labelId: "tx-1" })).toBe("tx-1");
    expect(selfShipmentLinkId({ orderId: "o1", skuIds: ["b", "a"], trackingNumber: "TRK1", labelId: null })).toBe("TRK1");
    expect(selfShipmentLinkId({ orderId: "o1", skuIds: ["b", "a"], trackingNumber: " " })).toBe("order:o1:a,b");
  });
});

describe("recordSelfShipment", () => {
  it("publishes shipped for the manual provider with the parcel's lines, tracking and carrier", async () => {
    const { links, recorder, published } = setup();
    expect(await recordSelfShipment({ links, recorder, orderId: "o1", skuIds: ["sunglasses-blue", "print-dragon"], trackingNumber: "TRK1", carrier: "USPS", labelId: "tx-1" })).toBe("published");
    expect(published).toEqual([
      {
        changeId: '["manual","tx-1","shipped","TRK1","USPS"]',
        orderId: "o1",
        skuIds: ["sunglasses-blue", "print-dragon"],
        provider: "manual",
        externalOrderId: "tx-1",
        status: "shipped",
        trackingNumber: "TRK1",
        carrier: "USPS",
        previousStatus: null,
      },
    ]);
    expect(await links.listForOrder("o1", "manual")).toHaveLength(1);
  });

  it("publishes once when the same parcel is recorded twice", async () => {
    const { links, recorder, published } = setup();
    const parcel = { links, recorder, orderId: "o1", skuIds: ["a"], trackingNumber: "TRK1", carrier: "USPS", labelId: "tx-1" };
    await recordSelfShipment(parcel);
    expect(await recordSelfShipment(parcel)).toBe("unchanged");
    expect(published).toHaveLength(1);
  });

  it("publishes separately for two parcels of one order", async () => {
    const { links, recorder, published } = setup();
    await recordSelfShipment({ links, recorder, orderId: "o1", skuIds: ["a"], trackingNumber: "TRK1", labelId: "tx-1" });
    await recordSelfShipment({ links, recorder, orderId: "o1", skuIds: ["b"], trackingNumber: "TRK2", labelId: "tx-2" });
    expect(published.map((p) => [p.skuIds, p.trackingNumber])).toEqual([
      [["a"], "TRK1"],
      [["b"], "TRK2"],
    ]);
    expect(new Set(published.map((p) => p.changeId)).size).toBe(2);
  });

  it("links by tracking number without a label id; lines marked one at a time share the link and publish once", async () => {
    const { links, recorder, published } = setup();
    expect(await recordSelfShipment({ links, recorder, orderId: "o1", skuIds: ["a"], trackingNumber: "TRK1" })).toBe("published");
    expect(await recordSelfShipment({ links, recorder, orderId: "o1", skuIds: ["b"], trackingNumber: "TRK1" })).toBe("unchanged");
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ externalOrderId: "TRK1", skuIds: ["a"], carrier: null });
    expect((await links.findByExternalOrderId("manual", "TRK1"))!.skuIds).toEqual(["a", "b"]);

    // A later update for that parcel names both lines.
    await recorder.record("manual", { externalOrderId: "TRK1", status: "delivered", trackingNumber: null, carrier: null });
    expect(published[1]).toMatchObject({ status: "delivered", skuIds: ["a", "b"], trackingNumber: "TRK1" });
  });

  it("publishes for a line marked shipped with no tracking number at all", async () => {
    const { links, recorder, published } = setup();
    await recordSelfShipment({ links, recorder, orderId: "o1", skuIds: ["a"] });
    expect(published[0]).toMatchObject({ externalOrderId: "order:o1:a", status: "shipped", trackingNumber: null });
  });

  it("refuses a parcel with no lines", async () => {
    const { links, recorder } = setup();
    await expect(recordSelfShipment({ links, recorder, orderId: "o1", skuIds: [], trackingNumber: "TRK1" })).rejects.toThrow(/at least one/);
  });
});

describe("recordSelfShipmentVoided", () => {
  it("publishes a change back to submitted for the lines the label covered", async () => {
    const { links, recorder, published } = setup();
    await recordSelfShipment({ links, recorder, orderId: "o1", skuIds: ["a", "b"], trackingNumber: "TRK1", carrier: "USPS", labelId: "tx-1" });
    expect(await recordSelfShipmentVoided({ recorder, labelId: "tx-1" })).toBe("published");
    expect(published[1]).toMatchObject({ orderId: "o1", skuIds: ["a", "b"], provider: "manual", status: "submitted", previousStatus: "shipped", trackingNumber: "TRK1" });
    expect(published[1]!.changeId).not.toBe(published[0]!.changeId);
  });

  it("publishes nothing for a label nobody recorded", async () => {
    const { recorder, published } = setup();
    expect(await recordSelfShipmentVoided({ recorder, labelId: "tx-unknown" })).toBe("unlinked");
    expect(published).toHaveLength(0);
  });
});

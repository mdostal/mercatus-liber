import { describe, expect, it } from "vitest";
import { createInMemoryManualFulfillmentRecordStore, createManualFulfillmentAdapter } from "../src/manual-adapter.js";
import { createInMemoryFulfillmentRoutingRepository } from "../src/routing-repository.js";
import { createFulfillmentService, NoAdapterForProviderError, PartialFulfillmentSubmitError } from "../src/service.js";
import type { FulfillmentAdapter, FulfillmentLineRecord, SubmitFulfillmentOrderInput } from "../src/types.js";
import { describeManualRecordStoreContract } from "./manual-record-store-contract.js";

describeManualRecordStoreContract("in-memory", async () => {
  const store = createInMemoryManualFulfillmentRecordStore();
  return { open: () => store };
});

/** A provider that records what it was asked to submit and can be told to fail. */
function fakeProvider(provider: string) {
  const records: FulfillmentLineRecord[] = [];
  const submits: SubmitFulfillmentOrderInput[] = [];
  const state = { failSubmit: false, failStatus: false };
  const adapter: FulfillmentAdapter = {
    async submitOrder(input) {
      submits.push(input);
      if (state.failSubmit) throw new Error(`${provider} is down`);
      const created = input.items.map((item): FulfillmentLineRecord => ({ orderId: input.orderId, skuId: item.skuId, provider, externalOrderId: `${provider}-${records.length + 1}`, status: "submitted", trackingNumber: null, trackingUrl: null }));
      records.push(...created);
      return created;
    },
    async getOrderStatus(orderId) {
      if (state.failStatus) throw new Error(`${provider} status is down`);
      return records.filter((record) => record.orderId === orderId);
    },
  };
  return { adapter, records, submits, state };
}

async function setup() {
  const routing = createInMemoryFulfillmentRoutingRepository();
  await routing.setProviderForSku("tee", "printful");
  await routing.setProviderForSku("mug", "printful");
  await routing.setProviderForSku("dragon", "x3d");
  const printful = fakeProvider("printful");
  const x3d = fakeProvider("x3d");
  const order = { id: "order-1", items: [{ skuId: "tee", quantity: 1 }, { skuId: "dragon", quantity: 1 }, { skuId: "sticker", quantity: 2 }, { skuId: "mug", quantity: 1 }] };
  const service = createFulfillmentService({
    orders: { getOrder: async (id: string) => (id === order.id ? order : null) } as never,
    routing,
    adapters: { manual: createManualFulfillmentAdapter(), printful: printful.adapter, x3d: x3d.adapter },
  });
  return { service, printful, x3d, routing };
}

describe("submitOrder across several providers", () => {
  it("🔒 still submits the other providers when one fails, and says which failed", async () => {
    const { service, printful, x3d } = await setup();
    printful.state.failSubmit = true;
    const failure = await service.submitOrder("order-1").catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(PartialFulfillmentSubmitError);
    const partial = failure as PartialFulfillmentSubmitError;
    expect(partial.failures.map((f) => f.provider)).toEqual(["printful"]);
    expect(partial.records.map((r) => r.skuId).sort()).toEqual(["dragon", "sticker"]);
    expect(x3d.submits).toHaveLength(1);
  });

  it("🔒 a retry sends only what was not placed", async () => {
    const { service, printful, x3d } = await setup();
    printful.state.failSubmit = true;
    await service.submitOrder("order-1").catch(() => undefined);
    printful.state.failSubmit = false;

    const records = await service.submitOrder("order-1");
    expect(records.map((r) => r.skuId).sort()).toEqual(["dragon", "mug", "sticker", "tee"]);
    expect(x3d.submits).toHaveLength(1);
    expect(printful.submits.at(-1)!.items.map((i) => i.skuId)).toEqual(["tee", "mug"]);

    // A third submit sends nothing anywhere.
    await service.submitOrder("order-1");
    expect(x3d.submits).toHaveLength(1);
    expect(printful.submits).toHaveLength(2);
    expect((await service.listForOrder("order-1")).filter((r) => r.provider === "manual")).toHaveLength(1);
  });

  it("sends a line again once its provider gave up on it", async () => {
    const { service, x3d } = await setup();
    await service.submitOrder("order-1");
    x3d.records[0]!.status = "unfulfilled";
    await service.submitOrder("order-1");
    expect(x3d.submits).toHaveLength(2);
  });

  it("does not submit to a provider whose existing orders cannot be read", async () => {
    const { service, x3d } = await setup();
    x3d.state.failStatus = true;
    await expect(service.submitOrder("order-1")).rejects.toMatchObject({ name: "PartialFulfillmentSubmitError", failures: [{ provider: "x3d" }] });
    expect(x3d.submits).toHaveLength(0);
  });

  it("sends nothing at all when a line is routed to a provider with no adapter", async () => {
    const { service, routing, printful, x3d } = await setup();
    await routing.setProviderForSku("sticker", "nowhere");
    await expect(service.submitOrder("order-1")).rejects.toBeInstanceOf(NoAdapterForProviderError);
    expect(printful.submits.length + x3d.submits.length).toBe(0);
  });
});

describe("submitOrder with line ids", () => {
  it("passes line ids to the adapter and tells two lines of one SKU apart on a retry", async () => {
    const routing = createInMemoryFulfillmentRoutingRepository();
    await routing.setProviderForSku("art-box", "x3d");
    const submits: SubmitFulfillmentOrderInput[] = [];
    const records: FulfillmentLineRecord[] = [];
    let failSecond = true;
    const adapter: FulfillmentAdapter = {
      async submitOrder(input) {
        submits.push(input);
        const made: FulfillmentLineRecord[] = [];
        for (const item of input.items) {
          if (item.lineId === "line-2" && failSecond) break;
          made.push({ orderId: input.orderId, skuId: item.skuId, lineId: item.lineId!, provider: "x3d", externalOrderId: `X3D-${item.lineId}`, status: "submitted", trackingNumber: null, trackingUrl: null });
        }
        records.push(...made);
        return made;
      },
      getOrderStatus: async () => records,
    };
    const order = { id: "order-1", items: [{ skuId: "art-box", quantity: 1, lineId: "line-1" }, { skuId: "art-box", quantity: 1, lineId: "line-2" }] };
    const service = createFulfillmentService({ orders: { getOrder: async () => order } as never, routing, adapters: { manual: createManualFulfillmentAdapter(), x3d: adapter } });

    await service.submitOrder("order-1");
    expect(submits[0]!.items).toEqual(order.items);
    failSecond = false;
    const second = await service.submitOrder("order-1");
    // Only the line with no record is sent again, though both lines share a SKU.
    expect(submits[1]!.items).toEqual([{ skuId: "art-box", quantity: 1, lineId: "line-2" }]);
    expect(second.map((record) => record.lineId).sort()).toEqual(["line-1", "line-2"]);
  });
});

describe("markNotShipped", () => {
  it("puts a shipped line back to submitted without its tracking, and leaves other lines alone", async () => {
    const adapter = createManualFulfillmentAdapter();
    await adapter.submitOrder({ orderId: "order-1", items: [{ skuId: "a", quantity: 1 }, { skuId: "b", quantity: 1 }] });
    await adapter.markShipped("order-1", "a", { trackingNumber: "TRK1", trackingUrl: "https://track.example/TRK1" });
    await adapter.markShipped("order-1", "b", { trackingNumber: "TRK2" });
    expect(await adapter.markNotShipped("order-1", "a")).toMatchObject({ status: "submitted", trackingNumber: null, trackingUrl: null });
    expect((await adapter.getOrderStatus("order-1")).map((r) => [r.skuId, r.status, r.trackingNumber])).toEqual([["a", "submitted", null], ["b", "shipped", "TRK2"]]);
    // A line that is not shipped is returned as it is.
    expect(await adapter.markNotShipped("order-1", "a")).toMatchObject({ status: "submitted" });
    await expect(adapter.markNotShipped("order-1", "nope")).rejects.toThrow();
  });
});

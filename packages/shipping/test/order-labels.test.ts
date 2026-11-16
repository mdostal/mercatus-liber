import { describe, expect, it } from "vitest";
import { createOrderLabelService, LabelRecordedPartiallyError, orderShipToAddress } from "../src/order-labels.js";
import type { OrderShippingInfo, ShipmentRecorder } from "../src/order-labels.js";
import type { ShippingAdapter, ShippingAddress } from "../src/types.js";

const FROM: ShippingAddress = { name: "The Shop", street1: "1 Main St", city: "Austin", state: "TX", postalCode: "78701", country: "US" };
const SHIP_TO: OrderShippingInfo = { name: "A Buyer", address: "2 Oak Ave, Denver CO 80202", street1: "2 Oak Ave", city: "Denver", stateCode: "CO", postalCode: "80202", countryCode: "us" };
const LABEL = { labelUrl: "https://labels.example/l1.pdf", trackingNumber: "9400100000000000000000", trackingUrl: "https://track.example/9400", carrier: "USPS", labelId: "tx-1" };

function fakeAdapter(overrides: Partial<ShippingAdapter> = {}) {
  const calls = { getRates: [] as unknown[], buyLabel: [] as string[], voidLabel: [] as string[] };
  const adapter: ShippingAdapter = {
    async getRates(input) {
      calls.getRates.push(input);
      return { available: true, rates: [{ rateId: "r1", carrier: "USPS", serviceLevel: "Ground Advantage", amount: { amount: 512, currency: "USD" }, estimatedDays: 3 }] };
    },
    async buyLabel(rateId) {
      calls.buyLabel.push(rateId);
      return { purchased: true, label: LABEL };
    },
    async getTrackingStatus() {
      return { status: "unknown", lastUpdate: null, events: [] };
    },
    async voidLabel(labelId) {
      calls.voidLabel.push(labelId);
      return { voided: true, pending: true };
    },
    ...overrides,
  };
  return { adapter, calls };
}

function recorder(failOn?: string): ShipmentRecorder & { calls: unknown[][] } {
  const calls: unknown[][] = [];
  return {
    calls,
    async markLineShipped(orderId, skuId, tracking) {
      if (skuId === failOn) throw new Error("store write failed");
      calls.push([orderId, skuId, tracking]);
    },
  };
}

const orders = { async getOrder(id: string) { return id === "o1" ? { id, shippingInfo: SHIP_TO } : id === "o2" ? { id, shippingInfo: { name: "No Street", address: "somewhere" } } : null; } };

describe("orderShipToAddress", () => {
  it("builds a structured address and upper-cases the country", () => {
    expect(orderShipToAddress(SHIP_TO)).toEqual({ name: "A Buyer", street1: "2 Oak Ave", street2: null, city: "Denver", state: "CO", postalCode: "80202", country: "US", phone: null });
  });
  it("names the missing fields instead of guessing from the free-text address", () => {
    expect(orderShipToAddress({ name: "X", address: "free text only" })).toEqual({ missing: ["street1", "city", "stateCode", "postalCode", "countryCode"] });
    expect(orderShipToAddress(undefined)).toEqual({ missing: ["shippingInfo"] });
  });
});

describe("createOrderLabelService", () => {
  it("quotes from the store's address to the order's address", async () => {
    const { adapter, calls } = fakeAdapter();
    const service = createOrderLabelService({ adapter, fromAddress: FROM, orders, recorder: recorder() });
    const quote = await service.quote("o1", { weightOz: 6 });
    expect(quote.available).toBe(true);
    expect(calls.getRates[0]).toMatchObject({ fromAddress: FROM, toAddress: { city: "Denver", country: "US" }, parcel: { weightOz: 6 } });
  });

  it("refuses to quote an unknown order or one without a full address, without calling the provider", async () => {
    const { adapter, calls } = fakeAdapter();
    const service = createOrderLabelService({ adapter, fromAddress: FROM, orders, recorder: recorder() });
    expect(await service.quote("nope", { weightOz: 6 })).toMatchObject({ available: false, instructionsUrl: null });
    const partial = await service.quote("o2", { weightOz: 6 });
    expect(partial.available).toBe(false);
    if (!partial.available) expect(partial.reason).toContain("street1");
    expect(calls.getRates).toHaveLength(0);
  });

  it("buys the label and records its tracking on every listed line", async () => {
    const { adapter } = fakeAdapter();
    const rec = recorder();
    const service = createOrderLabelService({ adapter, fromAddress: FROM, orders, recorder: rec });
    const result = await service.buy("o1", ["sunglasses-blue", "print-dragon"], "r1");
    expect(result).toEqual({ purchased: true, label: LABEL, recordedSkuIds: ["sunglasses-blue", "print-dragon"] });
    expect(rec.calls).toEqual([
      ["o1", "sunglasses-blue", { trackingNumber: LABEL.trackingNumber, trackingUrl: LABEL.trackingUrl }],
      ["o1", "print-dragon", { trackingNumber: LABEL.trackingNumber, trackingUrl: LABEL.trackingUrl }],
    ]);
  });

  it("passes a provider's refusal through and records nothing", async () => {
    const { adapter } = fakeAdapter({ buyLabel: async () => ({ purchased: false, reason: "rate expired", instructionsUrl: "https://x" }) });
    const rec = recorder();
    const service = createOrderLabelService({ adapter, fromAddress: FROM, orders, recorder: rec });
    expect(await service.buy("o1", ["a"], "r1")).toMatchObject({ purchased: false, reason: "rate expired" });
    expect(rec.calls).toHaveLength(0);
  });

  it("voids the label when recording fails before any line was written", async () => {
    const { adapter, calls } = fakeAdapter();
    const service = createOrderLabelService({ adapter, fromAddress: FROM, orders, recorder: recorder("a") });
    const err = await service.buy("o1", ["a"], "r1").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LabelRecordedPartiallyError);
    expect((err as LabelRecordedPartiallyError).voidResult).toEqual({ voided: true, pending: true });
    expect(calls.voidLabel).toEqual(["tx-1"]);
  });

  it("keeps the label when some lines were already recorded, and says so", async () => {
    const { adapter, calls } = fakeAdapter();
    const service = createOrderLabelService({ adapter, fromAddress: FROM, orders, recorder: recorder("b") });
    const err = (await service.buy("o1", ["a", "b"], "r1").catch((e: unknown) => e)) as LabelRecordedPartiallyError;
    expect(err.recordedSkuIds).toEqual(["a"]);
    expect(err.voidResult).toBeNull();
    expect(err.message).toContain("NOT voided");
    expect(calls.voidLabel).toHaveLength(0);
  });

  it("rejects a buy with no lines", async () => {
    const { adapter } = fakeAdapter();
    const service = createOrderLabelService({ adapter, fromAddress: FROM, orders, recorder: recorder() });
    await expect(service.buy("o1", [], "r1")).rejects.toThrow(/at least one/);
  });

  it("tells the recorder about the whole parcel once, after every line is marked", async () => {
    const { adapter } = fakeAdapter();
    const rec = recorder();
    const order: string[] = [];
    const parcels: unknown[] = [];
    const service = createOrderLabelService({
      adapter,
      fromAddress: FROM,
      orders,
      recorder: {
        markLineShipped: async (orderId, skuId, tracking) => {
          order.push(`line ${skuId}`);
          await rec.markLineShipped(orderId, skuId, tracking);
        },
        labelRecorded: async (shipment) => {
          order.push("parcel");
          parcels.push(shipment);
        },
      },
    });
    await service.buy("o1", ["a", "b"], "r1");
    expect(order).toEqual(["line a", "line b", "parcel"]);
    expect(parcels).toEqual([{ orderId: "o1", skuIds: ["a", "b"], label: LABEL }]);
  });

  it("does not tell the recorder about a parcel when the provider refused or a line failed", async () => {
    const parcels: unknown[] = [];
    const labelRecorded = async (shipment: unknown) => void parcels.push(shipment);
    const refused = fakeAdapter({ buyLabel: async () => ({ purchased: false, reason: "rate expired", instructionsUrl: "https://x" }) });
    await createOrderLabelService({ adapter: refused.adapter, fromAddress: FROM, orders, recorder: { ...recorder(), labelRecorded } }).buy("o1", ["a"], "r1");
    await createOrderLabelService({ adapter: fakeAdapter().adapter, fromAddress: FROM, orders, recorder: { ...recorder("b"), labelRecorded } })
      .buy("o1", ["a", "b"], "r1")
      .catch(() => {});
    expect(parcels).toHaveLength(0);
  });

  it("still reports the purchase when announcing the parcel fails, and does not void", async () => {
    const { adapter, calls } = fakeAdapter();
    const boom = new Error("event bus down");
    const service = createOrderLabelService({ adapter, fromAddress: FROM, orders, recorder: { ...recorder(), labelRecorded: async () => Promise.reject(boom) } });
    expect(await service.buy("o1", ["a"], "r1")).toEqual({ purchased: true, label: LABEL, recordedSkuIds: ["a"], labelRecordedError: boom });
    expect(calls.voidLabel).toHaveLength(0);
  });

  it("tells the recorder about a void only when the provider accepted it", async () => {
    const voided: string[] = [];
    const labelVoided = async (labelId: string) => void voided.push(labelId);
    const ok = createOrderLabelService({ adapter: fakeAdapter().adapter, fromAddress: FROM, orders, recorder: { ...recorder(), labelVoided } });
    expect(await ok.void("tx-1")).toEqual({ voided: true, pending: true });
    expect(voided).toEqual(["tx-1"]);

    const refusing = fakeAdapter({ voidLabel: async () => ({ voided: false, reason: "already used" }) });
    const no = createOrderLabelService({ adapter: refusing.adapter, fromAddress: FROM, orders, recorder: { ...recorder(), labelVoided } });
    expect(await no.void("tx-2")).toEqual({ voided: false, reason: "already used" });
    expect(voided).toEqual(["tx-1"]);
  });

  it("reports a void whose announcement failed as voided, with the error", async () => {
    const boom = new Error("event bus down");
    const service = createOrderLabelService({ adapter: fakeAdapter().adapter, fromAddress: FROM, orders, recorder: { ...recorder(), labelVoided: async () => Promise.reject(boom) } });
    expect(await service.void("tx-1")).toEqual({ voided: true, pending: true, labelVoidedError: boom });
  });

  it("void says plainly when the adapter can't void", async () => {
    const { adapter } = fakeAdapter({ voidLabel: undefined });
    const service = createOrderLabelService({ adapter, fromAddress: FROM, orders, recorder: recorder() });
    expect((await service.void("tx-1")).voided).toBe(false);
  });
});

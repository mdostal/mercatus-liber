import { describe, expect, it } from "vitest";
import { createDefaultBiAdapter, createInMemoryBiEventLogRepository } from "../src/index.js";

const usd = (amount: number) => ({ amount, currency: "USD" });
const order = (id: string, createdAt: string, items: [string, number, number][], status = "paid") => ({ id, createdAt, status, discountTotal: usd(0), items: items.map(([skuId, quantity, price]) => ({ skuId, quantity, priceAtPurchase: usd(price) })) });
const productOfSku: Record<string, string> = { "tee-m": "tee", "mat-1": "mat", "cap-1": "cap" };

function bi(orders: ReturnType<typeof order>[]) {
  return createDefaultBiAdapter({
    orders: { listOrders: async () => orders },
    skus: { getSku: async (id) => (productOfSku[id] ? { id, productId: productOfSku[id]!, price: usd(0) } : null), getProduct: async (id) => ({ id, title: id.toUpperCase() }) },
    promotions: { listPromotions: async () => [] },
    eventLog: createInMemoryBiEventLogRepository(),
    collections: {
      listCollections: async () => [
        { id: "frost", name: "Frost", kind: "sales", activeFrom: "2026-11-30T18:00:00Z", activeTo: "2026-12-07T18:00:00Z" },
        { id: "ember", name: "Ember", kind: "sales", activeFrom: "2026-12-07T18:00:00Z", activeTo: "2026-12-14T18:00:00Z" },
        { id: "hats", name: "Hats", kind: "category" },
      ],
      productIdsInCollection: async (id) => ({ frost: ["tee", "mat"], ember: ["tee"], hats: ["cap"] })[id] ?? [],
    },
  });
}

describe("sales by line", () => {
  it("counts each line's orders inside its own week, best first, with its best sellers", async () => {
    const report = await bi([
      order("o1", "2026-12-01T00:00:00Z", [["tee-m", 2, 3000], ["mat-1", 1, 2500]]),
      order("o2", "2026-12-08T00:00:00Z", [["tee-m", 1, 3000], ["cap-1", 1, 1500]]),
      order("o3", "2026-11-29T00:00:00Z", [["mat-1", 1, 2500]]),
      order("o4", "2026-12-02T00:00:00Z", [["tee-m", 5, 3000]], "cancelled"),
    ]).getSalesByCollection();
    expect(report.map((r) => [r.collectionId, r.orders, r.unitsSold, r.revenue.amount, r.productsSold, r.productCount])).toEqual([
      ["frost", 1, 3, 8500, 2, 2],
      ["ember", 1, 1, 3000, 1, 1],
      ["hats", 1, 1, 1500, 1, 1],
    ]);
    expect(report[0]!.topProducts).toEqual([
      { productId: "tee", title: "TEE", unitsSold: 2, revenue: usd(6000) },
      { productId: "mat", title: "MAT", unitsSold: 1, revenue: usd(2500) },
    ]);
    expect(report[0]!.period).toEqual({ from: "2026-11-30T18:00:00Z", to: "2026-12-07T18:00:00Z" });
  });

  it("filters by kind, uses a given range when not limited to each window, and is empty without collections", async () => {
    const orders = [order("o1", "2026-12-01T00:00:00Z", [["tee-m", 1, 3000]]), order("o2", "2026-12-08T00:00:00Z", [["tee-m", 1, 3000]])];
    const all = await bi(orders).getSalesByCollection({ kind: "sales", withinWindow: false });
    expect(all.map((r) => [r.collectionId, r.unitsSold])).toEqual([["frost", 2], ["ember", 2]]);
    const ranged = await bi(orders).getSalesByCollection({ kind: "sales", withinWindow: false, range: { from: "2026-12-05T00:00:00Z", to: "2026-12-31T00:00:00Z" } });
    expect(ranged.map((r) => r.unitsSold)).toEqual([1, 1]);
    const none = createDefaultBiAdapter({ orders: { listOrders: async () => orders }, skus: { getSku: async () => null, getProduct: async () => null }, promotions: { listPromotions: async () => [] }, eventLog: createInMemoryBiEventLogRepository() });
    expect(await none.getSalesByCollection()).toEqual([]);
  });
});

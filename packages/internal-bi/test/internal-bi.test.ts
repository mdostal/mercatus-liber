import { createInMemoryEventBus, type EventBus, type Money } from "@mercatus-liber/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryBiEventLogRepository } from "../src/in-memory-repository.js";
import { createDefaultBiAdapter } from "../src/service.js";
import { registerBiEventLogSync } from "../src/subscriber.js";
import type { OrderMetricsSource, PromotionMetricsSource, SkuMetricsSource } from "../src/types.js";

const USD = (amount: number): Money => ({ amount, currency: "USD" });

type SourceOrder = Awaited<ReturnType<OrderMetricsSource["listOrders"]>>[number];

function orderSource(orders: SourceOrder[]): OrderMetricsSource {
  return { async listOrders() { return orders; } };
}

function skuSource(
  skus: { id: string; productId: string; price: Money }[],
  products: { id: string; title: string }[],
): SkuMetricsSource {
  return {
    async getSku(id) { return skus.find((s) => s.id === id) ?? null; },
    async getProduct(id) { return products.find((p) => p.id === id) ?? null; },
  };
}

function promotionSource(
  promotions: { id: string; code: string | null; redemptionCount: number; usageLimit: number | null }[],
): PromotionMetricsSource {
  return { async listPromotions() { return promotions; } };
}

const emptyOrders = orderSource([]);
const emptySkus = skuSource([], []);
const emptyPromotions = promotionSource([]);

describe("createDefaultBiAdapter", () => {
  describe("getRevenueOverTime", () => {
    it("buckets 3 orders spanning 2 distinct days into one bucket per day with correctly summed (subtotal - discountTotal) revenue", async () => {
      const orders: SourceOrder[] = [
        {
          id: "order-1",
          status: "paid",
          createdAt: "2026-01-01T10:00:00.000Z",
          items: [{ skuId: "sku-1", quantity: 2, priceAtPurchase: USD(1000) }],
          discountTotal: USD(0),
        },
        {
          id: "order-2",
          status: "paid",
          createdAt: "2026-01-01T15:00:00.000Z",
          items: [{ skuId: "sku-2", quantity: 1, priceAtPurchase: USD(500) }],
          discountTotal: USD(100),
        },
        {
          id: "order-3",
          status: "fulfilled",
          createdAt: "2026-01-02T09:00:00.000Z",
          items: [{ skuId: "sku-1", quantity: 1, priceAtPurchase: USD(1000) }],
          discountTotal: USD(0),
        },
      ];

      const adapter = createDefaultBiAdapter({ orders: orderSource(orders), skus: emptySkus, promotions: emptyPromotions, eventLog: createInMemoryBiEventLogRepository() });

      const result = await adapter.getRevenueOverTime({ from: "2026-01-01T00:00:00.000Z", to: "2026-01-03T00:00:00.000Z" }, "day");

      expect(result).toEqual([
        { bucket: "2026-01-01", revenue: USD(2000 - 0 + (500 - 100)) },
        { bucket: "2026-01-02", revenue: USD(1000) },
      ]);
    });

    it("excludes cancelled orders and orders outside the range", async () => {
      const orders: SourceOrder[] = [
        { id: "in-range", status: "paid", createdAt: "2026-02-01T00:00:00.000Z", items: [{ skuId: "sku-1", quantity: 1, priceAtPurchase: USD(100) }], discountTotal: USD(0) },
        { id: "cancelled", status: "cancelled", createdAt: "2026-02-01T00:00:00.000Z", items: [{ skuId: "sku-1", quantity: 1, priceAtPurchase: USD(999) }], discountTotal: USD(0) },
        { id: "out-of-range", status: "paid", createdAt: "2026-03-01T00:00:00.000Z", items: [{ skuId: "sku-1", quantity: 1, priceAtPurchase: USD(999) }], discountTotal: USD(0) },
      ];

      const adapter = createDefaultBiAdapter({ orders: orderSource(orders), skus: emptySkus, promotions: emptyPromotions, eventLog: createInMemoryBiEventLogRepository() });
      const result = await adapter.getRevenueOverTime({ from: "2026-02-01T00:00:00.000Z", to: "2026-02-28T00:00:00.000Z" }, "day");

      expect(result).toEqual([{ bucket: "2026-02-01", revenue: USD(100) }]);
    });
  });

  describe("getOrderVolume", () => {
    it("with no range, total equals the full count and byStatus correctly groups all orders by status", async () => {
      const orders: SourceOrder[] = [
        { id: "o1", status: "paid", createdAt: "2026-01-01T00:00:00.000Z", items: [], discountTotal: USD(0) },
        { id: "o2", status: "paid", createdAt: "2026-01-02T00:00:00.000Z", items: [], discountTotal: USD(0) },
        { id: "o3", status: "cancelled", createdAt: "2026-01-03T00:00:00.000Z", items: [], discountTotal: USD(0) },
        { id: "o4", status: "pending_payment", createdAt: "2026-01-04T00:00:00.000Z", items: [], discountTotal: USD(0) },
      ];

      const adapter = createDefaultBiAdapter({ orders: orderSource(orders), skus: emptySkus, promotions: emptyPromotions, eventLog: createInMemoryBiEventLogRepository() });
      const result = await adapter.getOrderVolume();

      expect(result.total).toBe(4);
      expect(result.byStatus).toEqual({ paid: 2, cancelled: 1, pending_payment: 1 });
    });
  });

  describe("getTopProducts", () => {
    it("with limit 2, returns exactly 2 entries ranked by total revenue descending, titles resolved via the injected SkuMetricsSource", async () => {
      const orders: SourceOrder[] = [
        { id: "o1", status: "paid", createdAt: "2026-01-01T00:00:00.000Z", items: [{ skuId: "sku-a", quantity: 3, priceAtPurchase: USD(1000) }], discountTotal: USD(0) },
        { id: "o2", status: "paid", createdAt: "2026-01-01T00:00:00.000Z", items: [{ skuId: "sku-b", quantity: 1, priceAtPurchase: USD(5000) }], discountTotal: USD(0) },
        { id: "o3", status: "paid", createdAt: "2026-01-01T00:00:00.000Z", items: [{ skuId: "sku-c", quantity: 10, priceAtPurchase: USD(100) }], discountTotal: USD(0) },
      ];
      const skus = skuSource(
        [
          { id: "sku-a", productId: "prod-a", price: USD(1000) },
          { id: "sku-b", productId: "prod-b", price: USD(5000) },
          { id: "sku-c", productId: "prod-c", price: USD(100) },
        ],
        [
          { id: "prod-a", title: "Widget A" },
          { id: "prod-b", title: "Widget B" },
          { id: "prod-c", title: "Widget C" },
        ],
      );

      const adapter = createDefaultBiAdapter({ orders: orderSource(orders), skus, promotions: emptyPromotions, eventLog: createInMemoryBiEventLogRepository() });
      const result = await adapter.getTopProducts(undefined, 2);

      expect(result).toHaveLength(2);
      expect(result).toEqual([
        { productId: "prod-b", title: "Widget B", unitsSold: 1, revenue: USD(5000) },
        { productId: "prod-a", title: "Widget A", unitsSold: 3, revenue: USD(3000) },
      ]);
    });
  });

  describe("getConversionFunnel", () => {
    it("returns exact per-stage counts, in funnel order, from the event log", async () => {
      const eventLog = createInMemoryBiEventLogRepository();
      for (let i = 0; i < 5; i++) await eventLog.append({ id: `cart-${i}`, eventType: "cart.item.added", occurredAt: new Date().toISOString(), payload: {} });
      for (let i = 0; i < 3; i++) await eventLog.append({ id: `placed-${i}`, eventType: "checkout.order.placed", occurredAt: new Date().toISOString(), payload: {} });
      for (let i = 0; i < 2; i++) await eventLog.append({ id: `paid-${i}`, eventType: "checkout.order.paid", occurredAt: new Date().toISOString(), payload: {} });

      const adapter = createDefaultBiAdapter({ orders: emptyOrders, skus: emptySkus, promotions: emptyPromotions, eventLog });
      const result = await adapter.getConversionFunnel();

      expect(result).toEqual([
        { stage: "item_added", count: 5 },
        { stage: "checkout_started", count: 3 },
        { stage: "order_paid", count: 2 },
      ]);
    });
  });

  describe("getPromotionRedemptionRates", () => {
    it("returns both promotions with values matching the source exactly", async () => {
      const promotions = promotionSource([
        { id: "promo-1", code: "SAVE10", redemptionCount: 5, usageLimit: 100 },
        { id: "promo-2", code: null, redemptionCount: 20, usageLimit: null },
      ]);

      const adapter = createDefaultBiAdapter({ orders: emptyOrders, skus: emptySkus, promotions, eventLog: createInMemoryBiEventLogRepository() });
      const result = await adapter.getPromotionRedemptionRates();

      expect(result).toEqual([
        { promotionId: "promo-1", code: "SAVE10", redemptionCount: 5, usageLimit: 100 },
        { promotionId: "promo-2", code: null, redemptionCount: 20, usageLimit: null },
      ]);
    });
  });

  describe("getInventoryTurns", () => {
    it("always returns null, never throws, regardless of input", async () => {
      const adapter = createDefaultBiAdapter({ orders: emptyOrders, skus: emptySkus, promotions: emptyPromotions, eventLog: createInMemoryBiEventLogRepository() });

      await expect(adapter.getInventoryTurns()).resolves.toBeNull();
      await expect(adapter.getInventoryTurns({ from: "2026-01-01T00:00:00.000Z", to: "2026-01-31T00:00:00.000Z" })).resolves.toBeNull();
    });
  });
});

describe("registerBiEventLogSync", () => {
  let events: EventBus;

  beforeEach(() => {
    events = createInMemoryEventBus();
  });

  it("wired to a live EventBus, incrementing order_paid by exactly 1 when checkout.order.paid is published", async () => {
    const eventLog = createInMemoryBiEventLogRepository();
    registerBiEventLogSync({ events, eventLog });

    const adapter = createDefaultBiAdapter({ orders: emptyOrders, skus: emptySkus, promotions: emptyPromotions, eventLog });
    const before = await adapter.getConversionFunnel();
    const beforeCount = before.find((s) => s.stage === "order_paid")?.count ?? 0;

    await events.publish("checkout.order.paid", { orderId: "order-1" });

    const after = await adapter.getConversionFunnel();
    const afterCount = after.find((s) => s.stage === "order_paid")?.count ?? 0;

    expect(afterCount).toBe(beforeCount + 1);
  });

  it("records the funnel event with occurredAt stamped at subscribe-fire time, not from the event payload", async () => {
    const eventLog = createInMemoryBiEventLogRepository();
    registerBiEventLogSync({ events, eventLog });

    const before = Date.now();
    await events.publish("cart.item.added", { skuId: "sku-1", quantity: 1 });
    const after = Date.now();

    const [event] = await eventLog.list();
    expect(event).toBeDefined();
    expect(event!.eventType).toBe("cart.item.added");
    const occurredAtMs = new Date(event!.occurredAt).getTime();
    expect(occurredAtMs).toBeGreaterThanOrEqual(before);
    expect(occurredAtMs).toBeLessThanOrEqual(after);
  });

  it("subscribes to all four allow-listed topics: cart.item.added, checkout.order.placed, checkout.order.paid, promotions.redeemed", async () => {
    const eventLog = createInMemoryBiEventLogRepository();
    registerBiEventLogSync({ events, eventLog });

    await events.publish("cart.item.added", {});
    await events.publish("checkout.order.placed", {});
    await events.publish("checkout.order.paid", {});
    await events.publish("promotions.redeemed", {});

    const logged = await eventLog.list();
    expect(logged.map((e) => e.eventType).sort()).toEqual(
      ["cart.item.added", "checkout.order.placed", "checkout.order.paid", "promotions.redeemed"].sort(),
    );
  });
});

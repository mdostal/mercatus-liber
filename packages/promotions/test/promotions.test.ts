import { createInMemoryEventBus, type EventBus } from "@mercatus-liber/core";
import { beforeEach, describe, expect, it } from "vitest";
import { createInMemoryPromotionRepository } from "../src/in-memory-repository.js";
import { createPromotionsService, type PromotionsService } from "../src/service.js";
import type { CreatePromotionInput, PromotionRepository } from "../src/types.js";

function baseCartPromotion(overrides: Partial<CreatePromotionInput> = {}): CreatePromotionInput {
  return {
    code: null,
    kind: "fixed",
    scope: "cart",
    value: 0,
    currency: "USD",
    targetSkuIds: [],
    minCartAmount: null,
    startsAt: null,
    endsAt: null,
    usageLimit: null,
    ...overrides,
  };
}

describe("promotions service", () => {
  let repository: PromotionRepository;
  let events: EventBus;
  let promotions: PromotionsService;
  const redeemedEvents: unknown[] = [];

  beforeEach(() => {
    redeemedEvents.length = 0;
    repository = createInMemoryPromotionRepository();
    events = createInMemoryEventBus();
    events.subscribe("promotions.redeemed", async (p) => {
      redeemedEvents.push(p);
    });
    promotions = createPromotionsService({ repository, events });
  });

  describe("CRUD", () => {
    it("createPromotion assigns an id, defaults redemptionCount to 0 and status to active", async () => {
      const promotion = await promotions.createPromotion(baseCartPromotion({ code: "NEW" }));
      expect(promotion.id).toBeTruthy();
      expect(promotion.redemptionCount).toBe(0);
      expect(promotion.status).toBe("active");
    });

    it("getPromotion returns null for an unknown id", async () => {
      expect(await promotions.getPromotion("missing")).toBeNull();
    });

    it("getPromotion returns the created promotion by id", async () => {
      const created = await promotions.createPromotion(baseCartPromotion({ code: "GET1" }));
      expect(await promotions.getPromotion(created.id)).toEqual(created);
    });

    it("listPromotions returns every created promotion", async () => {
      const a = await promotions.createPromotion(baseCartPromotion({ code: "A1" }));
      const b = await promotions.createPromotion(baseCartPromotion({ code: "B1" }));
      const listed = await promotions.listPromotions();
      expect(listed.map((p) => p.id)).toEqual(expect.arrayContaining([a.id, b.id]));
    });

    it("deactivatePromotion flips status to inactive and returns null for an unknown id", async () => {
      const created = await promotions.createPromotion(baseCartPromotion({ code: "DEACT" }));
      const deactivated = await promotions.deactivatePromotion(created.id);
      expect(deactivated?.status).toBe("inactive");
      expect(await promotions.deactivatePromotion("missing")).toBeNull();
    });
  });

  describe("evaluate()", () => {
    // Acceptance criterion 1
    it("applies a cart-scope fixed promotion by code: discountTotal and total reflect the fixed amount", async () => {
      await promotions.createPromotion(
        baseCartPromotion({ code: "SAVE10", kind: "fixed", scope: "cart", value: 1000, currency: "USD" }),
      );

      const result = await promotions.evaluate({
        items: [{ skuId: "sku-x", quantity: 1, priceSnapshot: { amount: 5000, currency: "USD" } }],
        couponCode: "SAVE10",
      });

      expect(result.appliedCode).toBe("SAVE10");
      expect(result.rejectionReason).toBe("none");
      expect(result.discountTotal).toEqual({ amount: 1000, currency: "USD" });
      expect(result.total).toEqual({ amount: 4000, currency: "USD" });
    });

    // Acceptance criterion 2
    it("applies a product-scope percentage promotion only to targeted line items", async () => {
      await promotions.createPromotion(
        baseCartPromotion({
          code: "SKUA20",
          kind: "percentage",
          scope: "product",
          value: 20,
          targetSkuIds: ["sku-a"],
        }),
      );

      const result = await promotions.evaluate({
        items: [
          { skuId: "sku-a", quantity: 1, priceSnapshot: { amount: 1000, currency: "USD" } },
          { skuId: "sku-b", quantity: 1, priceSnapshot: { amount: 1000, currency: "USD" } },
        ],
        couponCode: "SKUA20",
      });

      expect(result.rejectionReason).toBe("none");
      const lineA = result.items.find((i) => i.skuId === "sku-a");
      const lineB = result.items.find((i) => i.skuId === "sku-b");
      expect(lineA?.unitAmount).toEqual({ amount: 800, currency: "USD" });
      expect(lineB?.unitAmount).toEqual({ amount: 1000, currency: "USD" });
    });

    // Acceptance criterion 3
    it("rejects an expired code with rejectionReason 'expired' and a zero, pass-through result", async () => {
      await promotions.createPromotion(
        baseCartPromotion({
          code: "EXPIRED10",
          kind: "fixed",
          scope: "cart",
          value: 1000,
          endsAt: "2020-01-01T00:00:00.000Z",
        }),
      );

      const result = await promotions.evaluate({
        items: [{ skuId: "sku-x", quantity: 1, priceSnapshot: { amount: 5000, currency: "USD" } }],
        couponCode: "EXPIRED10",
      });

      expect(result.appliedCode).toBeNull();
      expect(result.rejectionReason).toBe("expired");
      expect(result.discountTotal).toEqual({ amount: 0, currency: "USD" });
      expect(result.items).toEqual([{ skuId: "sku-x", quantity: 1, unitAmount: { amount: 5000, currency: "USD" } }]);
      expect(result.total).toEqual({ amount: 5000, currency: "USD" });
    });

    // Acceptance criterion 4
    it("rejects a code at its usage limit with rejectionReason 'usage_limit_reached'", async () => {
      const created = await promotions.createPromotion(
        baseCartPromotion({ code: "LIMITED", kind: "fixed", scope: "cart", value: 500, usageLimit: 2 }),
      );
      await repository.save({ ...created, redemptionCount: 2 });

      const result = await promotions.evaluate({
        items: [{ skuId: "sku-x", quantity: 1, priceSnapshot: { amount: 5000, currency: "USD" } }],
        couponCode: "LIMITED",
      });

      expect(result.rejectionReason).toBe("usage_limit_reached");
      expect(result.appliedCode).toBeNull();
    });

    it("rejects an unknown code with rejectionReason 'unknown_code'", async () => {
      const result = await promotions.evaluate({
        items: [{ skuId: "sku-x", quantity: 1, priceSnapshot: { amount: 5000, currency: "USD" } }],
        couponCode: "NOPE",
      });
      expect(result.rejectionReason).toBe("unknown_code");
      expect(result.appliedCode).toBeNull();
    });

    it("rejects a not-yet-active code with rejectionReason 'not_yet_active'", async () => {
      await promotions.createPromotion(
        baseCartPromotion({ code: "FUTURE", kind: "fixed", scope: "cart", value: 500, startsAt: "2999-01-01T00:00:00.000Z" }),
      );
      const result = await promotions.evaluate({
        items: [{ skuId: "sku-x", quantity: 1, priceSnapshot: { amount: 5000, currency: "USD" } }],
        couponCode: "FUTURE",
      });
      expect(result.rejectionReason).toBe("not_yet_active");
    });

    it("rejects a cart-scope code when the cart subtotal is below minCartAmount", async () => {
      await promotions.createPromotion(
        baseCartPromotion({
          code: "MIN100",
          kind: "fixed",
          scope: "cart",
          value: 500,
          minCartAmount: { amount: 10000, currency: "USD" },
        }),
      );
      const result = await promotions.evaluate({
        items: [{ skuId: "sku-x", quantity: 1, priceSnapshot: { amount: 5000, currency: "USD" } }],
        couponCode: "MIN100",
      });
      expect(result.rejectionReason).toBe("below_minimum");
    });

    it("treats a deactivated promotion's code as unknown", async () => {
      const created = await promotions.createPromotion(
        baseCartPromotion({ code: "GONE", kind: "fixed", scope: "cart", value: 500 }),
      );
      await promotions.deactivatePromotion(created.id);
      const result = await promotions.evaluate({
        items: [{ skuId: "sku-x", quantity: 1, priceSnapshot: { amount: 5000, currency: "USD" } }],
        couponCode: "GONE",
      });
      expect(result.rejectionReason).toBe("unknown_code");
    });

    it("never throws for an invalid/expired/exhausted code -- returns a normal result shape", async () => {
      await expect(
        promotions.evaluate({
          items: [{ skuId: "sku-x", quantity: 1, priceSnapshot: { amount: 5000, currency: "USD" } }],
          couponCode: "DOES-NOT-EXIST",
        }),
      ).resolves.toBeDefined();
    });

    it("with no couponCode, auto-applies the single highest-discountTotal-value eligible code===null promotion", async () => {
      await promotions.createPromotion(baseCartPromotion({ code: null, kind: "fixed", scope: "cart", value: 200 }));
      await promotions.createPromotion(baseCartPromotion({ code: null, kind: "fixed", scope: "cart", value: 900 }));

      const result = await promotions.evaluate({
        items: [{ skuId: "sku-x", quantity: 1, priceSnapshot: { amount: 5000, currency: "USD" } }],
        couponCode: null,
      });

      expect(result.discountTotal).toEqual({ amount: 900, currency: "USD" });
      expect(result.appliedCode).toBeNull();
      expect(result.appliedPromotionId).toBeTruthy();
    });

    it("with no couponCode and no eligible auto-applied promotion, applies zero discount with rejectionReason 'none'", async () => {
      const result = await promotions.evaluate({
        items: [{ skuId: "sku-x", quantity: 1, priceSnapshot: { amount: 5000, currency: "USD" } }],
      });
      expect(result.rejectionReason).toBe("none");
      expect(result.discountTotal).toEqual({ amount: 0, currency: "USD" });
      expect(result.appliedPromotionId).toBeNull();
    });
  });

  describe("checkout.order.paid redemption", () => {
    // Acceptance criterion 5
    it("increments redemptionCount by exactly 1 and publishes promotions.redeemed when checkout.order.paid fires for an order with a recorded applied promotion", async () => {
      const created = await promotions.createPromotion(
        baseCartPromotion({ code: "REDEEM1", kind: "fixed", scope: "cart", value: 1000 }),
      );
      const evaluation = await promotions.evaluate({
        items: [{ skuId: "sku-x", quantity: 1, priceSnapshot: { amount: 5000, currency: "USD" } }],
        couponCode: "REDEEM1",
      });
      expect(evaluation.appliedPromotionId).toBe(created.id);

      const orderId = "order-1";
      await promotions.recordAppliedPromotion({
        orderId,
        promotionId: evaluation.appliedPromotionId!,
        discountAmount: evaluation.discountTotal,
      });

      await events.publish("checkout.order.paid", { orderId });

      const updated = await promotions.getPromotion(created.id);
      expect(updated?.redemptionCount).toBe(1);
      expect(redeemedEvents).toEqual([
        { promotionId: created.id, orderId, discountAmount: { amount: 1000, currency: "USD" } },
      ]);
    });

    // Acceptance criterion 6
    it("is idempotent on a redelivered checkout.order.paid event -- does not increment redemptionCount twice", async () => {
      const created = await promotions.createPromotion(
        baseCartPromotion({ code: "REDEEM2", kind: "fixed", scope: "cart", value: 1000 }),
      );
      const evaluation = await promotions.evaluate({
        items: [{ skuId: "sku-x", quantity: 1, priceSnapshot: { amount: 5000, currency: "USD" } }],
        couponCode: "REDEEM2",
      });

      const orderId = "order-2";
      await promotions.recordAppliedPromotion({
        orderId,
        promotionId: evaluation.appliedPromotionId!,
        discountAmount: evaluation.discountTotal,
      });

      await events.publish("checkout.order.paid", { orderId });
      await events.publish("checkout.order.paid", { orderId });

      const updated = await promotions.getPromotion(created.id);
      expect(updated?.redemptionCount).toBe(1);
      expect(redeemedEvents).toHaveLength(1);
    });

    it("does nothing when checkout.order.paid fires for an order with no recorded applied promotion", async () => {
      await expect(events.publish("checkout.order.paid", { orderId: "no-promo-order" })).resolves.toBeUndefined();
      expect(redeemedEvents).toHaveLength(0);
    });
  });

  /**
   * commerce-gap-audit-3: a real, live-reachable finding -- print-shop and
   * Northline Home Tech both resolve to the same shared Postgres backend
   * (per lib/services.ts's resolveDemoPersistenceEnv), and until this fix
   * `evaluate()`'s coupon-code lookup carried no demo filter at all, so
   * print-shop's real "STITCH15" code (a `scope: "cart"`, unconditional,
   * unlimited-use 15%-off code -- see lib/seed.ts's seedPromotions) was
   * genuinely redeemable at Northline's checkout, and vice versa with
   * Northline's own "NORTHLINE15". Same bug class/fix shape as
   * @mercatus-liber/marketing-catalog's Category.demoSlug test (epic 61)
   * and @mercatus-liber/cms's Page.demoSlug test (epic 60).
   */
  describe("demo scoping", () => {
    it("evaluate()'s coupon lookup and listPromotions scope by demoSlug -- one demo's code is never redeemable at another demo's checkout", async () => {
      await promotions.createPromotion(
        baseCartPromotion({ code: "STITCH15", demoSlug: "print-shop", kind: "percentage", value: 15 }),
      );
      await promotions.createPromotion(
        baseCartPromotion({ code: "NORTHLINE15", demoSlug: "northline", kind: "percentage", value: 15 }),
      );

      const items = [{ skuId: "sku-x", quantity: 1, priceSnapshot: { amount: 10000, currency: "USD" } }];

      // The actual live bug: Northline's checkout accepting print-shop's code.
      const crossDemo = await promotions.evaluate({ items, couponCode: "STITCH15", demoSlug: "northline" });
      expect(crossDemo.rejectionReason).toBe("unknown_code");
      expect(crossDemo.discountTotal.amount).toBe(0);

      // The matching demo's own code still works.
      const sameDemo = await promotions.evaluate({ items, couponCode: "STITCH15", demoSlug: "print-shop" });
      expect(sameDemo.rejectionReason).toBe("none");
      expect(sameDemo.discountTotal.amount).toBe(1500);

      const printShopPromotions = await promotions.listPromotions({ demoSlug: "print-shop" });
      expect(printShopPromotions.map((p) => p.code)).toEqual(["STITCH15"]);

      // An unscoped evaluate()/listPromotions() call (no demoSlug) legitimately
      // still considers every demo's promotions -- backward compatible.
      const unscoped = await promotions.evaluate({ items, couponCode: "NORTHLINE15" });
      expect(unscoped.rejectionReason).toBe("none");
      const everything = await promotions.listPromotions();
      expect(everything.map((p) => p.code).sort()).toEqual(["NORTHLINE15", "STITCH15"]);
    });
  });
});

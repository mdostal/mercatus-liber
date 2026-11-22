import { createInMemoryEventBus } from "@mercatus-liber/core";
import { describe, expect, it } from "vitest";
import { createInMemoryPromotionRepository, createPromotionsService, spreadCartDiscount } from "../src/index.js";

const usd = (amount: number) => ({ amount, currency: "USD" });
const sumLines = (items: { unitAmount: { amount: number }; quantity: number }[]) => items.reduce((s, i) => s + i.unitAmount.amount * i.quantity, 0);

describe("cart-wide discounts reach the line prices", () => {
  it("10% off a $43.50 line charges $39.15 on the line itself (the shop's repro)", async () => {
    const service = createPromotionsService({ repository: createInMemoryPromotionRepository(), events: createInMemoryEventBus() });
    await service.createPromotion({ code: "TEN", kind: "percentage", scope: "cart", value: 10, currency: "USD", targetSkuIds: [], minCartAmount: null, startsAt: null, endsAt: null, usageLimit: null });
    const result = await service.evaluate({ items: [{ skuId: "a", quantity: 1, priceSnapshot: usd(4350) }], couponCode: "TEN" });
    expect(result.items[0]!.unitAmount.amount).toBe(3915);
    expect(result.discountTotal.amount).toBe(435);
    expect(sumLines(result.items)).toBe(result.total.amount);
  });

  it("always makes the lines add up to the total, never giving less than the discount, across awkward quantities", () => {
    const cases: [number, number][][] = [
      [[999, 3], [1, 7], [2500, 2]],
      [[333, 3]],
      [[100, 1], [100, 1], [100, 1]],
      [[5, 4], [7, 9]],
    ];
    for (const lines of cases) {
      const items = lines.map(([price, quantity], i) => ({ skuId: `s${i}`, quantity, priceSnapshot: usd(price) }));
      const subtotal = items.reduce((s, i) => s + i.priceSnapshot.amount * i.quantity, 0);
      for (const discount of [1, 17, Math.round(subtotal * 0.15), subtotal - 1, subtotal, subtotal + 500]) {
        const { items: out, discountTotal } = spreadCartDiscount(items, discount, "USD");
        expect(sumLines(out)).toBe(subtotal - discountTotal);
        expect(discountTotal).toBeGreaterThanOrEqual(Math.min(discount, subtotal));
        // The extra off is at most one cent per unit on one round.
        expect(discountTotal - Math.min(discount, subtotal)).toBeLessThan(items.reduce((s, i) => s + i.quantity, 0));
        for (const line of out) expect(line.unitAmount.amount).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

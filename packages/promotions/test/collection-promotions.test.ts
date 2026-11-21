import { createInMemoryEventBus } from "@mercatus-liber/core";
import { describe, expect, it } from "vitest";
import { createInMemoryPromotionRepository, createPromotionsService } from "../src/index.js";

const money = (amount: number) => ({ amount, currency: "USD" });
const items = [
  { skuId: "frost-tee", quantity: 1, priceSnapshot: money(3000) },
  { skuId: "frost-mat", quantity: 2, priceSnapshot: money(2000) },
  { skuId: "plain-cap", quantity: 1, priceSnapshot: money(1500) },
];
const membership: Record<string, string[]> = { "frost-tee": ["line-frost", "cat-shirts"], "frost-mat": ["line-frost"], "plain-cap": ["cat-hats"] };

describe("promotions on a line or category", () => {
  it("discounts only the cart's SKUs in the targeted line, read through the collections lookup", async () => {
    const service = createPromotionsService({ repository: createInMemoryPromotionRepository(), events: createInMemoryEventBus(), collections: { collectionIdsForSku: async (skuId) => membership[skuId] ?? [] } });
    await service.createPromotion({ code: "FROST20", kind: "percentage", scope: "product", value: 20, currency: "USD", targetSkuIds: [], targetCollectionIds: ["line-frost"], minCartAmount: null, startsAt: null, endsAt: null, usageLimit: null });
    const result = await service.evaluate({ items, couponCode: "FROST20" });
    expect(result.items.map((i) => [i.skuId, i.unitAmount.amount])).toEqual([["frost-tee", 2400], ["frost-mat", 1600], ["plain-cap", 1500]]);
    expect(result.discountTotal).toEqual(money(600 + 800));
    // The stored promotion is unchanged: membership is read each time.
    expect((await service.listPromotions())[0]!.targetSkuIds).toEqual([]);
  });

  it("works for auto-applied promotions and categories, and does nothing extra without a lookup", async () => {
    const repo = createInMemoryPromotionRepository();
    const auto = createPromotionsService({ repository: repo, events: createInMemoryEventBus(), collections: { collectionIdsForSku: async (skuId) => membership[skuId] ?? [] } });
    await auto.createPromotion({ code: null, kind: "fixed", scope: "product", value: 500, currency: "USD", targetSkuIds: [], targetCollectionIds: ["cat-hats"], minCartAmount: null, startsAt: null, endsAt: null, usageLimit: null });
    expect((await auto.evaluate({ items })).items.find((i) => i.skuId === "plain-cap")!.unitAmount.amount).toBe(1000);
    const noLookup = createPromotionsService({ repository: repo, events: createInMemoryEventBus() });
    expect((await noLookup.evaluate({ items })).discountTotal.amount).toBe(0);
  });
});

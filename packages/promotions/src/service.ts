import { randomUUID } from "node:crypto";
import type { EventBus, Money } from "@mercatus-liber/core";
import type {
  CreatePromotionInput,
  EvaluateInput,
  EvaluatedLineItem,
  Promotion,
  PromotionEvaluation,
  PromotionRepository,
  RejectionReason,
} from "./types.js";

/**
 * What was applied to a given order at evaluation time -- recorded by a
 * caller (checkout-orders' PricingAdjuster caller, per promo-02) once it
 * creates the order, since evaluate() itself is a pure computation with no
 * order concept. Also the exact promotions.redeemed event payload shape
 * (minus orderId, which the subscriber already has).
 */
export interface RecordAppliedPromotionInput {
  orderId: string;
  promotionId: string;
  discountAmount: Money;
}

export interface PromotionsService {
  createPromotion(input: CreatePromotionInput): Promise<Promotion>;
  getPromotion(id: string): Promise<Promotion | null>;
  listPromotions(): Promise<Promotion[]>;
  /** Merges the given fields into an existing promotion; null if no promotion has this id. Id/redemptionCount are never overwritten. */
  updatePromotion(id: string, input: Partial<CreatePromotionInput>): Promise<Promotion | null>;
  deactivatePromotion(id: string): Promise<Promotion | null>;
  /**
   * Pure computation over cart line items + an optional coupon code -- never
   * throws for an invalid/expired/exhausted code; "no discount applied" is a
   * normal result shape (see RejectionReason), not an error.
   */
  evaluate(input: EvaluateInput): Promise<PromotionEvaluation>;
  /**
   * Bookkeeping only, not part of evaluate()'s pure computation: a caller
   * that proceeds from an evaluation to an actual order must call this once
   * the order exists, so the checkout.order.paid subscriber below knows
   * which promotion (if any) to credit with the redemption. See
   * docs/subsystems/16-promotions.md and this story's risk section.
   */
  recordAppliedPromotion(input: RecordAppliedPromotionInput): Promise<void>;
}

/** Returns the reason a promotion is *not* currently redeemable, or null if it is. */
function ineligibilityReason(promotion: Promotion, now: Date): RejectionReason | null {
  if (promotion.status !== "active") return "unknown_code"; // deactivated behaves as if it doesn't exist
  if (promotion.startsAt && new Date(promotion.startsAt) > now) return "not_yet_active";
  if (promotion.endsAt && new Date(promotion.endsAt) < now) return "expired";
  if (promotion.usageLimit !== null && promotion.redemptionCount >= promotion.usageLimit) {
    return "usage_limit_reached";
  }
  return null;
}

function computeSubtotal(items: EvaluateInput["items"]): number {
  return items.reduce((sum, item) => sum + item.priceSnapshot.amount * item.quantity, 0);
}

function passThrough(items: EvaluateInput["items"], currency: string): EvaluatedLineItem[] {
  return items.map((item) => ({
    skuId: item.skuId,
    quantity: item.quantity,
    unitAmount: { amount: item.priceSnapshot.amount, currency },
  }));
}

/**
 * Applies a single promotion's discount to a cart's line items.
 *
 * Cart-scope discounts reduce the cart total but have no natural per-line
 * allocation, so per-line unitAmounts stay pass-through for cart scope --
 * only discountTotal/total reflect the discount. Product-scope discounts
 * adjust the unitAmount of each targeted line directly, leaving other lines
 * unadjusted.
 */
function applyDiscount(
  promotion: Promotion,
  items: EvaluateInput["items"],
  currency: string,
): { items: EvaluatedLineItem[]; discountTotal: number } {
  if (promotion.scope === "product") {
    let discountTotal = 0;
    const evaluated = items.map((item) => {
      if (!promotion.targetSkuIds.includes(item.skuId)) {
        return { skuId: item.skuId, quantity: item.quantity, unitAmount: { amount: item.priceSnapshot.amount, currency } };
      }
      const perUnitDiscount =
        promotion.kind === "percentage"
          ? Math.round((item.priceSnapshot.amount * promotion.value) / 100)
          : Math.min(promotion.value, item.priceSnapshot.amount);
      const unitAmount = Math.max(0, item.priceSnapshot.amount - perUnitDiscount);
      discountTotal += (item.priceSnapshot.amount - unitAmount) * item.quantity;
      return { skuId: item.skuId, quantity: item.quantity, unitAmount: { amount: unitAmount, currency } };
    });
    return { items: evaluated, discountTotal };
  }

  const subtotal = computeSubtotal(items);
  const discountTotal =
    promotion.kind === "percentage" ? Math.round((subtotal * promotion.value) / 100) : Math.min(promotion.value, subtotal);
  return { items: passThrough(items, currency), discountTotal };
}

function isEligible(promotion: Promotion, now: Date, subtotal: number): boolean {
  if (ineligibilityReason(promotion, now) !== null) return false;
  if (promotion.scope === "cart" && promotion.minCartAmount !== null && subtotal < promotion.minCartAmount.amount) {
    return false;
  }
  return true;
}

export function createPromotionsService(deps: { repository: PromotionRepository; events: EventBus }): PromotionsService {
  const { repository, events } = deps;

  // orderId -> the promotion/discount recorded (via recordAppliedPromotion)
  // as applied to that order. Consumed (deleted) on first redemption -- its
  // absence is the idempotency guard for a redelivered checkout.order.paid
  // event, mirroring checkout-orders' own order.status guard (service.ts
  // lines 45-58): there, a state transition already made is a no-op; here,
  // bookkeeping already consumed is a no-op.
  const appliedPromotions = new Map<string, RecordAppliedPromotionInput>();

  // React to completed purchases only -- never checkout.order.placed (a
  // merely-started checkout must not consume a limited coupon's usage slot).
  events.subscribe<{ orderId: string }>("checkout.order.paid", async ({ orderId }) => {
    const application = appliedPromotions.get(orderId);
    if (!application) return; // no promotion applied to this order, or already redeemed
    appliedPromotions.delete(orderId); // idempotent guard: a redelivery finds nothing here
    const promotion = await repository.get(application.promotionId);
    if (!promotion) return;
    await repository.save({ ...promotion, redemptionCount: promotion.redemptionCount + 1 });
    // Fire-and-forget: no subscriber depends on this yet (future internal-BI subsystem).
    await events.publish("promotions.redeemed", {
      promotionId: application.promotionId,
      orderId,
      discountAmount: application.discountAmount,
    });
  });

  return {
    async createPromotion(input: CreatePromotionInput): Promise<Promotion> {
      const promotion: Promotion = {
        ...input,
        id: randomUUID(),
        redemptionCount: 0,
        status: input.status ?? "active",
      };
      await repository.save(promotion);
      return promotion;
    },

    async getPromotion(id: string): Promise<Promotion | null> {
      return repository.get(id);
    },

    async listPromotions(): Promise<Promotion[]> {
      return repository.list();
    },

    async updatePromotion(id: string, input: Partial<CreatePromotionInput>): Promise<Promotion | null> {
      const existing = await repository.get(id);
      if (!existing) return null;
      const updated: Promotion = { ...existing, ...input, id: existing.id, redemptionCount: existing.redemptionCount };
      await repository.save(updated);
      return updated;
    },

    async deactivatePromotion(id: string): Promise<Promotion | null> {
      const promotion = await repository.get(id);
      if (!promotion) return null;
      const deactivated: Promotion = { ...promotion, status: "inactive" };
      await repository.save(deactivated);
      return deactivated;
    },

    async evaluate(input: EvaluateInput): Promise<PromotionEvaluation> {
      const { items, couponCode } = input;
      const now = new Date();
      const subtotal = computeSubtotal(items);
      const currency = items[0]?.priceSnapshot.currency ?? "USD";

      if (couponCode) {
        // Code lookup is case-sensitive exact match.
        const promotions = await repository.list();
        const promotion = promotions.find((p) => p.code === couponCode) ?? null;

        if (!promotion) {
          return {
            items: passThrough(items, currency),
            discountTotal: { amount: 0, currency },
            total: { amount: subtotal, currency },
            appliedCode: null,
            appliedPromotionId: null,
            rejectionReason: "unknown_code",
          };
        }

        const windowReason = ineligibilityReason(promotion, now);
        const belowMinimum =
          promotion.scope === "cart" && promotion.minCartAmount !== null && subtotal < promotion.minCartAmount.amount;
        const reason: RejectionReason | null = windowReason ?? (belowMinimum ? "below_minimum" : null);

        if (reason !== null) {
          return {
            items: passThrough(items, currency),
            discountTotal: { amount: 0, currency },
            total: { amount: subtotal, currency },
            appliedCode: null,
            appliedPromotionId: null,
            rejectionReason: reason,
          };
        }

        const applied = applyDiscount(promotion, items, currency);
        return {
          items: applied.items,
          discountTotal: { amount: applied.discountTotal, currency },
          total: { amount: subtotal - applied.discountTotal, currency },
          appliedCode: promotion.code,
          appliedPromotionId: promotion.id,
          rejectionReason: "none",
        };
      }

      // No code supplied: apply the single highest-discountTotal-value
      // eligible auto-applied (code === null) promotion, if any.
      const promotions = await repository.list();
      const candidates = promotions.filter((p) => p.code === null && isEligible(p, now, subtotal));
      let best: { promotion: Promotion; discountTotal: number } | null = null;
      for (const candidate of candidates) {
        const { discountTotal } = applyDiscount(candidate, items, currency);
        if (!best || discountTotal > best.discountTotal) {
          best = { promotion: candidate, discountTotal };
        }
      }

      if (!best) {
        return {
          items: passThrough(items, currency),
          discountTotal: { amount: 0, currency },
          total: { amount: subtotal, currency },
          appliedCode: null,
          appliedPromotionId: null,
          rejectionReason: "none",
        };
      }

      const applied = applyDiscount(best.promotion, items, currency);
      return {
        items: applied.items,
        discountTotal: { amount: applied.discountTotal, currency },
        total: { amount: subtotal - applied.discountTotal, currency },
        appliedCode: null,
        appliedPromotionId: best.promotion.id,
        rejectionReason: "none",
      };
    },

    async recordAppliedPromotion(input: RecordAppliedPromotionInput): Promise<void> {
      appliedPromotions.set(input.orderId, input);
    },
  };
}

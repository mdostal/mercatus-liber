import type { Money } from "@mercatus-liber/core";

export type PromotionKind = "percentage" | "fixed";
export type PromotionScope = "cart" | "product";
export type PromotionStatus = "active" | "inactive";

/**
 * A coupon-code or auto-applied discount rule. Product-scope promotions store
 * bare `skuId` strings in `targetSkuIds` -- matched against a cart's own line
 * items (also bare `skuId`s) at evaluation time, never resolved through the
 * catalog subsystem. See docs/subsystems/16-promotions.md.
 */
export interface Promotion {
  id: string;
  /** null = automatically applied to every eligible cart, no code needed. */
  code: string | null;
  kind: PromotionKind;
  scope: PromotionScope;
  /** percentage: 0-100; fixed: minor-unit amount in `currency`. */
  value: number;
  /** Only meaningful when kind === "fixed". */
  currency: string;
  /** Only meaningful when scope === "product"; empty = cart scope. */
  targetSkuIds: string[];
  /** Eligibility floor, cart scope only. */
  minCartAmount: Money | null;
  /** ISO 8601; null = active immediately. */
  startsAt: string | null;
  /** ISO 8601; null = no expiry. */
  endsAt: string | null;
  /** null = unlimited. */
  usageLimit: number | null;
  redemptionCount: number;
  status: PromotionStatus;
  /**
   * Which demo store this coupon/promotion belongs to. Optional/additive,
   * same shape and reason as `Page.demoSlug` (epic 60) and
   * `Category.demoSlug` (epic 61) -- a real gap found by
   * `commerce-gap-audit-3`: `PromotionRepository.list()`/
   * `PromotionsService.evaluate()`'s coupon-code lookup had no demo-scoping
   * concept at all, so under the shared Postgres backend print-shop and
   * Northline Home Tech both resolve to, either demo's coupon code was
   * genuinely redeemable at the OTHER demo's checkout (confirmed by direct
   * code inspection: both demos seed an unconditional, unscoped
   * `scope: "cart"` 15%-off code, and `evaluate()`'s `repository.list()`
   * carried no filter at all before this fix). `undefined`/missing behaves
   * exactly as before this fix (an unscoped call still sees every
   * promotion) -- only a `demoSlug`-scoped call is restricted.
   */
  demoSlug?: string;
}

/** Adapter pattern, as everywhere else in this codebase. */
export interface PromotionRepository {
  get(id: string): Promise<Promotion | null>;
  list(filter?: { demoSlug?: string }): Promise<Promotion[]>;
  save(promotion: Promotion): Promise<void>;
}

export interface EvaluateLineItem {
  skuId: string;
  quantity: number;
  priceSnapshot: Money;
}

export interface EvaluateInput {
  items: EvaluateLineItem[];
  /** A supplied code takes precedence over any auto-applied promotion. */
  couponCode?: string | null;
  /**
   * Restricts coupon-code lookup and auto-applied-promotion resolution to
   * this demo (see `Promotion.demoSlug`'s doc comment). Omitted/undefined
   * considers every promotion regardless of which demo it belongs to,
   * matching this method's pre-fix behavior.
   */
  demoSlug?: string;
}

/**
 * Why no discount was applied, or "none" when a discount *was* applied (or
 * none was ever attempted -- no code supplied and no eligible auto-applied
 * promotion existed). evaluate() never throws for any of these cases: an
 * invalid/expired/exhausted coupon code is expected shopper-facing UX, not an
 * error.
 */
export type RejectionReason =
  | "unknown_code"
  | "expired"
  | "not_yet_active"
  | "usage_limit_reached"
  | "below_minimum"
  | "none";

export interface EvaluatedLineItem {
  skuId: string;
  quantity: number;
  /** Original priceSnapshot.amount, discounted when a product-scope promotion targets this skuId. */
  unitAmount: Money;
}

export interface PromotionEvaluation {
  items: EvaluatedLineItem[];
  discountTotal: Money;
  /** Pre-discount subtotal minus discountTotal. */
  total: Money;
  appliedCode: string | null;
  appliedPromotionId: string | null;
  rejectionReason: RejectionReason;
}

/** Input to PromotionsService.createPromotion -- id/redemptionCount are always service-assigned. */
export type CreatePromotionInput = Omit<Promotion, "id" | "redemptionCount" | "status"> & {
  status?: PromotionStatus;
};

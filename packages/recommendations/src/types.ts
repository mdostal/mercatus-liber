export type RecommendationPlacement = "pdp" | "cart" | "both";

export type RecommendationRuleStatus = "active" | "inactive";

/**
 * An admin-authored, explicit mapping from one source product to an ordered
 * list of target products -- never inferred/computed (see
 * docs/subsystems/18-recommendations.md and design-discussion.md §3).
 * `label` is free text (no hardcoded vocabulary -- "Customers also bought",
 * "Frequently bought together", "You might also like", etc.), matching the
 * free-text-label posture already established by bundles' `BundleTier.label`.
 * Product ids are stored as bare strings and never validated against
 * catalog here -- this package is deliberately thinner than promotions/
 * bundles (see design-discussion.md §3 and the subsystem doc's open
 * question 1); a stale id just silently drops at render time, resolved by
 * the app-composition layer.
 */
export interface RecommendationRule {
  id: string;
  sourceProductId: string;
  label: string;
  placement: RecommendationPlacement;
  /** Ordered list of recommended product ids. Must contain at least one id, and must never include sourceProductId itself (see createRule/updateRule validation). */
  targetProductIds: string[];
  status: RecommendationRuleStatus;
  /**
   * Which demo store this rule belongs to. Optional/additive, same shape and
   * reason as `Page.demoSlug` (epic 60), `Category.demoSlug` (epic 61), and
   * `ServiceArea.demoSlug`/`Bundle.demoSlug` (commerce-gap-audit-3) -- a
   * real, disclosed gap found by `commerce-gap-audit-3` §13:
   * `RecommendationRepository.list()` had no demo-scoping concept at all, so
   * under the shared Postgres backend print-shop and Northline Home Tech
   * both resolve to, an operator in print-shop's own `/admin/recommendations`
   * list saw Northline's rules mixed into their own list (admin-only bleed
   * -- `getRecommendationsForProduct` is deliberately left unscoped since it
   * already resolves correctly by `productId`, which is itself already
   * demo-scoped on the PDP/cart). `undefined`/missing behaves exactly as
   * before this fix (an unscoped call still sees every rule).
   */
  demoSlug?: string;
}

/** Adapter pattern, as everywhere else in this codebase. */
export interface RecommendationRepository {
  get(id: string): Promise<RecommendationRule | null>;
  list(filter?: { demoSlug?: string }): Promise<RecommendationRule[]>;
  save(rule: RecommendationRule): Promise<void>;
}

/** Input to RecommendationsService.createRule -- id is always service-assigned; status defaults to "active". */
export type CreateRuleInput = Omit<RecommendationRule, "id" | "status"> & {
  status?: RecommendationRuleStatus;
};

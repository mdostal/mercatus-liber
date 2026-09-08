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
}

/** Adapter pattern, as everywhere else in this codebase. */
export interface RecommendationRepository {
  get(id: string): Promise<RecommendationRule | null>;
  list(): Promise<RecommendationRule[]>;
  save(rule: RecommendationRule): Promise<void>;
}

/** Input to RecommendationsService.createRule -- id is always service-assigned; status defaults to "active". */
export type CreateRuleInput = Omit<RecommendationRule, "id" | "status"> & {
  status?: RecommendationRuleStatus;
};

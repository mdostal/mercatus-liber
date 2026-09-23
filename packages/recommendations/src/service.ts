import { randomUUID } from "node:crypto";
import type {
  CreateRuleInput,
  RecommendationPlacement,
  RecommendationRepository,
  RecommendationRule,
} from "./types.js";

export interface RecommendationsService {
  createRule(input: CreateRuleInput): Promise<RecommendationRule>;
  getRule(id: string): Promise<RecommendationRule | null>;
  listRules(filter?: { demoSlug?: string }): Promise<RecommendationRule[]>;
  /** Merges the given fields into an existing rule; null if no rule has this id. Id is never overwritten. Re-validates the merged rule exactly as createRule does. */
  updateRule(id: string, input: Partial<CreateRuleInput>): Promise<RecommendationRule | null>;
  deactivateRule(id: string): Promise<RecommendationRule | null>;
  /**
   * The PDP/cart-facing read: active rules whose sourceProductId matches
   * `productId`, optionally filtered by `placement`. A rule scoped to
   * `"both"` matches every placement filter; a rule scoped to exactly one
   * placement only matches that same filter. When no placement filter is
   * given, every active matching rule is returned regardless of its own
   * placement. Deactivated rules are always excluded (they remain visible
   * via listRules/getRule for admin purposes).
   */
  getRecommendationsForProduct(
    productId: string,
    placement?: RecommendationPlacement,
  ): Promise<RecommendationRule[]>;
}

/**
 * Validates the write-time rules shared by createRule and updateRule so the
 * two never drift: at least one targetProductId, and sourceProductId must
 * never appear among its own targetProductIds (a product can't recommend
 * itself). Deliberately does NOT validate that any product id resolves in
 * catalog -- see design-discussion.md §3 and docs/subsystems/18-recommendations.md.
 */
function validateRule(rule: Pick<RecommendationRule, "sourceProductId" | "targetProductIds">): void {
  if (rule.targetProductIds.length === 0) {
    throw new Error("A recommendation rule must have at least one targetProductId");
  }
  if (rule.targetProductIds.includes(rule.sourceProductId)) {
    throw new Error(
      `A recommendation rule's sourceProductId ("${rule.sourceProductId}") cannot appear in its own targetProductIds`,
    );
  }
}

export function createRecommendationsService(deps: {
  repository: RecommendationRepository;
}): RecommendationsService {
  const { repository } = deps;

  return {
    async createRule(input: CreateRuleInput): Promise<RecommendationRule> {
      validateRule(input);
      const rule: RecommendationRule = {
        ...input,
        id: randomUUID(),
        status: input.status ?? "active",
      };
      await repository.save(rule);
      return rule;
    },

    async getRule(id: string): Promise<RecommendationRule | null> {
      return repository.get(id);
    },

    async listRules(filter?: { demoSlug?: string }): Promise<RecommendationRule[]> {
      return repository.list(filter);
    },

    async updateRule(id: string, input: Partial<CreateRuleInput>): Promise<RecommendationRule | null> {
      const existing = await repository.get(id);
      if (!existing) return null;
      const updated: RecommendationRule = { ...existing, ...input, id: existing.id };
      validateRule(updated);
      await repository.save(updated);
      return updated;
    },

    async deactivateRule(id: string): Promise<RecommendationRule | null> {
      const rule = await repository.get(id);
      if (!rule) return null;
      const deactivated: RecommendationRule = { ...rule, status: "inactive" };
      await repository.save(deactivated);
      return deactivated;
    },

    async getRecommendationsForProduct(
      productId: string,
      placement?: RecommendationPlacement,
    ): Promise<RecommendationRule[]> {
      const rules = await repository.list();
      return rules.filter((rule) => {
        if (rule.sourceProductId !== productId) return false;
        if (rule.status !== "active") return false;
        if (!placement) return true;
        return rule.placement === "both" || rule.placement === placement;
      });
    },
  };
}

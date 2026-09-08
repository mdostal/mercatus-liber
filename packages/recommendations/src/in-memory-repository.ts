import type { RecommendationRepository, RecommendationRule } from "./types.js";

/**
 * Default in-memory RecommendationRepository -- structured exactly like the
 * cart, promotions, and bundles subsystems' own in-memory repositories
 * (Map-backed, structuredClone in/out so callers can never mutate stored
 * state through a returned reference). A durable adapter (e.g. sqlite) is a
 * later, separate concern -- not required for this reference default.
 */
export function createInMemoryRecommendationRepository(): RecommendationRepository {
  const rules = new Map<string, RecommendationRule>();
  return {
    async get(id: string): Promise<RecommendationRule | null> {
      const rule = rules.get(id);
      return rule ? structuredClone(rule) : null;
    },
    async list(): Promise<RecommendationRule[]> {
      return Array.from(rules.values()).map((rule) => structuredClone(rule));
    },
    async save(rule: RecommendationRule): Promise<void> {
      rules.set(rule.id, structuredClone(rule));
    },
  };
}
